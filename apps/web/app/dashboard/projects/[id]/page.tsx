import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { PLAN_LIMITS } from "@askwell/shared";
import { loadOwnedProject } from "../../../../components/projects/owned-project";
import { Panel } from "../../../../components/ui/panel";
import { getPlan } from "../../../../lib/projects/projects";
import { atLimitMessage, currentUsage } from "../../../../lib/usage/usage";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await loadOwnedProject(id);
  if (!project) notFound();

  // The plan is read here, on the server, never from the client.
  const { userId } = await auth();
  const plan = userId ? await getPlan(userId) : "free";
  const usage = currentUsage(project, PLAN_LIMITS[plan].messagesPerMonth, new Date());
  const percent = usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 100;

  return (
    <Panel className="p-4">
      <dl className="grid gap-4 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-ink-muted">Public key</dt>
        <dd>
          <code className="break-all rounded bg-glass-edge px-2 py-1">{project.publicKey}</code>
          <p className="mt-1 text-ink-muted">
            It only identifies this project on your site. It is safe to put in the page.
          </p>
        </dd>
        <dt className="text-ink-muted">Messages this month</dt>
        <dd>
          <p>
            {usage.used} of {usage.limit}
          </p>
          <div
            role="progressbar"
            aria-label="Messages this month"
            aria-valuemin={0}
            aria-valuemax={usage.limit}
            aria-valuenow={Math.min(usage.used, usage.limit)}
            className="mt-2 h-2 w-full max-w-xs overflow-hidden rounded bg-glass-edge"
          >
            <div className="h-full rounded bg-accent" style={{ width: `${percent}%` }} />
          </div>
          {usage.atLimit && <p className="mt-2 text-ink-muted">{atLimitMessage(plan)}</p>}
        </dd>
      </dl>
    </Panel>
  );
}
