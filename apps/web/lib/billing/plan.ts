import "server-only";
import { clerkClient } from "@clerk/nextjs/server";
import type { Plan } from "@askwell/shared";
import { ensureAccount } from "../accounts";
import { trackUpgraded } from "../analytics/events";
import { createServiceClient } from "../supabase/service";

/** The slug of the paid plan in Clerk Billing. */
export const PRO_PLAN_SLUG = "pro";

/** The parts of a Clerk `subscriptionItem.*` event this app reads. */
type BillingEvent = {
  type: string;
  data: unknown;
};

type ItemData = { plan?: { slug?: string } | null; payer?: { user_id?: string } | null };

/** The parts of a live subscription item that decide whether it still gives Pro. */
type LiveItem = { status: string; periodEnd: number | null; plan: { slug: string } | null };

/**
 * The user whose plan a verified Clerk event may have changed, or null if the event can't
 * change it (project.md §6.10): only the Pro item becoming active or ending does. The event
 * says whom to check, not which plan to write, so a late or replayed delivery is harmless.
 */
export function userToSync(event: BillingEvent): string | null {
  if (event.type !== "subscriptionItem.active" && event.type !== "subscriptionItem.ended") return null;
  const item = event.data as ItemData;
  if (item.plan?.slug !== PRO_PLAN_SLUG) return null;
  return item.payer?.user_id ?? null; // organizations have no accounts row
}

/**
 * The plan a user's subscription items give at `now`. A past-due item keeps Pro until Clerk
 * ends it, and a canceled one until its paid period ends.
 */
export function planFromItems(items: LiveItem[], now: number): Plan {
  const pro = items.some(
    (item) =>
      item.plan?.slug === PRO_PLAN_SLUG &&
      (item.status === "active" ||
        item.status === "past_due" ||
        (item.status === "canceled" && item.periodEnd !== null && item.periodEnd > now)),
  );
  return pro ? "pro" : "free";
}

/**
 * Sets `accounts.plan` from the user's live subscription in Clerk, with the service client.
 * Call only after the webhook signature is verified. Creates a missing accounts row first.
 * Safe to repeat. Sends `upgraded` only when the plan actually changes to pro.
 * Throws if Clerk or the database fails, so Clerk retries the delivery.
 */
export async function syncPlan(userId: string): Promise<void> {
  const clerk = await clerkClient();
  const subscription = await clerk.billing.getUserBillingSubscription(userId);
  const plan = planFromItems(subscription.subscriptionItems, Date.now());

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
