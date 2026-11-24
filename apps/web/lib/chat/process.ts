import "server-only";
import {
  PLAN_LIMITS,
  widgetChatRequestSchema,
  type ApiErrorCode,
  type Plan,
  type WidgetChatResponse,
} from "@askwell/shared";
import { answerQuestion, MAX_HISTORY_MESSAGES, type HistoryMessage } from "../ai/answer";
import { embedQuery } from "../ai/embeddings";
import type { AiCall } from "../ai/trace";
import { protectChat } from "../security/arcjet";
import { createServiceClient } from "../supabase/service";
import { trackAiCalls, trackFirstChat, trackMessageBlocked } from "./track";

const MATCH_COUNT = 5;

export const FORBIDDEN_MESSAGE = "Sorry, I can't help with that.";

/** A failure with the API error code and a visitor-safe message. */
export class ChatFailure extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ChatFailure";
  }
}

/**
 * The chat flow (project.md §6.6), in order. Throws ChatFailure for every expected
 * failure; anything else the route turns into 500 `internal`.
 */
export async function processChat(request: Request): Promise<WidgetChatResponse> {
  // 1. Parse.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ChatFailure("validation_error", "Invalid request.");
  }
  const parsed = widgetChatRequestSchema.safeParse(raw);
  if (!parsed.success) throw new ChatFailure("validation_error", "Invalid request.");
  const { key, visitorId, conversationId, message } = parsed.data;

  // 2. Arcjet: nothing is counted or saved when it blocks.
  const verdict = await protectChat(request, { publicKey: key, message });
  if (verdict === "rate_limited") {
    trackMessageBlocked(key, "rate_limit");
    throw new ChatFailure("rate_limited", "Too many requests.");
  }
  if (verdict === "injection") {
    trackMessageBlocked(key, "injection");
    throw new ChatFailure("forbidden", FORBIDDEN_MESSAGE);
  }

  const db = createServiceClient();

  // 3. Resolve the project from the key only, then check the conversation belongs to it.
  const { data: project, error: projectError } = await db
    .from("projects")
    .select("id, owner_id, accounts(plan)")
    .eq("public_key", key)
    .maybeSingle();
  if (projectError) throw new Error(`project lookup failed: ${projectError.message}`);
  if (!project) throw new ChatFailure("not_found", "Unknown key.");

  if (conversationId) {
    const { data: conversation, error } = await db
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("project_id", project.id)
      .eq("visitor_id", visitorId)
      .maybeSingle();
    if (error) throw new Error(`conversation lookup failed: ${error.message}`);
    if (!conversation) throw new ChatFailure("not_found", "Unknown conversation.");
  }

  // 4. Plan from the server. A paused project (an extra after a downgrade) answers nothing:
  // 402 before anything is counted, saved or sent to OpenAI. Then count the message.
  const account = Array.isArray(project.accounts) ? project.accounts[0] : project.accounts;
  const plan: Plan = account?.plan === "pro" ? "pro" : "free";
  const { data: active, error: activeError } = await db.rpc("project_is_active", {
    p_project_id: project.id,
    p_max_projects: PLAN_LIMITS[plan].projects,
  });
  if (activeError) throw new Error(`project_is_active failed: ${activeError.message}`);
  if (!active) throw new ChatFailure("payment_required", "Chat is unavailable for this project.");
  const { data: counted, error: consumeError } = await db.rpc("consume_message", {
    p_project_id: project.id,
    p_limit: PLAN_LIMITS[plan].messagesPerMonth,
  });
  if (consumeError) throw new Error(`consume_message failed: ${consumeError.message}`);
  if (!counted) throw new ChatFailure("quota_exceeded", "Message limit reached.");

  // 9. Track (after the response). A new conversation has its id only once saved.
  const calls: AiCall[] = [];
  const onCall = (call: AiCall) => calls.push(call);
  let savedConversationId: string | undefined;
  try {
    // 5. Retrieve: top chunks of this project's ready sources, within the plan's source limit
    // (sources past it are paused and never used for answers).
    const embedding = await embedQuery(message, onCall);
    const { data: matches, error: matchError } = await db.rpc("match_chunks_active", {
      p_project_id: project.id,
      p_embedding: JSON.stringify(embedding),
      p_match_count: MATCH_COUNT,
      p_max_sources: PLAN_LIMITS[plan].knowledgeSources,
    });
    if (matchError) throw new Error(`match_chunks_active failed: ${matchError.message}`);
    const chunks = (matches ?? []).map((m) => m.content);

    // 6. History: the last 6 messages of this conversation, oldest first.
    let history: HistoryMessage[] = [];
    if (conversationId) {
      const { data: rows, error } = await db
        .from("messages")
        .select("role, body")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(MAX_HISTORY_MESSAGES);
      if (error) throw new Error(`history lookup failed: ${error.message}`);
      history = (rows ?? [])
        .reverse()
        .map((r) => ({ role: r.role === "bot" ? ("assistant" as const) : ("user" as const), content: r.body }));
    }

    // 7. Answer. A model error propagates as 500; the message stays counted, nothing is saved.
    const reply = await answerQuestion({ question: message, chunks, history, onCall });

    // 8. Save the turn.
    const { data: savedId, error: saveError } = await db.rpc("save_chat_turn", {
      p_project_id: project.id,
      // Explicit null creates a conversation. The generated type is not nullable, and an
      // omitted (undefined) argument would not match the function.
      p_conversation_id: conversationId ?? (null as unknown as string),
      p_visitor_id: visitorId,
      p_visitor_body: message,
      p_bot_body: reply,
    });
    if (saveError) {
      if (saveError.code === "P0002") throw new ChatFailure("not_found", "Unknown conversation.");
      throw new Error(`save_chat_turn failed: ${saveError.message}`);
    }
    savedConversationId = savedId;
    if (!conversationId) {
      trackFirstChat({ ownerId: project.owner_id, projectId: project.id, conversationId: savedId });
    }
    return { conversationId: savedId, reply };
  } finally {
    trackAiCalls({
      ownerId: project.owner_id,
      projectId: project.id,
      // A first message that failed before saving has no conversation: use a one-off id.
      conversationId: savedConversationId ?? conversationId ?? crypto.randomUUID(),
      calls,
    });
  }
}
