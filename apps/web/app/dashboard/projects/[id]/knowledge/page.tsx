import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { PLAN_LIMITS } from "@askwell/shared";
import type { KnowledgeSource } from "@askwell/shared";
import { knowledgeLimitMessage } from "../../../../../components/knowledge/limit-message";
import { KnowledgeView } from "../../../../../components/knowledge/knowledge-view";
import { loadOwnedProject } from "../../../../../components/projects/owned-project";
import { ErrorState } from "../../../../../components/ui/error-state";
import { getPlan } from "../../../../../lib/projects/projects";
import { createOwnerClient } from "../../../../../lib/supabase/owner";

export default async function KnowledgePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const project = await loadOwnedProject(id);
  if (!project) notFound();

  // Owner client: RLS scopes the list. The plan is read here, on the server.
  const [plan, { data, error }] = await Promise.all([
    getPlan(userId),
    createOwnerClient()
      .from("knowledge_sources")
      .select("id, title, type, status, created_at")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false }),
  ]);
  if (error) return <ErrorState description="We couldn't load your knowledge sources. Please reload the page." />;

  const sources: KnowledgeSource[] = data.map((r) => ({
    id: r.id,
    title: r.title,
    type: r.type as KnowledgeSource["type"],
    status: r.status as KnowledgeSource["status"],
    createdAt: r.created_at,
  }));

  return (
    <KnowledgeView
      projectId={project.id}
      initialSources={sources}
      maxSources={PLAN_LIMITS[plan].knowledgeSources}
      limitMessage={knowledgeLimitMessage(plan)}
      planName={plan === "pro" ? "Pro" : "Free"}
    />
  );
}
