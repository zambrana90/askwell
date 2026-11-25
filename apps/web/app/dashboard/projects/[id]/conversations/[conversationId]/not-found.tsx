"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { EmptyState } from "../../../../../../components/ui/empty-state";
import { INLINE_LINK } from "../../../../../../components/ui/interactive";

export default function ConversationNotFound() {
  // A relative ".." would open the project page, so build the list path from the route's project id.
  const { id } = useParams<{ id: string }>();
  return (
    <EmptyState
      title="Conversation not found"
      description="It may have been deleted, or it isn't yours."
      action={
        <Link href={`/dashboard/projects/${id}/conversations`} className={`inline-flex min-h-10 items-center text-sm ${INLINE_LINK}`}>
          Back to conversations
        </Link>
      }
    />
  );
}
