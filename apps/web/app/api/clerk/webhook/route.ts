import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { API_ERROR_STATUS, apiError, type ApiErrorCode } from "@askwell/shared";
import { applyPlanChange, planChangeFor } from "../../../../lib/billing/plan";

const fail = (code: ApiErrorCode, message: string) =>
  Response.json(apiError(code, message), { status: API_ERROR_STATUS[code] });

/**
 * POST /api/clerk/webhook: keeps `accounts.plan` in sync with Clerk Billing. No session: the
 * signature (`CLERK_WEBHOOK_SIGNING_SECRET`) is the only check, and it runs before any write.
 */
export async function POST(request: NextRequest) {
  let event: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    event = await verifyWebhook(request);
  } catch (err) {
    console.error("clerk webhook verification failed:", err instanceof Error ? err.message : "unknown error");
    return fail("validation_error", "Webhook verification failed.");
  }

  try {
    const change = planChangeFor(event);
    if (change) await applyPlanChange(change);
    return Response.json({ received: true });
  } catch (err) {
    console.error("clerk webhook failed:", err instanceof Error ? err.message : "unknown error");
    return fail("internal", "Could not apply the event.");
  }
}
