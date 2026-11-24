import { NextResponse } from "next/server";
import {
  API_ERROR_STATUS,
  apiError,
  widgetConfigQuerySchema,
  type ApiErrorCode,
  type WidgetConfigResponse,
} from "@askwell/shared";
import { protectConfig } from "../../../../lib/security/arcjet";
import { getWidgetConfigByKey } from "../../../../lib/widget/config";

// Public route: any origin, no credentials (project.md §9).
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

export async function GET(request: Request) {
  const parsed = widgetConfigQuerySchema.safeParse({
    key: new URL(request.url).searchParams.get("key") ?? undefined,
  });
  if (!parsed.success) return fail("validation_error", "A valid key is required.");

  const verdict = await protectConfig(request, { publicKey: parsed.data.key });
  if (verdict === "rate_limited") return fail("rate_limited", "Too many requests.");

  let config: WidgetConfigResponse | null;
  try {
    config = await getWidgetConfigByKey(parsed.data.key);
  } catch {
    return fail("internal", "Something went wrong.");
  }
  if (!config) return fail("not_found", "Unknown key.");

  return NextResponse.json(config, {
    headers: {
      ...CORS_HEADERS,
      // Browsers revalidate on every page load, so a saved config shows on the next reload.
      // The Vercel CDN must not cache either: a cached hit never reaches the function, so the
      // Arcjet rate limit would never run.
      "Cache-Control": "public, no-cache",
      "Vercel-CDN-Cache-Control": "no-store",
      "CDN-Cache-Control": "no-store",
    },
  });
}
