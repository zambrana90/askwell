import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@askwell/db";
import { getSupabasePublicEnv } from "./env";

/**
 * Supabase client acting as the signed-in owner, for server components and route handlers.
 * It sends the owner's Clerk session token, so Postgres RLS scopes every query to them.
 * Use this for every owner read (project.md §9, "Tenant leak").
 */
export function createOwnerClient() {
  const { url, publishableKey } = getSupabasePublicEnv();
  return createClient<Database>(url, publishableKey, {
    // Clerk native third-party auth: the session token itself, no JWT template.
    accessToken: async () => (await auth()).getToken(),
  });
}
