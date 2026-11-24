import { auth } from "@clerk/nextjs/server";
import { after } from "next/server";
import { idParamsSchema, pasteKnowledgeRequestSchema } from "@askwell/shared";
import type { PasteKnowledgeResponse } from "@askwell/shared";
import { processSource, reserveSource, toKnowledgeSource } from "../../../../../lib/knowledge";
import { errorResponse, getOwnedProject, getPlan } from "../../../../../lib/projects/projects";

/** Seconds `after()` may keep running to embed the text. Vercel limits are noted in the PR. */
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };

/** POST /api/projects/:id/knowledge: paste text. Returns the source in `processing`. */
export async function POST(request: Request, context: Context) {
  const { userId } = await auth();
  if (!userId) return errorResponse("unauthorized", "Sign in to use this endpoint.");

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return errorResponse("validation_error", "Invalid project id.");
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = pasteKnowledgeRequestSchema.safeParse(body);
  if (!parsed.success) return errorResponse("validation_error", "A title and some text are required.");

  try {
    // Ownership first (RLS). Only then may the service client write.
    const project = await getOwnedProject(params.data.id);
    if (!project) return errorResponse("not_found", "Project not found.");

    const plan = await getPlan(userId);
    const reserved = await reserveSource(project.id, parsed.data.title, "text", plan);
    if (!reserved.ok) {
      return reserved.reason === "plan_limit"
        ? errorResponse("plan_limit", "Your plan's knowledge source limit is reached. Delete one or upgrade.")
        : errorResponse("not_found", "Project not found.");
    }

    const sourceId = reserved.source.id;
    const text = parsed.data.text;
    after(async () => {
      await processSource({ sourceId, text });
    });
    return Response.json({ source: toKnowledgeSource(reserved.source) } satisfies PasteKnowledgeResponse);
  } catch (err) {
    console.error("paste knowledge failed:", err instanceof Error ? err.message : err);
    return errorResponse("internal", "Could not add the text.");
  }
}
