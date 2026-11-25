import Link from "next/link";
import { EmptyState } from "../ui/empty-state";
import { BUTTON_VARIANTS, CLICKABLE } from "../ui/interactive";

export function ProjectNotFound() {
  return (
    <EmptyState
      title="Project not found"
      description="It may have been deleted, or it belongs to another account."
      action={
        <Link
          href="/dashboard"
          className={`inline-flex min-h-10 items-center rounded-glass px-4 text-sm font-medium ${CLICKABLE} ${BUTTON_VARIANTS.secondary}`}
        >
          Back to projects
        </Link>
      }
    />
  );
}
