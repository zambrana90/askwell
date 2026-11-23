import type { WidgetAnimation, WidgetConfig, WidgetPosition } from "@askwell/shared";

// Local copies of the allowed values: importing the runtime arrays from
// `@askwell/shared` would pull zod into widget.js. The `satisfies` + exhaustiveness
// checks make typecheck fail if the shared types ever gain a value we lack.
const POSITIONS = ["bottom-right", "bottom-left", "top-right", "top-left"] as const satisfies readonly WidgetPosition[];
const ANIMATIONS = ["fade", "slide", "scale"] as const satisfies readonly WidgetAnimation[];
export const positionsComplete: Exclude<WidgetPosition, (typeof POSITIONS)[number]> extends never ? true : never = true;
export const animationsComplete: Exclude<WidgetAnimation, (typeof ANIMATIONS)[number]> extends never ? true : never = true;

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
export const FALLBACK_COLOR = "#000000";

function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | null {
  return allowed.find((item) => item === value) ?? null;
}

/** Hand-written guard for the /api/widget/config response. Null if the shape is wrong. */
export function parseConfig(data: unknown): WidgetConfig | null {
  if (typeof data !== "object" || data === null) return null;
  const o = data as Record<string, unknown>;
  const position = oneOf(POSITIONS, o.position);
  const animation = oneOf(ANIMATIONS, o.animation);
  if (!position || !animation) return null;
  if (typeof o.label !== "string" || typeof o.headerText !== "string") return null;
  if (typeof o.buttonColor !== "string" || typeof o.showBadge !== "boolean") return null;
  return {
    // Only a plain hex color reaches a style rule.
    buttonColor: HEX_COLOR.test(o.buttonColor) ? o.buttonColor : FALLBACK_COLOR,
    position,
    label: o.label,
    animation,
    headerText: o.headerText,
    showBadge: o.showBadge,
  };
}

function luminance(hex: string): number {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Black or white text, whichever has the higher WCAG contrast ratio on the button color. */
export function inkFor(hex: string): string {
  const l = luminance(hex);
  // Contrast with white is 1.05 / (l + 0.05); with black it is (l + 0.05) / 0.05.
  return 1.05 / (l + 0.05) > (l + 0.05) / 0.05 ? "#ffffff" : "#000000";
}
