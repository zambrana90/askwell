import "server-only";
import type { Plan } from "@askwell/shared";
import { ensureAccount } from "../accounts";
import { trackUpgraded } from "../analytics/events";
import { createServiceClient } from "../supabase/service";

/** The slug of the paid plan in Clerk Billing. */
export const PRO_PLAN_SLUG = "pro";

export type PlanChange = { userId: string; plan: Plan };

/** The parts of a Clerk `subscriptionItem.*` event this app reads. */
type BillingEvent = {
  type: string;
  data: unknown;
};

type ItemData = { plan?: { slug?: string } | null; payer?: { user_id?: string } | null };

/**
 * The plan change a verified Clerk event asks for, or null if it asks for none
 * (project.md §6.10): the Pro item becoming active gives `pro`, ending gives `free`.
 * A cancellation changes nothing, so Pro lasts until the paid period ends.
 */
export function planChangeFor(event: BillingEvent): PlanChange | null {
  const plan: Plan | null =
    event.type === "subscriptionItem.active" ? "pro" : event.type === "subscriptionItem.ended" ? "free" : null;
  if (!plan) return null;
  const item = event.data as ItemData;
  const userId = item.payer?.user_id; // organizations have no accounts row
  if (item.plan?.slug !== PRO_PLAN_SLUG || !userId) return null;
  return { userId, plan };
}

/**
 * Writes the plan with the service client. Call only after the webhook signature is verified.
 * Creates a missing accounts row first. Safe to repeat. Sends `upgraded` only when the plan
 * actually changes to pro. Throws on a database error, so Clerk retries the delivery.
 */
export async function applyPlanChange({ userId, plan }: PlanChange): Promise<void> {
  await ensureAccount(userId);
  // One conditional update: of two concurrent deliveries only one changes the row.
  const { data, error } = await createServiceClient()
    .from("accounts")
    .update({ plan })
    .eq("clerk_user_id", userId)
    .neq("plan", plan)
    .select("clerk_user_id");
  if (error) throw new Error(`plan update failed: ${error.message}`);
  if (plan === "pro" && data.length > 0) trackUpgraded(userId);
}
