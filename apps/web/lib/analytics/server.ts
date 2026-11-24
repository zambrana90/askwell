import "server-only";
import { getNodeClient } from "./node-client";

export { getPosthogEnv } from "./node-client";

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
    const posthog = getNodeClient();
    if (!posthog) return;
    await posthog.captureImmediate({ distinctId, event, properties: props });
  } catch (err) {
    console.error(`captureServer failed for ${event}:`, err instanceof Error ? err.message : err);
  }
}
