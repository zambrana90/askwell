import "server-only";
import type { KnowledgeSource, Plan } from "@askwell/shared";
import { PLAN_LIMITS } from "@askwell/shared";
import { createServiceClient } from "../supabase/service";
import { KNOWLEDGE_BUCKET } from "./process";

/** An `uploading` source older than this is abandoned: finalize refuses it, upload-url reclaims it. */
export const STALE_UPLOAD_MS = 2 * 60 * 60 * 1000;

export const SOURCE_COLUMNS = "id, title, type, status, created_at";

/** Postgres `raise exception ... using errcode = 'P0001'` from reserve_knowledge_source. */
const PLAN_LIMIT_ERRCODE = "P0001";
const PROJECT_NOT_FOUND_ERRCODE = "P0002";

type SourceRow = { id: string; title: string; type: string; status: string; created_at: string };

/** snake_case row to the API's `KnowledgeSource`. Leaves out `storage_key` and `project_id`. */
export function toKnowledgeSource(row: SourceRow): KnowledgeSource {
  return {
    id: row.id,
    title: row.title,
    type: row.type as KnowledgeSource["type"],
    status: row.status as KnowledgeSource["status"],
    createdAt: row.created_at,
  };
}

export type ReserveResult =
  | { ok: true; source: SourceRow & { storage_key: string | null } }
  | { ok: false; reason: "plan_limit" | "not_found" };

/**
 * Reserves a source under the plan limit (atomic, in the database).
 * The caller MUST have checked ownership of `projectId` first (service client, project.md §9).
 * The limit comes from the server-side plan, never from the client.
 */
export async function reserveSource(
  projectId: string,
  title: string,
  type: string,
  plan: Plan,
): Promise<ReserveResult> {
  const { data, error } = await createServiceClient().rpc("reserve_knowledge_source", {
    p_project_id: projectId,
    p_title: title,
    p_type: type,
    p_max_sources: PLAN_LIMITS[plan].knowledgeSources,
  });
  if (error) {
    if (error.code === PLAN_LIMIT_ERRCODE && error.message === "plan_limit") {
      return { ok: false, reason: "plan_limit" };
    }
    if (error.code === PROJECT_NOT_FOUND_ERRCODE) return { ok: false, reason: "not_found" };
    throw new Error(`reserve_knowledge_source failed: ${error.message}`);
  }
  return { ok: true, source: data };
}

/**
 * Deletes this project's `uploading` sources older than STALE_UPLOAD_MS: Storage objects first,
 * then rows. If removing the files fails, the rows stay so the files are not orphaned; a later
 * call retries. Caller MUST have checked ownership of `projectId`.
 */
export async function reclaimStaleUploads(projectId: string): Promise<void> {
  const db = createServiceClient();
  const cutoff = new Date(Date.now() - STALE_UPLOAD_MS).toISOString();
  const { data: stale, error } = await db
    .from("knowledge_sources")
    .select("id, storage_key")
    .eq("project_id", projectId)
    .eq("status", "uploading")
    .lt("created_at", cutoff);
  if (error) throw new Error(`reclaimStaleUploads failed: ${error.message}`);
  if (!stale || stale.length === 0) return;

  const keys = stale.map((s) => s.storage_key).filter((k): k is string => !!k);
  if (keys.length > 0) {
    const { error: removeError } = await db.storage.from(KNOWLEDGE_BUCKET).remove(keys);
    if (removeError) throw new Error(`reclaimStaleUploads storage failed: ${removeError.message}`);
  }
  const { error: deleteError } = await db
    .from("knowledge_sources")
    .delete()
    .in("id", stale.map((s) => s.id));
  if (deleteError) throw new Error(`reclaimStaleUploads delete failed: ${deleteError.message}`);
}

/**
 * Removes a source: its Storage object (if any), then the row (chunks cascade).
 * Caller MUST have proved ownership (owner-client read, or getOwnedProject).
 */
export async function removeSource(sourceId: string, storageKey: string | null): Promise<void> {
  const db = createServiceClient();
  if (storageKey) {
    const { error } = await db.storage.from(KNOWLEDGE_BUCKET).remove([storageKey]);
    if (error) throw new Error(`removeSource storage failed: ${error.message}`);
  }
  const { error } = await db.from("knowledge_sources").delete().eq("id", sourceId);
  if (error) throw new Error(`removeSource failed: ${error.message}`);
}
