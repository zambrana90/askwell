import Link from "next/link";
import { EmptyState } from "../../../../../../components/ui/empty-state";

export default function ConversationNotFound() {
  return (
    <EmptyState
      title="Conversation not found"
      description="It may have been deleted, or it isn't yours."
      action={
        <Link href=".." className="text-sm underline">
          Back to conversations
        </Link>
      }
    />
  );
}
