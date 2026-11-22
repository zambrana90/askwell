import type { Plan } from "./plans";

export const WIDGET_POSITIONS = [
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
] as const;
export type WidgetPosition = (typeof WIDGET_POSITIONS)[number];

export const WIDGET_ANIMATIONS = ["fade", "slide", "scale"] as const;
export type WidgetAnimation = (typeof WIDGET_ANIMATIONS)[number];

export type WidgetConfig = {
  buttonColor: string;
  position: WidgetPosition;
  label: string;
  animation: WidgetAnimation;
  headerText: string;
  showBadge: boolean;
};

/** Black and white (project.md §13). Also what Free accounts always get. */
export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  buttonColor: "#000000",
  position: "bottom-right",
  label: "Chat with us",
  animation: "fade",
  headerText: "Ask us anything",
  showBadge: true,
};

export const MAX_WIDGET_LABEL_LENGTH = 40;
export const MAX_WIDGET_HEADER_LENGTH = 60;

/**
 * Free: defaults + badge, whatever was saved. Pro: the saved config.
 * Pure; the server calls it with the plan it read itself.
 */
export function applyPlanToConfig(config: WidgetConfig, plan: Plan): WidgetConfig {
  if (plan === "pro") return { ...config };
  return { ...DEFAULT_WIDGET_CONFIG, showBadge: true };
}
