import { widgetConfigQuerySchema } from "@askwell/shared";
import { WIDGET_SCRIPT_PATH } from "@askwell/shared/embed";

/**
 * The public key of the project about the app itself. Read from the environment on every
 * call (never `NEXT_PUBLIC_`, never inlined at build time), so each environment sets its own.
 * Null when it is missing or not a valid key: the landing page then shows no widget.
 */
export function landingWidgetKey(): string | null {
  const parsed = widgetConfigQuerySchema.safeParse({ key: process.env.LANDING_WIDGET_KEY?.trim() });
  return parsed.success ? parsed.data.key : null;
}

/** The app's own widget: the same script tag customers paste. Nothing renders without a key. */
export function LandingWidget({ widgetKey }: { widgetKey: string | null }) {
  if (!widgetKey) return null;
  return <script src={WIDGET_SCRIPT_PATH} data-key={widgetKey} async />;
}
