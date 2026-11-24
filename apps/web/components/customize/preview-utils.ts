import type { WidgetPosition } from "@askwell/shared";

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHexColor = (value: string): boolean => HEX.test(value);

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Black or white text, whichever has the higher WCAG contrast on the button color (same rule as the widget). */
export function inkFor(hex: string): string {
  const l = luminance(isHexColor(hex) ? hex : "#000000");
  return 1.05 / (l + 0.05) > (l + 0.05) / 0.05 ? "#ffffff" : "#000000";
}

export const POSITION_LABELS: Record<WidgetPosition, string> = {
  "bottom-right": "Bottom right",
  "bottom-left": "Bottom left",
  "top-right": "Top right",
  "top-left": "Top left",
};

/** Where the button and the open panel sit in the mock page, as the real widget places them. */
export function placement(position: WidgetPosition): { button: string; panel: string } {
  const bottom = position.startsWith("bottom");
  const right = position.endsWith("right");
  return {
    button: `${bottom ? "bottom-3" : "top-3"} ${right ? "right-3" : "left-3"}`,
    panel: `${bottom ? "bottom-[4.25rem]" : "top-[4.25rem]"} ${right ? "right-3" : "left-3"}`,
  };
}
