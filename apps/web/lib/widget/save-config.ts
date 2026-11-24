import "server-only";
import {
  DEFAULT_WIDGET_CONFIG,
  WIDGET_ANIMATIONS,
  WIDGET_POSITIONS,
  type UpdateConfigRequest,
  type WidgetConfig,
} from "@askwell/shared";
import { createServiceClient } from "../supabase/service";

type ConfigRow = {
  button_color: string;
  position: string;
  label: string;
  animation: string;
  header_text: string;
  show_badge: boolean;
};

const COLUMNS = "button_color, position, label, animation, header_text, show_badge";

const pick = <T extends string>(value: string, allowed: readonly T[], fallback: T): T =>
  allowed.find((a) => a === value) ?? fallback;

const toConfig = (row: ConfigRow): WidgetConfig => ({
  buttonColor: row.button_color,
  position: pick(row.position, WIDGET_POSITIONS, DEFAULT_WIDGET_CONFIG.position),
  label: row.label,
  animation: pick(row.animation, WIDGET_ANIMATIONS, DEFAULT_WIDGET_CONFIG.animation),
  headerText: row.header_text,
  showBadge: row.show_badge,
});

/** camelCase patch to snake_case columns; only the fields that were sent. */
function toColumns(patch: UpdateConfigRequest): Partial<ConfigRow> {
  const out: Partial<ConfigRow> = {};
  if (patch.buttonColor !== undefined) out.button_color = patch.buttonColor;
  if (patch.position !== undefined) out.position = patch.position;
  if (patch.label !== undefined) out.label = patch.label;
  if (patch.animation !== undefined) out.animation = patch.animation;
  if (patch.headerText !== undefined) out.header_text = patch.headerText;
  if (patch.showBadge !== undefined) out.show_badge = patch.showBadge;
  return out;
}

/**
 * Saves a partial config for a project and returns the stored config.
 * Uses the service client: call it ONLY after the route has checked ownership and the plan
 * (project.md §9). A project without a config row gets one, filled with the defaults.
 */
export async function saveWidgetConfig(projectId: string, patch: UpdateConfigRequest): Promise<WidgetConfig> {
  const db = createServiceClient();
  const columns = toColumns(patch);

  const update = async () => {
    const { data, error } = await db
      .from("widget_configs")
      .update(columns)
      .eq("project_id", projectId)
      .select(COLUMNS)
      .maybeSingle();
    if (error) throw new Error(`saveWidgetConfig update failed: ${error.message}`);
    return data;
  };

  const updated = await update();
  if (updated) return toConfig(updated);

  const { data: inserted, error: insertError } = await db
    .from("widget_configs")
    .insert({
      project_id: projectId,
      button_color: DEFAULT_WIDGET_CONFIG.buttonColor,
      position: DEFAULT_WIDGET_CONFIG.position,
      label: DEFAULT_WIDGET_CONFIG.label,
      animation: DEFAULT_WIDGET_CONFIG.animation,
      header_text: DEFAULT_WIDGET_CONFIG.headerText,
      show_badge: DEFAULT_WIDGET_CONFIG.showBadge,
      ...columns,
    })
    .select(COLUMNS)
    .single();
  if (insertError) {
    // A concurrent first save inserted the row between our update and insert (unique violation
    // on project_id). Retry the update on that row instead of failing or overwriting it with
    // defaults, so neither save is lost and no saved value is reset (an upsert would reset them).
    if (insertError.code === "23505") {
      const retried = await update();
      if (retried) return toConfig(retried);
    }
    throw new Error(`saveWidgetConfig insert failed: ${insertError.message}`);
  }
  return toConfig(inserted);
}
