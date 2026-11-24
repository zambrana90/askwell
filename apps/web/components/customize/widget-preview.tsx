import { APP_NAME, type WidgetConfig } from "@askwell/shared";
import { inkFor, placement } from "./preview-utils";

/**
 * A mock page with the widget as it will look: the launcher button (color, readable text,
 * label, corner) and the open panel (header text, badge). It does not load widget.js.
 * All text comes from the form and renders as text.
 */
export function WidgetPreview({ config }: { config: WidgetConfig }) {
  const where = placement(config.position);
  return (
    <figure aria-label="Widget preview" className="m-0">
      <div
        data-testid="preview-frame"
        data-position={config.position}
        data-animation={config.animation}
        className="relative h-80 overflow-hidden rounded-glass border border-glass-edge bg-canvas"
      >
        {/* A stand-in for the customer's page. */}
        <div aria-hidden="true" className="flex flex-col gap-2 p-4">
          <div className="h-3 w-1/3 rounded bg-glass-edge" />
          <div className="h-2 w-5/6 rounded bg-glass-edge" />
          <div className="h-2 w-4/6 rounded bg-glass-edge" />
          <div className="h-2 w-3/6 rounded bg-glass-edge" />
        </div>

        <div
          data-testid="preview-panel"
          className={`absolute flex w-56 flex-col overflow-hidden rounded-2xl border border-glass-edge bg-canvas text-ink shadow-glass ${where.panel}`}
        >
          <p className="truncate border-b border-glass-edge bg-glass px-3 py-2 text-sm font-semibold">
            {config.headerText}
          </p>
          <div className="flex flex-col gap-2 px-3 py-3 text-xs">
            <p className="max-w-[85%] self-end rounded-glass bg-accent px-2 py-1 text-accent-ink">Hello!</p>
            <p className="max-w-[85%] self-start rounded-glass border border-glass-edge bg-glass px-2 py-1">
              Hi, how can I help?
            </p>
          </div>
          {config.showBadge ? (
            <p data-testid="preview-badge" className="border-t border-glass-edge px-3 py-1 text-center text-[10px] text-ink-muted">
              Powered by {APP_NAME}
            </p>
          ) : null}
        </div>

        <span
          data-testid="preview-button"
          style={{ backgroundColor: config.buttonColor, color: inkFor(config.buttonColor) }}
          className={`absolute inline-flex h-10 max-w-[70%] items-center truncate rounded-full px-4 text-sm font-semibold shadow-glass ${where.button}`}
        >
          {config.label}
        </span>
      </div>
      <figcaption className="mt-2 text-xs text-ink-muted">Preview. Your site shows the same look.</figcaption>
    </figure>
  );
}
