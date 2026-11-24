import { PostHog } from "posthog-node";

/** The PostHog project key and host from the environment, or null if either is not set. */
export function getPosthogEnv(): { key: string; host: string } | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  if (!key || !host) return null; // no default host: the project is on EU Cloud, so never guess a region
  return { key, host };
}

let client: PostHog | null = null;
let clientKey: string | undefined;

/** One shared server client. flushAt 1 and no interval: serverless functions can freeze right after the response. */
export function getNodeClient(): PostHog | null {
  const env = getPosthogEnv();
  if (!env) return null;
  if (!client || clientKey !== env.key) {
    client = new PostHog(env.key, { host: env.host, flushAt: 1, flushInterval: 0 });
    clientKey = env.key;
  }
  return client;
}
