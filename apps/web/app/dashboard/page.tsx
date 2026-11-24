import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { PLAN_LIMITS } from "@askwell/shared";
import { limitMessage } from "../../components/projects/limit-message";
import { ProjectsView } from "../../components/projects/projects-view";
import { ErrorState } from "../../components/ui/error-state";
import { PROJECT_COLUMNS, getPlan, toProject } from "../../lib/projects/projects";
import { createOwnerClient } from "../../lib/supabase/owner";

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // Owner client: RLS scopes the list to this user. The plan is read here, on the server.
  const [plan, { data, error }] = await Promise.all([
    getPlan(userId),
    createOwnerClient()
      .from("projects")
      .select(PROJECT_COLUMNS)
      .order("created_at", { ascending: false }),
  ]);
  if (error) return <ErrorState description="We couldn't load your projects. Please reload the page." />;

  return (
    <ProjectsView
      initialProjects={data.map(toProject)}
      maxProjects={PLAN_LIMITS[plan].projects}
      messagesPerMonth={PLAN_LIMITS[plan].messagesPerMonth}
      limitMessage={limitMessage(plan)}
      planName={plan === "pro" ? "Pro" : "Free"}
    />
  );
}
