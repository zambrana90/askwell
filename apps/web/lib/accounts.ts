import "server-only";
import { createServiceClient } from "./supabase/service";

/**
 * Makes sure the signed-in user has an `accounts` row (plan `free`).
 * Owners can't INSERT under RLS, so this uses the service client. The caller must pass
 * the user ID from Clerk's server-side `auth()`, never a value from the client.
 * An existing row is never changed: a Pro user signing in again stays Pro.
 * Throws if the database call fails; the dashboard layout turns that into the error state.
 */
export async function ensureAccount(clerkUserId: string): Promise<void> {
  const { error } = await createServiceClient()
    .from("accounts")
    .upsert({ clerk_user_id: clerkUserId, plan: "free" }, { onConflict: "clerk_user_id", ignoreDuplicates: true });
  if (error) throw new Error(`ensureAccount failed: ${error.message}`);
}
