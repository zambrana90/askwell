import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { idSchema } from "@askwell/shared";
import { ConversationThread } from "../../../../../../components/conversations/conversation-thread";
import { loadOwnedProject } from "../../../../../../components/projects/owned-project";
import { ErrorState } from "../../../../../../components/ui/error-state";
import { NotFoundError, getThread } from "../../../../../../lib/conversations/conversations";

export default async function ThreadPage({ params }: { params: Promise<{ id: string; conversationId: string }> }) {
  const { id, conversationId } = await params;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const project = await loadOwnedProject(id);
  if (!project || !idSchema.safeParse(conversationId).success) notFound();

  // Owner client inside the helper: a conversation that isn't visible under RLS is a 404.
  let thread;
  try {
    thread = await getThread(conversationId);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    return <ErrorState description="We couldn't load this conversation. Please reload the page." />;
  }
  return <ConversationThread projectId={project.id} thread={thread} />;
}
