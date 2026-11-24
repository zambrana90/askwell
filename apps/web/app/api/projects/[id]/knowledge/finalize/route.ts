import { auth } from "@clerk/nextjs/server";
import { after } from "next/server";
import {
  MAX_KNOWLEDGE_FILE_BYTES,
  finalizeKnowledgeRequestSchema,
  idParamsSchema,
} from "@askwell/shared";
import type { FinalizeKnowledgeResponse } from "@askwell/shared";
import {
  KNOWLEDGE_BUCKET,
  SOURCE_COLUMNS,
  STALE_UPLOAD_MS,
  processSource,
  removeSource,
  toKnowledgeSource,
} from "../../../../../../lib/knowledge";
import { errorResponse, getOwnedProject } from "../../../../../../lib/projects/projects";
import { createServiceClient } from "../../../../../../lib/supabase/service";

/** Seconds `after()` may keep running to extract and embed the file. Limits are noted in the PR. */
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };

const PDF_MAGIC = "%PDF-";

/** True if the stored object exists, is within the size limit and, for a pdf, starts with %PDF-. */
async function storedFileIsValid(storageKey: string, type: string): Promise<boolean> {
  const { data, error } = await createServiceClient().storage.from(KNOWLEDGE_BUCKET).download(storageKey);
  if (error || !data) return false;
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_KNOWLEDGE_FILE_BYTES) return false;
  if (type === "pdf") return new TextDecoder("latin1").decode(bytes.subarray(0, PDF_MAGIC.length)) === PDF_MAGIC;
  return true;
}

/** POST /api/projects/:id/knowledge/finalize: the browser has uploaded; check the file and process it. */
export async function POST(request: Request, context: Context) {
  const { userId } = await auth();
  if (!userId) return errorResponse("unauthorized", "Sign in to use this endpoint.");

  const params = idParamsSchema.safeParse(await context.params);
  if (!params.success) return errorResponse("validation_error", "Invalid project id.");
  const body: unknown = await request.json().catch(() => undefined);
  const parsed = finalizeKnowledgeRequestSchema.safeParse(body);
  if (!parsed.success) return errorResponse("validation_error", "A source id is required.");

  try {
    const project = await getOwnedProject(params.data.id);
    if (!project) return errorResponse("not_found", "Project not found.");

    // Claim once: a single conditional update. A second call, another project's source, or a
    // reservation older than 2 hours matches no row.
    const cutoff = new Date(Date.now() - STALE_UPLOAD_MS).toISOString();
    const db = createServiceClient();
    const { data: claimed, error: claimError } = await db
      .from("knowledge_sources")
      .update({ status: "processing" })
      .eq("id", parsed.data.sourceId)
      .eq("project_id", project.id)
      .eq("status", "uploading")
      .gt("created_at", cutoff)
      .select(`${SOURCE_COLUMNS}, storage_key`)
      .maybeSingle();
    if (claimError) throw new Error(claimError.message);
    if (!claimed) return errorResponse("not_found", "Upload not found or expired.");

    if (!claimed.storage_key || !(await storedFileIsValid(claimed.storage_key, claimed.type))) {
      await removeSource(claimed.id, claimed.storage_key);
      return errorResponse("validation_error", "The uploaded file is missing, too large or not a valid file.");
    }

    const sourceId = claimed.id;
    after(async () => {
      await processSource({ sourceId });
    });
    return Response.json({ source: toKnowledgeSource(claimed) } satisfies FinalizeKnowledgeResponse);
  } catch (err) {
    console.error("finalize knowledge failed:", err instanceof Error ? err.message : err);
    return errorResponse("internal", "Could not process the upload.");
  }
}
