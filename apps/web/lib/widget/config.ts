import "server-only";
import {
  applyPlanToConfig,
  WIDGET_ANIMATIONS,
  WIDGET_POSITIONS,
  type Plan,
  type WidgetConfig,
} from "@askwell/shared";
import { createServiceClient } from "../supabase/service";

function pick<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === value) ?? fallback;
}

/**
 * Public lookup by `public_key` only (project.md §7: public routes have no owner).
 * Returns the plan-applied config, or null if no project has that key.
 * Exposes only the six WidgetConfig fields: never the project id or owner.
 */
export async function getWidgetConfigByKey(key: string): Promise<WidgetConfig | null> {
  const { data, error } = await createServiceClient()
    .from("projects")
    .select(
      "widget_configs(button_color, position, label, animation, header_text, show_badge), accounts(plan)",
    )
    .eq("public_key", key)
    .maybeSingle();
  if (error) throw new Error(`getWidgetConfigByKey failed: ${error.message}`);
  if (!data) return null;

  const row = Array.isArray(data.widget_configs) ? data.widget_configs[0] : data.widget_configs;
  const account = Array.isArray(data.accounts) ? data.accounts[0] : data.accounts;
  const plan: Plan = account?.plan === "pro" ? "pro" : "free";

  // A project without a config row behaves like Free defaults.
  const config: WidgetConfig = row
    ? {
        buttonColor: row.button_color,
        position: pick(row.position, WIDGET_POSITIONS, "bottom-right"),
        label: row.label,
        animation: pick(row.animation, WIDGET_ANIMATIONS, "fade"),
        headerText: row.header_text,
        showBadge: row.show_badge,
      }
    : applyPlanToConfig({} as WidgetConfig, "free");
  return applyPlanToConfig(config, plan);
}
