/**
 * How clickable things react (project.md §13): one place, so hover, press and focus look the
 * same everywhere, in light and dark. Only colors, outlines, shadows and `translate` change,
 * so nothing shifts the layout. Transitions and the lift are off with reduced motion.
 */

/** The ring shown on keyboard focus, outside the element. */
export const FOCUS_RING = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/** The same ring inside the element, where a parent would clip it or it fills its container. */
export const FOCUS_RING_INSET = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink";

/** Pointer cursor, smooth changes and the focus ring: every link and button. */
export const CLICKABLE = `cursor-pointer motion-safe:transition ${FOCUS_RING}`;

/** The same for rows and tabs that fill their container. */
export const CLICKABLE_INSET = `cursor-pointer motion-safe:transition ${FOCUS_RING_INSET}`;

/** Button looks, shared by Button and LinkButton. `not-disabled` also matches links. */
export const BUTTON_VARIANTS = {
  primary:
    "bg-accent text-accent-ink not-disabled:hover:bg-accent/80 not-disabled:hover:ring-4 not-disabled:hover:ring-ink/20 motion-safe:not-disabled:hover:-translate-y-px not-disabled:active:bg-accent/70 not-disabled:active:ring-2 motion-safe:not-disabled:active:translate-y-0",
  secondary:
    "border border-glass-edge bg-glass text-ink backdrop-blur-glass not-disabled:hover:border-ink/60 not-disabled:hover:bg-ink/10 motion-safe:not-disabled:hover:-translate-y-px not-disabled:active:bg-ink/20 motion-safe:not-disabled:active:translate-y-0",
  ghost: "text-ink not-disabled:hover:bg-ink/15 not-disabled:active:bg-ink/25",
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;

/** A quiet text link (muted text): brightens and underlines. */
export const MUTED_LINK = `${CLICKABLE} rounded-sm underline-offset-4 hover:text-ink hover:underline active:opacity-70`;

/** A link that is already underlined: the line thickens and the text dims. */
export const INLINE_LINK = `${CLICKABLE} rounded-sm underline underline-offset-4 hover:text-ink-muted hover:decoration-2 active:opacity-70`;

/** The app name in a header. */
export const BRAND_LINK = `${CLICKABLE} rounded-sm hover:text-ink-muted active:opacity-70`;

/** The border of a text field, select or color input under the pointer. */
export const FIELD = `${FOCUS_RING} enabled:hover:border-ink/50`;
