import type { Instrumentation } from "next";

/** Server errors go to PostHog error tracking. Loaded only in the Node runtime. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureServerException } = await import("./lib/analytics/errors");
  await captureServerException(error, {
    path: request.path.split("?")[0],
    routeType: context.routeType,
    routePath: context.routePath,
  });
};
