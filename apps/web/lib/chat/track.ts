import "server-only";
import { after } from "next/server";
import type { AiCall } from "../ai/trace";
import { captureServer } from "../analytics/server";
import { createServiceClient } from "../supabase/service";

/** Distinct id for a blocked message whose project is unknown. */
export const UNKNOWN_OWNER_ID = "widget";

/**
 * Runs tracking after the response is sent, so it never slows or fails a reply
 * (project.md §6.6). No message text goes into any event here.
 */
function defer(task: () => Promise<unknown>): void {
  const safe = async () => {
    try {
      await task();
    } catch (err) {
      console.error("chat tracking failed:", err instanceof Error ? err.message : err);
    }
  };
  try {
    after(safe);
  } catch {
    void safe(); // no request scope (e.g. called outside a route)
  }
}

/** PostHog AI trace of one bot reply (§6.11): one event per OpenAI call, grouped per conversation. */
export function trackAiCalls(input: {
  ownerId: string;
  projectId: string;
  conversationId: string;
  calls: AiCall[];
}): void {
  const { ownerId, projectId, conversationId, calls } = input;
  if (calls.length === 0) return;
  defer(() =>
    Promise.all(
      calls.map((call) =>
        captureServer(ownerId, call.kind === "generation" ? "$ai_generation" : "$ai_embedding", {
          projectId,
          $ai_trace_id: conversationId,
          $ai_session_id: conversationId,
          $ai_span_name: call.kind === "generation" ? "answer" : "embed_question",
          $ai_provider: "openai",
          $ai_model: call.model,
          $ai_latency: call.latencySeconds,
          $ai_input_tokens: call.inputTokens,
          $ai_output_tokens: call.outputTokens,
          $ai_cache_read_input_tokens: call.cachedInputTokens,
          $ai_is_error: call.isError,
          $ai_http_status: call.httpStatus,
        }),
      ),
    ),
  );
}

/** `message_blocked` (§6.11). The project is looked up only to attribute the event. */
export function trackMessageBlocked(publicKey: string, reason: "rate_limit" | "injection"): void {
  defer(async () => {
    let project: { id: string; owner_id: string } | null = null;
    try {
      const { data } = await createServiceClient()
        .from("projects")
        .select("id, owner_id")
        .eq("public_key", publicKey)
        .maybeSingle();
      project = data;
    } catch (err) {
      console.error("message_blocked project lookup failed:", err instanceof Error ? err.message : err);
    }
    await captureServer(project?.owner_id ?? UNKNOWN_OWNER_ID, "message_blocked", {
      reason,
      ...(project ? { projectId: project.id } : { $process_person_profile: false }),
    });
  });
}

/** `first_chat`: the new conversation is the oldest one of its project. */
export function trackFirstChat(input: { ownerId: string; projectId: string; conversationId: string }): void {
  const { ownerId, projectId, conversationId } = input;
  defer(async () => {
    const { data, error } = await createServiceClient()
      .from("conversations")
      .select("id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw new Error(`first conversation lookup failed: ${error.message}`);
    if (data?.[0]?.id === conversationId) await captureServer(ownerId, "first_chat", { projectId });
  });
}
