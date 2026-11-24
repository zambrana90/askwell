import { auth } from "@clerk/nextjs/server";
import { idParamsSchema } from "@askwell/shared";
import { NotFoundError, getThread } from "../../../../lib/conversations/conversations";
import { errorResponse } from "../../../../lib/projects/projects";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { userId } = await auth();
  if (!userId) return errorResponse("unauthorized", "Sign in to use this endpoint.");

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return errorResponse("validation_error", "Invalid conversation id.");

  try {
    return Response.json(await getThread(params.data.id));
  } catch (err) {
    if (err instanceof NotFoundError) return errorResponse("not_found", "Conversation not found.");
    console.error("get conversation failed:", err instanceof Error ? err.message : "unknown error");
    return errorResponse("internal", "Could not load the conversation.");
  }
}
