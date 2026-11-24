import "server-only";
import type { KnowledgeSource, Plan } from "@askwell/shared";
import { PLAN_LIMITS } from "@askwell/shared";
import { createServiceClient } from "../supabase/service";
import { KNOWLEDGE_BUCKET } from "./process";

/** An `uploading` source older than this is abandoned: finalize refuses it, upload-url reclaims it. */
export const STALE_UPLOAD_MS = 2 * 60 * 60 * 1000;

export const SOURCE_COLUMNS = "id, title, type, status, created_at";

/** Postgres `raise exception ... using errcode = 'P0001'` from reserve_knowledge_source. */
const PLAN_LIMIT_ERRCODE = "P0001";
const PROJECT_NOT_FOUND_ERRCODE = "P0002";

type SourceRow = { id: string; title: string; type: string; status: string; created_at: string };

/** snake_case row to the API's `KnowledgeSource`. Leaves out `storage_key` and `project_id`. */
export function toKnowledgeSource(row: SourceRow): KnowledgeSource {
  return {
    id: row.id,
    title: row.title,
    type: row.type as KnowledgeSource["type"],
    status: row.status as KnowledgeSource["status"],
    createdAt: row.created_at,
  };
}

export type ReserveResult =
  | { ok: true; source: SourceRow & { storage_key: string | null } }
  | { ok: false; reason: "plan_limit" | "not_found" };

/**
 * Reserves a source under the plan limit (atomic, in the database).
 * The caller MUST have checked ownership of `projectId` first (service client, project.md §9).
 * The limit comes from the server-side plan, never from the client.
 */
export async function reserveSource(
  projectId: string,
  title: string,
  type: string,
  plan: Plan,
): Promise<ReserveResult> {
  const { data, error } = await createServiceClient().rpc("reserve_knowledge_source", {
    p_project_id: projectId,
    p_title: title,
    p_type: type,
    p_max_sources: PLAN_LIMITS[plan].knowledgeSources,
  });
  if (error) {
    if (error.code === PLAN_LIMIT_ERRCODE && error.message === "plan_limit") {
      return { ok: false, reason: "plan_limit" };
    }
    if (error.code === PROJECT_NOT_FOUND_ERRCODE) return { ok: false, reason: "not_found" };
    throw new Error(`reserve_knowledge_source failed: ${error.message}`);
  }
  return { ok: true, source: data };
}

/**
 * Deletes this project's `uploading` sources older than STALE_UPLOAD_MS: Storage objects first,
 * then rows. Caller MUST have checked ownership of `projectId`.
 *
 * Each stale row is first claimed with one conditional update (`uploading` → `failed`, still
 * stale). Finalize claims with `status = 'uploading'` too, so exactly one of them wins a row:
 * files and rows are removed only for rows this call claimed. If removing the files fails, the
 * or deleting the rows fails, the claim is undone (back to `uploading`, still stale) so a later
 * call retries.
 */
export async function reclaimStaleUploads(projectId: string): Promise<void> {
  const db = createServiceClient();
  const cutoff = new Date(Date.now() - STALE_UPLOAD_MS).toISOString();
  const { data: claimed, error } = await db
    .from("knowledge_sources")
    .update({ status: "failed" })
    .eq("project_id", projectId)
    .eq("status", "uploading")
    .lt("created_at", cutoff)
    .select("id, storage_key");
  if (error) throw new Error(`reclaimStaleUploads failed: ${error.message}`);
  if (!claimed || claimed.length === 0) return;

  const ids = claimed.map((s) => s.id);
  const keys = claimed.map((s) => s.storage_key).filter((k): k is string => !!k);
  if (keys.length > 0) {
    const { error: removeError } = await db.storage.from(KNOWLEDGE_BUCKET).remove(keys);
    if (removeError) {
      await db.from("knowledge_sources").update({ status: "uploading" }).in("id", ids).eq("status", "failed");
      throw new Error(`reclaimStaleUploads storage failed: ${removeError.message}`);
    }
  }
  const { error: deleteError } = await db.from("knowledge_sources").delete().in("id", ids);
  if (deleteError) {
    // The files are already gone; removing missing objects is a no-op, so a retry is safe.
    await db.from("knowledge_sources").update({ status: "uploading" }).in("id", ids).eq("status", "failed");
    throw new Error(`reclaimStaleUploads delete failed: ${deleteError.message}`);
  }
}

/** Files listed per sweep. A project has at most a few dozen real ones, so orphans can't hide. */
const SWEEP_PAGE_SIZE = 1000;

/**
 * Removes this project's Storage files that no source row points to. A signed upload URL stays
 * valid for 2 hours even after its source is deleted, so a late upload leaves such a file.
 * Best effort: a failure is logged and the next call tries again.
 * Caller MUST have checked ownership of `projectId`.
 */
export async function removeOrphanFiles(projectId: string): Promise<void> {
  try {
    const db = createServiceClient();
    const bucket = db.storage.from(KNOWLEDGE_BUCKET);
    // Files first, rows second: a row always exists before its upload URL is signed, so a
    // listed file without a row afterwards can only belong to a deleted source.
    const { data: files, error: listError } = await bucket.list(projectId, { limit: SWEEP_PAGE_SIZE });
    if (listError) throw new Error(listError.message);
    if (files.length === 0) return;
    const { data: rows, error } = await db.from("knowledge_sources").select("storage_key").eq("project_id", projectId);
    if (error) throw new Error(error.message);
    const kept = new Set(rows.map((r) => r.storage_key));
    const orphans = files.map((f) => `${projectId}/${f.name}`).filter((key) => !kept.has(key));
    if (orphans.length === 0) return;
    const { error: removeError } = await bucket.remove(orphans);
    if (removeError) throw new Error(removeError.message);
  } catch (err) {
    console.error(`orphan file sweep failed for project ${projectId}:`, err instanceof Error ? err.message : err);
  }
}

/** Files listed per request while removing a whole project's files. */
const REMOVE_PAGE_SIZE = 100;

/**
 * Removes every Storage file of a project, page by page, before the project is deleted.
 * The caller MUST pass the id of a project it has proved the signed-in owner owns: it is the
 * only thing that scopes the removal. Throws if Storage fails or removes nothing.
 */
export async function removeProjectFiles(projectId: string): Promise<void> {
  // An empty prefix would list the whole bucket.
  if (!projectId) throw new Error("removeProjectFiles needs a project id");
  const bucket = createServiceClient().storage.from(KNOWLEDGE_BUCKET);
  for (;;) {
    // Always the first page: what was listed before is gone.
    const { data: files, error: listError } = await bucket.list(projectId, { limit: REMOVE_PAGE_SIZE });
    if (listError) throw new Error(`removeProjectFiles list failed: ${listError.message}`);
    if (files.length === 0) return;
    const { data: removed, error } = await bucket.remove(files.map((f) => `${projectId}/${f.name}`));
    if (error) throw new Error(`removeProjectFiles remove failed: ${error.message}`);
    if (removed.length === 0) throw new Error("removeProjectFiles removed nothing");
  }
}

/**
 * Removes a source: its Storage object (if any), then the row (chunks cascade).
 * Caller MUST have proved ownership (owner-client read, or getOwnedProject).
 */
export async function removeSource(sourceId: string, storageKey: string | null): Promise<void> {
  const db = createServiceClient();
  if (storageKey) {
    const { error } = await db.storage.from(KNOWLEDGE_BUCKET).remove([storageKey]);
    if (error) throw new Error(`removeSource storage failed: ${error.message}`);
  }
  const { error } = await db.from("knowledge_sources").delete().eq("id", sourceId);
  if (error) throw new Error(`removeSource failed: ${error.message}`);
}
