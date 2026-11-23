import { notFound } from "next/navigation";
import { loadOwnedProject } from "../../../../components/projects/owned-project";
import { Panel } from "../../../../components/ui/panel";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await loadOwnedProject(id);
  if (!project) notFound();

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
        <dd>{project.messagesUsed}</dd>
      </dl>
    </Panel>
  );
}
