"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { EmptyState } from "../../../../../../components/ui/empty-state";

export default function ConversationNotFound() {
  // A relative ".." would open the project page, so build the list path from the route's project id.
  const { id } = useParams<{ id: string }>();
  return (
    <EmptyState
      title="Conversation not found"
      description="It may have been deleted, or it isn't yours."
      action={
        <Link href={`/dashboard/projects/${id}/conversations`} className="text-sm underline">
          Back to conversations
        </Link>
      }
    />
  );
}
