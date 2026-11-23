import "server-only";
import { randomBytes } from "node:crypto";
import { PUBLIC_KEY_PREFIX, apiError, API_ERROR_STATUS } from "@askwell/shared";
import type { ApiErrorCode, Plan, Project } from "@askwell/shared";
import { createOwnerClient } from "../supabase/owner";

/** The columns every route reads from `projects`. */
export const PROJECT_COLUMNS =
  "id, name, public_key, messages_used, period_start, created_at, owner_id";

type ProjectRow = {
  id: string;
  name: string;
  public_key: string;
  messages_used: number;
  period_start: string;
  created_at: string;
};

/** snake_case row to the API's `Project`. Leaves out `owner_id`. */
export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    publicKey: row.public_key,
    messagesUsed: row.messages_used,
    periodStart: row.period_start,
    createdAt: row.created_at,
  };
}

/** `pk_` + 24 random bytes, base64url. The server makes the key; the DB never does. */
export function generatePublicKey(): string {
  return PUBLIC_KEY_PREFIX + randomBytes(24).toString("base64url");
}

/**
 * The project with this id, or null if it doesn't exist or isn't the caller's.
 * Uses the owner client, so RLS does the scoping. Owner routes call this before any
 * service-client write (project.md §9).
 */
export async function getOwnedProject(id: string): Promise<Project | null> {
  const { data, error } = await createOwnerClient()
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getOwnedProject failed: ${error.message}`);
  return data ? toProject(data) : null;
}

/** The caller's plan, read on the server through the owner client. No row = free. */
export async function getPlan(userId: string): Promise<Plan> {
  const { data, error } = await createOwnerClient()
    .from("accounts")
    .select("plan")
    .eq("clerk_user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`getPlan failed: ${error.message}`);
  return data?.plan === "pro" ? "pro" : "free";
}

/** `{ error: { code, message } }` with the status for the code. */
export function errorResponse(code: ApiErrorCode, message: string): Response {
  return Response.json(apiError(code, message), { status: API_ERROR_STATUS[code] });
}
