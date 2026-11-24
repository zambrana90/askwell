import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { DEFAULT_WIDGET_CONFIG, WIDGET_ANIMATIONS, WIDGET_POSITIONS, type WidgetConfig } from "@askwell/shared";
import { CustomizeForm } from "../../../../../components/customize/customize-form";
import { loadOwnedProject } from "../../../../../components/projects/owned-project";
import { ErrorState } from "../../../../../components/ui/error-state";
import { getPlan } from "../../../../../lib/projects/projects";
import { createOwnerClient } from "../../../../../lib/supabase/owner";

const pick = <T extends string>(value: string, allowed: readonly T[], fallback: T): T =>
  allowed.find((a) => a === value) ?? fallback;

export default async function CustomizePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const project = await loadOwnedProject(id);
  if (!project) notFound();

  // Owner client: RLS scopes the read. The plan is read here, on the server, never from the client.
  const [plan, { data, error }] = await Promise.all([
    getPlan(userId),
    createOwnerClient()
      .from("widget_configs")
      .select("button_color, position, label, animation, header_text, show_badge")
      .eq("project_id", project.id)
      .maybeSingle(),
  ]);
  if (error) return <ErrorState description="We couldn't load your widget settings. Please reload the page." />;

  const canCustomize = plan === "pro";
  // Free always sees the defaults. Pro sees the saved values (defaults if nothing is saved yet).
  const initial: WidgetConfig =
    canCustomize && data
      ? {
          buttonColor: data.button_color,
          position: pick(data.position, WIDGET_POSITIONS, DEFAULT_WIDGET_CONFIG.position),
          label: data.label,
          animation: pick(data.animation, WIDGET_ANIMATIONS, DEFAULT_WIDGET_CONFIG.animation),
          headerText: data.header_text,
          showBadge: data.show_badge,
        }
      : DEFAULT_WIDGET_CONFIG;

  return <CustomizeForm projectId={project.id} initialConfig={initial} canCustomize={canCustomize} />;
}
