import {
  API_ERROR_CODES,
  type ApiError,
  type ApiErrorCode,
  type WidgetChatRequest,
  type WidgetChatResponse,
} from "@askwell/shared";

/** An error from the chat API, with the API's error code. */
export class ChatError extends Error {
  readonly code: ApiErrorCode;
  constructor(code: ApiErrorCode, message: string = code) {
    super(message);
    this.name = "ChatError";
    this.code = code;
  }
}

const CHAT_URL = "/api/widget/chat";

function isErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && (API_ERROR_CODES as readonly string[]).includes(value);
}

/** Sends one visitor message to POST /api/widget/chat. Throws ChatError on any failure. */
export async function sendMessage(req: WidgetChatRequest): Promise<WidgetChatResponse> {
  let res: Response;
  try {
    res = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
  } catch {
    throw new ChatError("internal");
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ChatError("internal");
  }

  if (!res.ok) {
    const code = (body as Partial<ApiError> | null)?.error?.code;
    throw new ChatError(isErrorCode(code) ? code : "internal");
  }

  const { conversationId, reply } = (body ?? {}) as Partial<WidgetChatResponse>;
  if (typeof conversationId !== "string" || typeof reply !== "string") {
    throw new ChatError("internal");
  }
  return { conversationId, reply };
}

/** Friendly text for the visitor. Never shows server messages. */
export function chatErrorMessage(error: unknown): string {
  const code = error instanceof ChatError ? error.code : null;
  if (code === "rate_limited") return "You're sending messages too fast. Please wait a moment and try again.";
  if (code === "quota_exceeded") return "This chat is unavailable right now. Please try again later.";
  if (code === "forbidden") return "Sorry, I can't help with that.";
  return "Something went wrong. Please try again.";
}
