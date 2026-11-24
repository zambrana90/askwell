"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  KNOWLEDGE_FILE_MIME_TYPES,
  MAX_KNOWLEDGE_TEXT_LENGTH,
  MAX_KNOWLEDGE_TITLE_LENGTH,
} from "@askwell/shared";
import type {
  DeleteKnowledgeResponse,
  FinalizeKnowledgeResponse,
  KnowledgeSource,
  PasteKnowledgeResponse,
  UploadUrlResponse,
} from "@askwell/shared";
import { ConfirmDialog } from "../projects/confirm-dialog";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Panel } from "../ui/panel";
import { call, checkFile, mimeFor, uploadToStorage } from "./api";

type Props = {
  projectId: string;
  initialSources: KnowledgeSource[];
  /** The plan's source limit, read on the server. The API stays the real check. */
  maxSources: number;
  limitMessage: string;
  /** How often to refresh while something is processing. Tests lower it. */
  pollMs?: number;
};

const STATUS_LABEL: Record<KnowledgeSource["status"], string> = {
  uploading: "Processing",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};
const TYPE_LABEL: Record<KnowledgeSource["type"], string> = {
  text: "Text",
  pdf: "PDF",
  md: "Markdown",
  txt: "TXT",
};
const isPending = (s: KnowledgeSource) => s.status === "uploading" || s.status === "processing";
const ACCEPT = [...Object.keys(KNOWLEDGE_FILE_MIME_TYPES).map((e) => `.${e}`)].join(",");

// UTC so the server and the browser print the same date.
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

export function KnowledgeView({ projectId, initialSources, maxSources, limitMessage, pollMs = 4000 }: Props) {
  const router = useRouter();
  const [sources, setSources] = useState(initialSources);
  const [limitHit, setLimitHit] = useState(false);

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [pasting, setPasting] = useState(false);
  const [pasteError, setPasteError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<KnowledgeSource | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // A refresh brings new server data in through the props: take it when the prop changes.
  const [seen, setSeen] = useState(initialSources);
  if (seen !== initialSources) {
    setSeen(initialSources);
    setSources(initialSources);
  }

  const anyPending = sources.some(isPending);
  useEffect(() => {
    if (!anyPending) return;
    const id = setInterval(() => router.refresh(), pollMs);
    return () => clearInterval(id);
  }, [anyPending, pollMs, router]);

  const atLimit = sources.length >= maxSources;
  const showLimit = atLimit || limitHit;
  const busy = pasting || uploading;
  const base = `/api/projects/${projectId}/knowledge`;

  function add(source: KnowledgeSource) {
    setSources((list) => [source, ...list.filter((s) => s.id !== source.id)]);
    router.refresh();
  }

  async function onPaste(e: FormEvent) {
    e.preventDefault();
    if (atLimit || !title.trim() || !text.trim()) return;
    setPasting(true);
    setPasteError(null);
    const res = await call<PasteKnowledgeResponse>("POST", base, { title: title.trim(), text: text.trim() });
    setPasting(false);
    if (res.ok) {
      add(res.data.source);
      setTitle("");
      setText("");
    } else if (res.code === "plan_limit") {
      setLimitHit(true);
    } else {
      setPasteError(res.message);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploadError(null);
    const problem = checkFile(file);
    if (problem) {
      setUploadError(problem);
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    const done = (message: string | null) => {
      setUploading(false);
      setUploadError(message);
      if (fileRef.current) fileRef.current.value = "";
    };

    const reserved = await call<UploadUrlResponse>("POST", `${base}/upload-url`, {
      fileName: file.name,
      size: file.size,
      mime: mimeFor(file.name),
    });
    if (!reserved.ok) {
      if (reserved.code === "plan_limit") setLimitHit(true);
      return done(reserved.code === "plan_limit" ? null : reserved.message);
    }
    const stored = await uploadToStorage(reserved.data.path, reserved.data.token, file);
    if (!stored.ok) {
      router.refresh(); // the reserved source is still listed; show it
      return done(stored.message);
    }
    const finalized = await call<FinalizeKnowledgeResponse>("POST", `${base}/finalize`, {
      sourceId: reserved.data.sourceId,
    });
    if (!finalized.ok) {
      router.refresh();
      return done(finalized.message);
    }
    add(finalized.data.source);
    done(null);
  }

  async function onDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const res = await call<DeleteKnowledgeResponse>("DELETE", `/api/knowledge/${deleting.id}`);
    setDeleteBusy(false);
    // A 404 means it is already gone, so the list should drop it too.
    if (res.ok || res.code === "not_found") {
      const id = deleting.id;
      setSources((list) => list.filter((s) => s.id !== id));
      setLimitHit(false);
      setDeleting(null);
      router.refresh();
    } else {
      setDeleteError(res.message);
    }
  }

  const input =
    "min-h-10 rounded-glass border border-glass-edge bg-canvas px-3 text-sm text-ink disabled:opacity-50";

  return (
    <>
      <h2 ref={headingRef} tabIndex={-1} className="sr-only">
        Knowledge
      </h2>
      <p className="mb-4 text-sm text-ink-muted" data-testid="source-count">
        {sources.length} of {maxSources} sources
      </p>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Panel className="p-4">
          <form onSubmit={onPaste} className="flex flex-col gap-3">
            <h3 className="font-medium">Paste text</h3>
            <div className="flex flex-col gap-1">
              <label htmlFor="paste-title" className="text-sm font-medium">
                Title
              </label>
              <input
                id="paste-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={MAX_KNOWLEDGE_TITLE_LENGTH}
                disabled={atLimit || busy}
                className={input}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="paste-text" className="text-sm font-medium">
                Text
              </label>
              <textarea
                id="paste-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={MAX_KNOWLEDGE_TEXT_LENGTH}
                rows={6}
                disabled={atLimit || busy}
                className={`${input} py-2`}
              />
            </div>
            <Button type="submit" loading={pasting} disabled={atLimit || busy || !title.trim() || !text.trim()}>
              Add text
            </Button>
            {pasteError ? (
              <p role="alert" className="text-sm">
                {pasteError}
              </p>
            ) : null}
          </form>
        </Panel>

        <Panel className="flex flex-col gap-3 p-4">
          <h3 className="font-medium">Upload a file</h3>
          <div className="flex flex-col gap-1">
            <label htmlFor="file-input" className="text-sm font-medium">
              File (PDF, Markdown or TXT, up to 10 MB)
            </label>
            <input
              id="file-input"
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              disabled={atLimit || busy}
              onChange={(e) => void onFile(e.target.files?.[0])}
              className="text-sm text-ink file:mr-3 file:min-h-10 file:rounded-glass file:border file:border-glass-edge file:bg-glass file:px-4 file:text-ink disabled:opacity-50"
            />
          </div>
          {uploading ? (
            <p role="status" className="text-sm text-ink-muted">
              Uploading…
            </p>
          ) : null}
          {uploadError ? (
            <p role="alert" className="text-sm">
              {uploadError}
            </p>
          ) : null}
        </Panel>
      </div>

      {showLimit ? (
        <p role="status" className="mb-6 text-sm text-ink-muted">
          {limitMessage}
        </p>
      ) : null}

      {sources.length === 0 ? (
        <EmptyState
          title="No knowledge yet"
          description="Paste text or upload a file. The chat widget answers from what you add here."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {sources.map((s) => (
            <li key={s.id}>
              <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  {/* Text only: titles are owner input and never rendered as HTML. */}
                  <p className="truncate font-medium">{s.title}</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {TYPE_LABEL[s.type]} · Added {formatDate(s.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    data-status={s.status}
                    className="rounded-full border border-glass-edge px-2.5 py-0.5 text-xs font-medium"
                  >
                    {STATUS_LABEL[s.status]}
                  </span>
                  <Button
                    variant="secondary"
                    aria-label={`Delete ${s.title}`}
                    onClick={() => {
                      setDeleting(s);
                      setDeleteError(null);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}

      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.title}?`}
          description="This deletes the source, its file and its chunks. The chat widget stops using it. This can't be undone."
          confirmLabel="Delete source"
          busy={deleteBusy}
          error={deleteError}
          onConfirm={onDelete}
          onCancel={() => setDeleting(null)}
          fallbackFocus={() => headingRef.current}
        />
      ) : null}
    </>
  );
}
