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
      <Link href="/dashboard" className="text-sm text-ink-muted hover:text-ink">
        ← Projects
      </Link>
      <h1 className="mb-4 mt-2 truncate text-2xl font-semibold">{project.name}</h1>
      <ProjectSubnav projectId={project.id} />
      {children}
    </>
  );
}
