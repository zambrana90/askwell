import { getNodeClient } from "./node-client";

/**
 * Reports a server error to PostHog error tracking. Used by `onRequestError` in instrumentation.ts.
 * NEVER throws. Only the route path and kind are sent: no headers, cookies or body (they can hold
 * tokens or visitor text).
 */
export async function captureServerException(
  error: unknown,
  context: { path?: string; routeType?: string; routePath?: string },
): Promise<void> {
  try {
    const posthog = getNodeClient();
    if (!posthog) return;
    const err = error instanceof Error ? error : new Error(String(error));
    await posthog.captureExceptionImmediate(err, {
      properties: { source: "server", path: context.path, route_type: context.routeType, route_path: context.routePath },
    });
  } catch (inner) {
    console.error("captureServerException failed:", inner instanceof Error ? inner.message : inner);
  }
}
