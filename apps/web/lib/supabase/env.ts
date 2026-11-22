/** Throws a clear error naming the missing environment variable. */
export function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Set it in your environment (see .env.example).`);
  }
  return value;
}

/** The public Supabase settings: safe in the browser, RLS is the boundary. */
export function getSupabasePublicEnv(): { url: string; publishableKey: string } {
  // Literal accesses so Next.js can inline the NEXT_PUBLIC_* values.
  return {
    url: requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    publishableKey: requireEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}
