import "server-only";
import {
  applyPlanToConfig,
  PLAN_LIMITS,
  WIDGET_ANIMATIONS,
  WIDGET_POSITIONS,
  type Plan,
  type WidgetConfig,
} from "@askwell/shared";
import { createServiceClient } from "../supabase/service";

function pick<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return allowed.find((a) => a === value) ?? fallback;
}

/** The project is paused: it is not among its owner's oldest projects allowed by the plan. */
export class PausedProjectError extends Error {
  constructor() {
    super("project is paused");
    this.name = "PausedProjectError";
  }
}

/**
 * Public lookup by `public_key` only (project.md §7: public routes have no owner).
 * Returns the plan-applied config, or null if no project has that key.
 * Exposes only the six WidgetConfig fields: never the project id or owner.
 */
export async function getWidgetConfigByKey(key: string): Promise<WidgetConfig | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("projects")
    .select(
      "id, widget_configs(button_color, position, label, animation, header_text, show_badge), accounts(plan)",
    )
    .eq("public_key", key)
    .maybeSingle();
  if (error) throw new Error(`getWidgetConfigByKey failed: ${error.message}`);
  if (!data) return null;

  const row = Array.isArray(data.widget_configs) ? data.widget_configs[0] : data.widget_configs;
  const account = Array.isArray(data.accounts) ? data.accounts[0] : data.accounts;
  const plan: Plan = account?.plan === "pro" ? "pro" : "free";

  // A paused project (an extra after a downgrade) has no widget: callers answer 402 or render nothing.
  const { data: active, error: activeError } = await db.rpc("project_is_active", {
    p_project_id: data.id,
    p_max_projects: PLAN_LIMITS[plan].projects,
  });
  if (activeError) throw new Error(`project_is_active failed: ${activeError.message}`);
  if (!active) throw new PausedProjectError();

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
