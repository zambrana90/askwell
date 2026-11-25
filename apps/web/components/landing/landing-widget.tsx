import { widgetConfigQuerySchema } from "@askwell/shared";

/**
 * The public key of the project about the app itself, used by the live demo. Read from the
 * environment on every call (never `NEXT_PUBLIC_`, never inlined at build time), so each
 * environment sets its own. Null when it is missing or not a valid key: the demo is then
 * not available. On Vercel, a changed variable reaches only deployments created after the change.
 */
export function landingWidgetKey(): string | null {
  const parsed = widgetConfigQuerySchema.safeParse({ key: process.env.LANDING_WIDGET_KEY?.trim() });
  return parsed.success ? parsed.data.key : null;
}
