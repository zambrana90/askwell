import { NextResponse } from "next/server";
import { API_ERROR_STATUS, apiError, type ApiErrorCode } from "@askwell/shared";
import { ChatFailure, processChat } from "../../../../lib/chat/process";

// Public route: any origin, no credentials (project.md §9).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function fail(code: ApiErrorCode, message: string) {
  return NextResponse.json(apiError(code, message), {
    status: API_ERROR_STATUS[code],
    headers: { ...CORS_HEADERS, "Cache-Control": "no-store" },
  });
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "Access-Control-Max-Age": "86400" },
  });
}

export async function POST(request: Request) {
  try {
    const result = await processChat(request);
    return NextResponse.json(result, { headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof ChatFailure) return fail(err.code, err.message);
    console.error("chat route failed:", err instanceof Error ? err.message : "unknown error");
    return fail("internal", "Something went wrong.");
  }
}
