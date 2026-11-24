import "server-only";
import { MESSAGE_ROLES } from "@askwell/shared";
import type {
  ConversationListResponse,
  ConversationMessage,
  ConversationThreadResponse,
} from "@askwell/shared";
import { getOwnedProject } from "../projects/projects";
import { createOwnerClient } from "../supabase/owner";

/** Rows per request. Below the Data API's `max_rows` (1000) so a long thread is never cut off. */
const MESSAGE_PAGE_SIZE = 500;

/** Thrown when the project or conversation doesn't exist or isn't the caller's (RLS decides). */
export class NotFoundError extends Error {}

const toRole = (value: string): ConversationMessage["role"] =>
  (MESSAGE_ROLES as readonly string[]).includes(value) ? (value as ConversationMessage["role"]) : "bot";

/**
 * The newest 100 conversations of an owned project, with preview and message count.
 * Reads only through the owner client: `owner_activity` runs as the caller, so RLS scopes it.
 */
export async function listConversations(projectId: string): Promise<ConversationListResponse> {
  // A foreign or unknown project is a 404, not an empty list.
  if (!(await getOwnedProject(projectId))) throw new NotFoundError();

  const { data, error } = await createOwnerClient().rpc("owner_activity", { p_project_id: projectId });
  if (error) throw new Error(`owner_activity failed: ${error.message}`);
  return {
    conversations: data.map((r) => ({
      id: r.id,
      visitorId: r.visitor_id,
      preview: r.preview,
      messageCount: r.message_count,
      createdAt: r.created_at,
    })),
  };
}

/** One conversation and its messages, oldest first. Not visible under RLS = NotFoundError. */
export async function getThread(conversationId: string): Promise<ConversationThreadResponse> {
  const db = createOwnerClient();
  const { data: conversation, error } = await db
    .from("conversations")
    .select("id, visitor_id, created_at")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new Error(`conversation lookup failed: ${error.message}`);
  if (!conversation) throw new NotFoundError();

  // Read every page, oldest first (created_at, then id on every page), until a short page.
  const messages: { id: string; role: string; body: string; created_at: string }[] = [];
  for (let from = 0; ; from += MESSAGE_PAGE_SIZE) {
    const { data: page, error: messagesError } = await db
      .from("messages")
      .select("id, role, body, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + MESSAGE_PAGE_SIZE - 1);
    if (messagesError) throw new Error(`messages lookup failed: ${messagesError.message}`);
    messages.push(...page);
    if (page.length < MESSAGE_PAGE_SIZE) break;
  }

  return {
    conversation: { id: conversation.id, visitorId: conversation.visitor_id, createdAt: conversation.created_at },
    messages: messages.map((m) => ({ id: m.id, role: toRole(m.role), body: m.body, createdAt: m.created_at })),
  };
}
