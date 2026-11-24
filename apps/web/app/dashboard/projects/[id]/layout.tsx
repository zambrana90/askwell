import Link from "next/link";
import { ProjectNotFound } from "../../../../components/projects/project-not-found";
import { ProjectSubnav } from "../../../../components/projects/project-subnav";
import { loadOwnedProject } from "../../../../components/projects/owned-project";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await loadOwnedProject(id);
  // Rendered here, not with notFound(): a layout's notFound() skips this segment's not-found.tsx.
  if (!project) return <ProjectNotFound />;

  return (
    <>
      <Link href="/dashboard" className="inline-flex min-h-10 items-center text-sm text-ink-muted hover:text-ink">
        ← Projects
      </Link>
      <h1 className="mb-4 text-2xl font-semibold wrap-anywhere">{project.name}</h1>
      <ProjectSubnav projectId={project.id} />
      {children}
    </>
  );
}
