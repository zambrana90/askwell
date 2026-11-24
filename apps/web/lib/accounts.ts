import "server-only";
import { trackSignedUp } from "./analytics/events";
import { createServiceClient } from "./supabase/service";

/**
 * Makes sure the signed-in user has an `accounts` row (plan `free`).
 * Owners can't INSERT under RLS, so this uses the service client. The caller must pass
 * the user ID from Clerk's server-side `auth()`, never a value from the client.
 * An existing row is never changed: a Pro user signing in again stays Pro.
 * Sends `signed_up` only when this call created the row.
 * Throws if the database call fails; the dashboard layout turns that into the error state.
 */
export async function ensureAccount(clerkUserId: string): Promise<void> {
  const { data, error } = await createServiceClient()
    .from("accounts")
    .upsert({ clerk_user_id: clerkUserId, plan: "free" }, { onConflict: "clerk_user_id", ignoreDuplicates: true })
    .select("clerk_user_id"); // returns inserted rows only: an ignored duplicate returns none
  if (error) throw new Error(`ensureAccount failed: ${error.message}`);
  if (data.length > 0) trackSignedUp(clerkUserId);
}
