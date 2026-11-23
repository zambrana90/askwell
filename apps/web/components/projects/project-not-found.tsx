import Link from "next/link";
import { EmptyState } from "../ui/empty-state";

export function ProjectNotFound() {
  return (
    <EmptyState
      title="Project not found"
      description="It may have been deleted, or it belongs to another account."
      action={
        <Link
          href="/dashboard"
          className="inline-flex min-h-10 items-center rounded-glass border border-glass-edge bg-glass px-4 text-sm font-medium hover:bg-glass-edge"
        >
          Back to projects
        </Link>
      }
    />
  );
}
