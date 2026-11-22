import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@askwell/db";
import { getSupabaseUrl, requireEnv } from "./env";

/** Name of the secret key variable. Only this file reads its value. */
export const SERVICE_KEY_ENV = "SUPABASE_SECRET_KEY";

/**
 * Supabase client with the secret key (acts as `service_role`, skips RLS). Server only.
 * Use it ONLY after the route has checked ownership and plan (project.md §9).
 * Never use it for owner reads, and never filter by owner by hand: use createOwnerClient().
 */
export function createServiceClient() {
  const url = getSupabaseUrl();
  const secretKey = requireEnv(SERVICE_KEY_ENV, process.env.SUPABASE_SECRET_KEY);
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
