import { auth } from "@clerk/nextjs/server";
import { idParamsSchema } from "@askwell/shared";
import type { DeleteKnowledgeResponse } from "@askwell/shared";
import { removeSource } from "../../../../lib/knowledge";
import { errorResponse } from "../../../../lib/projects/projects";
import { createOwnerClient } from "../../../../lib/supabase/owner";

type Context = { params: Promise<{ id: string }> };

/** DELETE /api/knowledge/:id: remove a source, its file and (by cascade) its chunks. */
export async function DELETE(_request: Request, context: Context) {
  const { userId } = await auth();
  if (!userId) return errorResponse("unauthorized", "Sign in to use this endpoint.");

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return errorResponse("validation_error", "Invalid source id.");

  try {
    // Owner client: RLS proves ownership. Someone else's source matches no row.
    const { data: source, error } = await createOwnerClient()
      .from("knowledge_sources")
      .select("id, storage_key")
      .eq("id", params.data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!source) return errorResponse("not_found", "Source not found.");

    await removeSource(source.id, source.storage_key);
    return Response.json({ ok: true } satisfies DeleteKnowledgeResponse);
  } catch (err) {
    console.error("delete knowledge failed:", err instanceof Error ? err.message : err);
    return errorResponse("internal", "Could not delete the source.");
  }
}
