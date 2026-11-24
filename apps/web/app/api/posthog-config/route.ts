import { NextResponse } from "next/server";
import { apiError, API_ERROR_STATUS } from "@askwell/shared";
import type { PosthogConfigResponse } from "@askwell/shared";
import { getPosthogEnv } from "../../../lib/analytics/server";

// Read at request time, never at build time.
export const dynamic = "force-dynamic";

/** GET /api/posthog-config: PostHog's public project key and host. Public; the key is meant for browsers. */
export function GET() {
  const env = getPosthogEnv();
  if (!env) {
    return NextResponse.json(apiError("internal", "Analytics is not configured."), {
      status: API_ERROR_STATUS.internal,
      headers: { "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json(env satisfies PosthogConfigResponse, { headers: { "Cache-Control": "no-store" } });
}
