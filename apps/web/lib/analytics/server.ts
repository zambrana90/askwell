import "server-only";
import { PostHog } from "posthog-node";

/** The PostHog project key and host from the environment, or null if the key is not set. */
export function getPosthogEnv(): { key: string; host: string } | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  return { key, host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com" };
}

let client: PostHog | null = null;
let clientKey: string | undefined;

function getClient(): PostHog | null {
  const env = getPosthogEnv();
  if (!env) return null;
  if (!client || clientKey !== env.key) {
    // flushAt 1 and no interval: serverless functions can freeze right after the response.
    client = new PostHog(env.key, { host: env.host, flushAt: 1, flushInterval: 0 });
    clientKey = env.key;
  }
  return client;
}

/**
 * Sends one server-side event and waits until it is delivered, so it is not lost when the
 * serverless function freezes. NEVER throws: analytics must not break a request. With no key
 * configured it does nothing. Never put message text, emails or names in `props`.
 */
export async function captureServer(
  distinctId: string,
  event: string,
  props?: Record<string, unknown>,
): Promise<void> {
  try {
    const posthog = getClient();
    if (!posthog) return;
    await posthog.captureImmediate({ distinctId, event, properties: props });
  } catch (err) {
    console.error(`captureServer failed for ${event}:`, err instanceof Error ? err.message : err);
  }
}
