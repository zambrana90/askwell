import "server-only";
import { embedTexts } from "../ai";
import { createServiceClient } from "../supabase/service";
import type { KnowledgeSourceType } from "@askwell/shared";
import { chunkText, normalizeText } from "./chunk";
import { extractText } from "./extract";

export const KNOWLEDGE_BUCKET = "knowledge";
/** Chunk rows per insert, to keep each request body small (1536 numbers per row). */
export const INSERT_BATCH_SIZE = 50;

export type ProcessSourceInput = {
  sourceId: string;
  /** Pasted text. Required for `text` sources (nothing is stored as a file); ignored for files. */
  text?: string;
};

export type ProcessSourceResult = { status: "ready"; chunks: number } | { status: "failed" };

/**
 * Turns a source into searchable chunks: text → chunks → embeddings → rows → status `ready`.
 * On any failure it removes this source's chunks, sets `failed` and logs. It never throws.
 * Re-running on the same source replaces its chunks.
 *
 * Uses the service client: the caller (A3's routes) MUST have checked that the signed-in owner
 * owns this source's project before calling this.
 */
export async function processSource(input: ProcessSourceInput): Promise<ProcessSourceResult> {
  const { sourceId } = input;
  const db = createServiceClient();
  try {
    const { data: source, error: readError } = await db
      .from("knowledge_sources")
      .select("id, project_id, type, storage_key")
      .eq("id", sourceId)
      .maybeSingle();
    if (readError) throw readError;
    if (!source) throw new Error("Source not found");

    let text: string;
    if (source.storage_key) {
      const { data: file, error: downloadError } = await db.storage.from(KNOWLEDGE_BUCKET).download(source.storage_key);
      if (downloadError) throw downloadError;
      text = await extractText(new Uint8Array(await file.arrayBuffer()), source.type as KnowledgeSourceType);
    } else if (input.text !== undefined) {
      text = normalizeText(input.text);
    } else {
      throw new Error("No text given for a source without a file");
    }

    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error("No text could be extracted");
    const embeddings = await embedTexts(chunks);

    // Same source again: replace, never duplicate.
    await deleteChunks(db, sourceId);
    const rows = chunks.map((content, i) => ({
      project_id: source.project_id,
      source_id: sourceId,
      content,
      embedding: `[${embeddings[i]!.join(",")}]`,
    }));
    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      const { error } = await db.from("knowledge_chunks").insert(rows.slice(i, i + INSERT_BATCH_SIZE));
      if (error) throw error;
    }

    const { error: statusError } = await db.from("knowledge_sources").update({ status: "ready" }).eq("id", sourceId);
    if (statusError) throw statusError;
    return { status: "ready", chunks: chunks.length };
  } catch (err) {
    // Never log the text: it is the owner's document.
    console.error(`processSource failed for source ${sourceId}:`, err instanceof Error ? err.message : err);
    await markFailed(db, sourceId);
    return { status: "failed" };
  }
}

async function deleteChunks(db: ReturnType<typeof createServiceClient>, sourceId: string): Promise<void> {
  const { error } = await db.from("knowledge_chunks").delete().eq("source_id", sourceId);
  if (error) throw error;
}

/** Best effort: this runs inside a catch, so a failure here is logged and swallowed. */
async function markFailed(db: ReturnType<typeof createServiceClient>, sourceId: string): Promise<void> {
  try {
    await deleteChunks(db, sourceId);
    const { error } = await db.from("knowledge_sources").update({ status: "failed" }).eq("id", sourceId);
    if (error) throw error;
  } catch (err) {
    console.error(`Could not mark source ${sourceId} failed:`, err instanceof Error ? err.message : err);
  }
}
