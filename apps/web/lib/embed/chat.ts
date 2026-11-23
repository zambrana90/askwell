import type { ApiErrorCode, WidgetChatRequest, WidgetChatResponse } from "@askwell/shared";

/** An error from the chat API, with the API's error code. */
export class ChatError extends Error {
  readonly code: ApiErrorCode;
  constructor(code: ApiErrorCode, message: string = code) {
    super(message);
    this.name = "ChatError";
    this.code = code;
  }
}

const MOCK_DELAY_MS = 900;
const MOCK_CONVERSATION_ID = "00000000-0000-4000-8000-000000000001";

/**
 * MOCK (Phase 2): a short delay, then a canned reply. Phase 3 replaces only this
 * function with a call to POST /api/widget/chat. Same signature, same errors
 * (throw ChatError with the API's code).
 */
export async function sendMessage(req: WidgetChatRequest): Promise<WidgetChatResponse> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
  return {
    conversationId: req.conversationId ?? MOCK_CONVERSATION_ID,
    reply: "Thanks for your message! This is a preview reply. Real answers are coming soon.",
  };
}

/** Friendly text for the visitor. Never shows server messages. */
export function chatErrorMessage(error: unknown): string {
  const code = error instanceof ChatError ? error.code : null;
  if (code === "rate_limited") return "You're sending messages too fast. Please wait a moment and try again.";
  if (code === "quota_exceeded") return "This chat is unavailable right now. Please try again later.";
  return "Something went wrong. Please try again.";
}
