import { auth } from "@clerk/nextjs/server";
import { idParamsSchema, uploadUrlRequestSchema } from "@askwell/shared";
import type { UploadUrlResponse } from "@askwell/shared";
import {
  KNOWLEDGE_BUCKET,
  reclaimStaleUploads,
  removeOrphanFiles,
  removeSource,
  reserveSource,
} from "../../../../../../lib/knowledge";
import { errorResponse, getOwnedProject, getPlan } from "../../../../../../lib/projects/projects";
import { createServiceClient } from "../../../../../../lib/supabase/service";

type Context = { params: Promise<{ id: string }> };

/** POST /api/projects/:id/knowledge/upload-url: reserve a file source and sign an upload URL. */
export async function POST(request: Request, context: Context) {
  const { userId } = await auth();
  if (!userId) return errorResponse("unauthorized", "Sign in to use this endpoint.");

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return errorResponse("validation_error", "Invalid project id.");
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = uploadUrlRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse("validation_error", "A pdf, md or txt file up to the size limit is required.");
  }

  try {
    const project = await getOwnedProject(params.data.id);
    if (!project) return errorResponse("not_found", "Project not found.");

    // Abandoned reservations must not hold a slot forever.
    await reclaimStaleUploads(project.id);
    // Files uploaded with the URL of a source that was deleted meanwhile.
    await removeOrphanFiles(project.id);

    const plan = await getPlan(userId);
    const { fileName } = parsed.data;
    const type = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase(); // schema: pdf | md | txt
    const reserved = await reserveSource(project.id, fileName, type, plan);
    if (!reserved.ok) {
      return reserved.reason === "plan_limit"
        ? errorResponse("plan_limit", "Your plan's knowledge source limit is reached. Delete one or upgrade.")
        : errorResponse("not_found", "Project not found.");
    }

    const { id, storage_key: path } = reserved.source;
    const { data, error } = path
      ? await createServiceClient().storage.from(KNOWLEDGE_BUCKET).createSignedUploadUrl(path)
      : { data: null, error: new Error("No storage key") };
    if (error || !data) {
      await removeSource(id, null).catch(() => undefined); // give the slot back
      throw error ?? new Error("No signed URL");
    }
    return Response.json({ sourceId: id, path: data.path, token: data.token } satisfies UploadUrlResponse);
  } catch (err) {
    console.error("upload-url failed:", err instanceof Error ? err.message : err);
    return errorResponse("internal", "Could not prepare the upload.");
  }
}
