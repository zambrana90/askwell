import { createClient } from "@supabase/supabase-js";
import {
  KNOWLEDGE_FILE_MIME_TYPES,
  KNOWLEDGE_FILE_TYPES,
  MAX_KNOWLEDGE_FILE_BYTES,
} from "@askwell/shared";
import type { ApiError, KnowledgeFileType } from "@askwell/shared";
import { getSupabasePublicEnv } from "../../lib/supabase/env";

export type Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export async function call<T>(method: string, url: string, body?: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as T };
    const err = (json as ApiError | null)?.error;
    return { ok: false, code: err?.code ?? "internal", message: err?.message ?? "Something went wrong." };
  } catch {
    return { ok: false, code: "network", message: "Could not reach the server. Try again." };
  }
}

/** Fast browser-side check; the server checks again. Returns a message, or null if the file is fine. */
export function checkFile(file: { name: string; size: number }): string | null {
  const dot = file.name.lastIndexOf(".");
  const ext = dot === -1 ? "" : file.name.slice(dot + 1).toLowerCase();
  if (!(KNOWLEDGE_FILE_TYPES as readonly string[]).includes(ext)) {
    return "Only PDF, Markdown (.md) and text (.txt) files are supported.";
  }
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_KNOWLEDGE_FILE_BYTES) {
    return `That file is too large. The limit is ${MAX_KNOWLEDGE_FILE_BYTES / (1024 * 1024)} MB.`;
  }
  return null;
}

export function mimeFor(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase() as KnowledgeFileType;
  return KNOWLEDGE_FILE_MIME_TYPES[ext];
}

/** Straight to Storage with the one-time token. The file never passes through our routes. */
export async function uploadToStorage(path: string, token: string, file: File): Promise<Result<null>> {
  const { url, publishableKey } = getSupabasePublicEnv();
  const supabase = createClient(url, publishableKey);
  try {
    const { error } = await supabase.storage
      .from("knowledge")
      .uploadToSignedUrl(path, token, file, { contentType: mimeFor(file.name) });
    if (error) return { ok: false, code: "upload_failed", message: "The upload failed. Try again." };
    return { ok: true, data: null };
  } catch {
    return { ok: false, code: "network", message: "Could not reach the server. Try again." };
  }
}
