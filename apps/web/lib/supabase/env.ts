/** Throws a clear error naming the missing environment variable. */
export function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Set it in your environment (see .env.example).`);
  }
  return value;
}

/** The Supabase project URL. Both clients need it. */
export function getSupabaseUrl(): string {
  // Literal access so Next.js can inline the NEXT_PUBLIC_* value.
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/** The public Supabase settings (owner client): safe in the browser, RLS is the boundary. */
export function getSupabasePublicEnv(): { url: string; publishableKey: string } {
  return {
    url: getSupabaseUrl(),
    publishableKey: requireEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}
