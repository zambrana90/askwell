import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { ConversationList } from "../../../../../components/conversations/conversation-list";
import { loadOwnedProject } from "../../../../../components/projects/owned-project";
import { ErrorState } from "../../../../../components/ui/error-state";
import { NotFoundError, listConversations } from "../../../../../lib/conversations/conversations";

export default async function ConversationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const project = await loadOwnedProject(id);
  if (!project) notFound();

  // Owner client inside the helper: RLS scopes it.
  let conversations;
  try {
    ({ conversations } = await listConversations(project.id));
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    return <ErrorState description="We couldn't load your conversations. Please reload the page." />;
  }
  return <ConversationList projectId={project.id} conversations={conversations} now={new Date()} />;
}
