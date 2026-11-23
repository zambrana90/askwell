"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import type {
  ApiError,
  CreateProjectResponse,
  DeleteProjectResponse,
  Project,
  RenameProjectResponse,
} from "@askwell/shared";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Panel } from "../ui/panel";
import { ConfirmDialog } from "./confirm-dialog";

type Props = {
  initialProjects: Project[];
  /** The plan's project limit, read on the server. The API stays the real check. */
  maxProjects: number;
  /** The plan's monthly message limit per project, for the usage text. */
  messagesPerMonth: number;
  /** Shown when the owner is at the limit, and after a 403 `plan_limit`. */
  limitMessage: string;
};

type Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

async function call<T>(method: string, url: string, body?: unknown): Promise<Result<T>> {
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

// UTC so the server and the browser print the same date.
const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

export function ProjectsView({ initialProjects, maxProjects, messagesPerMonth, limitMessage }: Props) {
  const [projects, setProjects] = useState(initialProjects);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [limitHit, setLimitHit] = useState(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState<Project | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const atLimit = projects.length >= maxProjects;
  const showLimit = atLimit || limitHit;

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || atLimit) return;
    setCreating(true);
    setCreateError(null);
    const res = await call<CreateProjectResponse>("POST", "/api/projects", { name: trimmed });
    setCreating(false);
    if (res.ok) {
      setProjects((p) => [res.data.project, ...p]);
      setName("");
      setLimitHit(false);
    } else if (res.code === "plan_limit") {
      setLimitHit(true);
    } else {
      setCreateError(res.message);
    }
  }

  function startRename(p: Project) {
    setRenamingId(p.id);
    setRenameValue(p.name);
    setRenameError(null);
  }

  async function onRename(e: FormEvent) {
    e.preventDefault();
    const trimmed = renameValue.trim();
    if (!renamingId || !trimmed) return;
    setRenaming(true);
    setRenameError(null);
    const res = await call<RenameProjectResponse>("PATCH", `/api/projects/${renamingId}`, { name: trimmed });
    setRenaming(false);
    if (res.ok) {
      setProjects((list) => list.map((p) => (p.id === res.data.project.id ? res.data.project : p)));
      setRenamingId(null);
    } else {
      setRenameError(res.message);
    }
  }

  async function onDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    const res = await call<DeleteProjectResponse>("DELETE", `/api/projects/${deleting.id}`);
    setDeleteBusy(false);
    // A 404 means it is already gone, so the list should drop it too.
    if (res.ok || res.code === "not_found") {
      const id = deleting.id;
      setProjects((list) => list.filter((p) => p.id !== id));
      setLimitHit(false);
      setDeleting(null);
    } else {
      setDeleteError(res.message);
    }
  }

  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className="mb-6 text-2xl font-semibold outline-none">
        Projects
      </h1>

      <Panel className="mb-6 p-4">
        <form onSubmit={onCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="project-name" className="text-sm font-medium">
              Project name
            </label>
            <input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              disabled={atLimit || creating}
              placeholder="My website"
              className="min-h-10 rounded-glass border border-glass-edge bg-canvas px-3 text-sm text-ink disabled:opacity-50"
            />
          </div>
          <Button type="submit" loading={creating} disabled={atLimit || !name.trim()}>
            Create project
          </Button>
        </form>
        {showLimit ? <p className="mt-3 text-sm text-ink-muted">{limitMessage}</p> : null}
        {createError ? (
          <p role="alert" className="mt-3 text-sm">
            {createError}
          </p>
        ) : null}
      </Panel>

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Create a project to add knowledge and a chat widget to your site."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                {renamingId === p.id ? (
                  <form onSubmit={onRename} className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                    <label htmlFor={`rename-${p.id}`} className="sr-only">
                      New name for {p.name}
                    </label>
                    <input
                      id={`rename-${p.id}`}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      maxLength={80}
                      autoFocus
                      className="min-h-10 flex-1 rounded-glass border border-glass-edge bg-canvas px-3 text-sm text-ink"
                    />
                    <div className="flex gap-2">
                      <Button type="submit" loading={renaming} disabled={!renameValue.trim()}>
                        Save
                      </Button>
                      <Button variant="secondary" onClick={() => setRenamingId(null)} disabled={renaming}>
                        Cancel
                      </Button>
                    </div>
                    {renameError ? (
                      <p role="alert" className="text-sm sm:basis-full">
                        {renameError}
                      </p>
                    ) : null}
                  </form>
                ) : (
                  <>
                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/projects/${p.id}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {p.name}
                      </Link>
                      <p className="mt-1 text-sm text-ink-muted">
                        Created {formatDate(p.createdAt)} · {p.messagesUsed} of {messagesPerMonth} messages this month
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => startRename(p)} aria-label={`Rename ${p.name}`}>
                        Rename
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setDeleting(p);
                          setDeleteError(null);
                        }}
                        aria-label={`Delete ${p.name}`}
                      >
                        Delete
                      </Button>
                    </div>
                  </>
                )}
              </Panel>
            </li>
          ))}
        </ul>
      )}

      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          description={`This deletes "${deleting.name}", its knowledge and its conversations. This can't be undone.`}
          confirmLabel="Delete project"
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
