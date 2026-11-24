import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const trackKnowledgeAdded = vi.fn();
vi.mock("../../../lib/analytics/events", () => ({
  trackKnowledgeAdded: (...a: unknown[]) => trackKnowledgeAdded(...a),
}));

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));

const afterTasks: Array<() => Promise<void> | void> = [];
vi.mock("next/server", () => ({ after: (fn: () => Promise<void> | void) => afterTasks.push(fn) }));

const processSource = vi.fn();
vi.mock("../../../lib/knowledge/process", () => ({
  KNOWLEDGE_BUCKET: "knowledge",
  processSource: (input: unknown) => processSource(input),
}));

type Row = Record<string, unknown>;
const state = {
  projects: [] as Row[],
  accounts: [] as Row[],
  sources: [] as Row[],
  files: new Map<string, Uint8Array>(),
  downloadError: null as null | { message: string; status?: number },
  removeFails: false,
  deleteFails: false,
  listFails: false,
};

/** A tiny in-memory query builder: eq / lt / gt / in filters, select / update / delete. */
function table(rows: () => Row[], mutate: (next: Row[]) => void, op: "select" | "update" | "delete" = "select", patch?: Row) {
  const filters: Array<(r: Row) => boolean> = [];
  const run = () => {
    const all = rows();
    const hit = all.filter((r) => filters.every((f) => f(r)));
    if (op === "update") for (const r of hit) Object.assign(r, patch);
    if (op === "delete") mutate(all.filter((r) => !hit.includes(r)));
    return hit;
  };
  const b: Record<string, unknown> = {
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
    lt: (c: string, v: string) => (filters.push((r) => (r[c] as string) < v), b),
    gt: (c: string, v: string) => (filters.push((r) => (r[c] as string) > v), b),
    in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), b),
    select: () => b,
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => {
      const hit = run();
      return Promise.resolve({ data: op === "delete" ? null : hit.map((r) => ({ ...r })), error: null }).then(res, rej);
    },
  };
  return b;
}

const ownedProjectIds = () => state.projects.filter((p) => p.owner_id === "user_1").map((p) => p.id);

vi.mock("../../../lib/supabase/owner", () => ({
  createOwnerClient: () => ({
    from: (name: "projects" | "accounts" | "knowledge_sources") => {
      // RLS: the signed-in owner sees only their own rows.
      const visible = () =>
        name === "projects"
          ? state.projects.filter((p) => p.owner_id === "user_1")
          : name === "accounts"
            ? state.accounts.filter((a) => a.clerk_user_id === "user_1")
            : state.sources.filter((s) => ownedProjectIds().includes(s.project_id));
      return { select: () => table(visible, () => undefined) };
    },
  }),
}));

let counter = 0;
vi.mock("../../../lib/supabase/service", () => ({
  createServiceClient: () => ({
    rpc: async (_fn: string, a: { p_project_id: string; p_title: string; p_type: string; p_max_sources: number }) => {
      if (state.sources.filter((s) => s.project_id === a.p_project_id).length >= a.p_max_sources) {
        return { data: null, error: { code: "P0001", message: "plan_limit" } };
      }
      const id = `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;
      const text = a.p_type === "text";
      const row = {
        id,
        project_id: a.p_project_id,
        title: a.p_title,
        type: a.p_type,
        storage_key: text ? null : `${a.p_project_id}/${id}.${a.p_type}`,
        status: text ? "processing" : "uploading",
        created_at: new Date().toISOString(),
      };
      state.sources.push(row);
      return { data: { ...row }, error: null };
    },
    from: (name: string) => {
      if (name !== "knowledge_sources") throw new Error(`unexpected table ${name}`);
      const set = (next: Row[]) => {
        state.sources.length = 0;
        state.sources.push(...next);
      };
      return {
        select: () => table(() => state.sources, set),
        update: (patch: Row) => table(() => state.sources, set, "update", patch),
        delete: () => {
          if (!state.deleteFails) return table(() => state.sources, set, "delete");
          const failing: Record<string, unknown> = {
            in: () => failing,
            eq: () => failing,
            then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: { message: "db down" } }).then(res),
          };
          return failing;
        },
      };
    },
    storage: {
      from: () => ({
        createSignedUploadUrl: async (path: string) => ({ data: { path, token: "tok_1" }, error: null }),
        download: async (path: string) => {
          if (state.downloadError) return { data: null, error: state.downloadError };
          const bytes = state.files.get(path);
          if (!bytes) return { data: null, error: { message: "Object not found", status: 404 } };
          return { data: { arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }, error: null };
        },
        list: async (prefix: string) => {
          if (state.listFails) return { data: null, error: { message: "storage down" } };
          const names = [...state.files.keys()].filter((k) => k.startsWith(`${prefix}/`)).map((k) => ({ name: k.slice(prefix.length + 1) }));
          return { data: names, error: null };
        },
        remove: async (paths: string[]) => {
          if (state.removeFails) return { data: null, error: { message: "storage down" } };
          for (const p of paths) state.files.delete(p);
          return { data: [], error: null };
        },
      }),
    },
  }),
}));

import { POST as paste } from "../../../app/api/projects/[id]/knowledge/route";
import { POST as uploadUrl } from "../../../app/api/projects/[id]/knowledge/upload-url/route";
import { POST as finalize } from "../../../app/api/projects/[id]/knowledge/finalize/route";
import { DELETE as remove } from "../../../app/api/knowledge/[id]/route";
import { STALE_UPLOAD_MS } from "../../../lib/knowledge/sources";

const PROJECT = "5f0c2f0e-8a3a-4a53-9b0e-3a6f1d1a2b3c";
const OTHER_PROJECT = "6a1d3a1f-9b4b-4b64-8c1f-4b7a2e2b3c4d";
const post = (body: unknown) => new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const bytes = (s: string) => new TextEncoder().encode(s);
const projectRow = (id: string, owner: string): Row => ({
  id, name: "P", public_key: "pk_x", messages_used: 0, period_start: "2026-11-01T00:00:00Z", created_at: "2026-11-01T00:00:00Z", owner_id: owner,
});
const sourceRow = (over: Row): Row => ({
  id: "11111111-1111-4111-8111-111111111111", project_id: PROJECT, title: "a.pdf", type: "pdf",
  storage_key: `${PROJECT}/11111111-1111-4111-8111-111111111111.pdf`, status: "uploading", created_at: new Date().toISOString(), ...over,
});
const uploadBody = { fileName: "guide.pdf", size: 1000, mime: "application/pdf" };

beforeEach(() => {
  counter = 0;
  afterTasks.length = 0;
  trackKnowledgeAdded.mockReset();
  processSource.mockReset().mockResolvedValue({ status: "ready", chunks: 1 });
  authMock.mockReset().mockResolvedValue({ userId: "user_1" });
  state.projects = [projectRow(PROJECT, "user_1"), projectRow(OTHER_PROJECT, "user_2")];
  state.accounts = [{ clerk_user_id: "user_1", plan: "free" }];
  state.sources = [];
  state.files = new Map();
  state.downloadError = null;
  state.removeFails = false;
  state.deleteFails = false;
  state.listFails = false;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/projects/:id/knowledge (paste)", () => {
  test("401 without a session", async () => {
    authMock.mockResolvedValue({ userId: null });
    const res = await paste(post({ title: "t", text: "x" }), ctx(PROJECT));
    expect(res.status).toBe(401);
  });

  test("400 on a bad body", async () => {
    expect((await paste(post({ title: "" }), ctx(PROJECT))).status).toBe(400);
  });

  test("404 for another owner's project, and nothing is written", async () => {
    const res = await paste(post({ title: "t", text: "hello" }), ctx(OTHER_PROJECT));
    expect(res.status).toBe(404);
    expect(state.sources).toHaveLength(0);
  });

  test("returns the source in processing and processes the text after the response", async () => {
    const res = await paste(post({ title: "FAQ", text: "Opening hours" }), ctx(PROJECT));
    expect(res.status).toBe(200);
    const { source } = await res.json();
    expect(source).toMatchObject({ title: "FAQ", type: "text", status: "processing" });
    expect(source).not.toHaveProperty("storage_key");
    expect(processSource).not.toHaveBeenCalled();
    await afterTasks[0]!();
    expect(processSource).toHaveBeenCalledWith({ sourceId: source.id, text: "Opening hours" });
  });

  test("403 plan_limit at 3 sources on Free; Pro gets more", async () => {
    for (let i = 0; i < 3; i++) expect((await paste(post({ title: `t${i}`, text: "x" }), ctx(PROJECT))).status).toBe(200);
    const res = await paste(post({ title: "t3", text: "x" }), ctx(PROJECT));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("plan_limit");
    state.accounts[0]!.plan = "pro";
    expect((await paste(post({ title: "t3", text: "x" }), ctx(PROJECT))).status).toBe(200);
  });
});

describe("POST /api/projects/:id/knowledge/upload-url", () => {
  test("401 without a session", async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await uploadUrl(post(uploadBody), ctx(PROJECT))).status).toBe(401);
  });

  test("400 for a bad file type", async () => {
    const res = await uploadUrl(post({ fileName: "a.exe", size: 10, mime: "application/pdf" }), ctx(PROJECT));
    expect(res.status).toBe(400);
  });

  test("404 for another owner's project", async () => {
    expect((await uploadUrl(post(uploadBody), ctx(OTHER_PROJECT))).status).toBe(404);
    expect(state.sources).toHaveLength(0);
  });

  test("reserves an uploading source and returns a signed upload", async () => {
    const res = await uploadUrl(post(uploadBody), ctx(PROJECT));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBe("tok_1");
    expect(body.path).toBe(`${PROJECT}/${body.sourceId}.pdf`);
    expect(state.sources[0]).toMatchObject({ type: "pdf", status: "uploading", title: "guide.pdf" });
  });

  test("403 plan_limit at 3 sources on Free", async () => {
    state.sources = [1, 2, 3].map((n) => sourceRow({ id: `2222222${n}-2222-4222-8222-222222222222`, status: "ready" }));
    const res = await uploadUrl(post(uploadBody), ctx(PROJECT));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("plan_limit");
  });

  test("reclaims this project's stale uploading sources first (files, then rows)", async () => {
    const old = new Date(Date.now() - STALE_UPLOAD_MS - 60_000).toISOString();
    const stale = [1, 2, 3].map((n) => sourceRow({ id: `3333333${n}-3333-4333-8333-333333333333`, storage_key: `${PROJECT}/stale${n}.pdf`, created_at: old }));
    state.sources = stale;
    for (const s of stale) state.files.set(s.storage_key as string, bytes("%PDF-"));
    const res = await uploadUrl(post(uploadBody), ctx(PROJECT));
    expect(res.status).toBe(200); // would be 403 if the stale ones still held the 3 slots
    expect(state.files.size).toBe(0);
    expect(state.sources).toHaveLength(1);
  });

  test("reclaim leaves a stale-dated row that finalize already claimed (processing), file included", async () => {
    const old = new Date(Date.now() - STALE_UPLOAD_MS - 60_000).toISOString();
    const claimedRow = sourceRow({ status: "processing", created_at: old });
    state.sources = [claimedRow];
    state.files.set(claimedRow.storage_key as string, bytes("%PDF-"));
    expect((await uploadUrl(post(uploadBody), ctx(PROJECT))).status).toBe(200);
    expect(state.files.size).toBe(1);
    expect(state.sources.some((s) => s.id === claimedRow.id && s.status === "processing")).toBe(true);
  });

  test("reclaim: if removing files fails, stale rows go back to uploading for a later retry", async () => {
    const old = new Date(Date.now() - STALE_UPLOAD_MS - 60_000).toISOString();
    state.sources = [sourceRow({ created_at: old })];
    state.files.set(state.sources[0]!.storage_key as string, bytes("%PDF-"));
    state.removeFails = true;
    expect((await uploadUrl(post(uploadBody), ctx(PROJECT))).status).toBe(500);
    expect(state.sources).toHaveLength(1);
    expect(state.sources[0]!.status).toBe("uploading");
    state.removeFails = false;
    expect((await uploadUrl(post(uploadBody), ctx(PROJECT))).status).toBe(200);
    expect(state.files.size).toBe(0);
  });

  test("reclaim: if deleting rows fails after the files are gone, rows go back to uploading and a retry succeeds", async () => {
    const old = new Date(Date.now() - STALE_UPLOAD_MS - 60_000).toISOString();
    state.sources = [sourceRow({ created_at: old })];
    state.files.set(state.sources[0]!.storage_key as string, bytes("%PDF-"));
    state.deleteFails = true;
    expect((await uploadUrl(post(uploadBody), ctx(PROJECT))).status).toBe(500);
    expect(state.files.size).toBe(0);
    expect(state.sources).toHaveLength(1);
    expect(state.sources[0]!.status).toBe("uploading");
    state.deleteFails = false;
    expect((await uploadUrl(post(uploadBody), ctx(PROJECT))).status).toBe(200);
    expect(state.sources).toHaveLength(1); // only the new reservation
  });

  test("keeps fresh uploading sources", async () => {
    state.sources = [sourceRow({})];
    await uploadUrl(post(uploadBody), ctx(PROJECT));
    expect(state.sources).toHaveLength(2);
  });
});

describe("upload-url orphan sweep", () => {
  const orphan = `${PROJECT}/22222222-2222-4222-8222-222222222222.pdf`;
  const foreign = `${OTHER_PROJECT}/33333333-3333-4333-8333-333333333333.pdf`;

  test("removes a file uploaded after its source was deleted", async () => {
    const first = await (await uploadUrl(post(uploadBody), ctx(PROJECT))).json();
    expect((await remove(new Request("http://localhost/x"), ctx(first.sourceId))).status).toBe(200);
    state.files.set(first.path, bytes("%PDF-late")); // the signed URL still works
    expect((await uploadUrl(post(uploadBody), ctx(PROJECT))).status).toBe(200);
    expect(state.files.has(first.path)).toBe(false);
  });

  test("keeps files that have a source row, whatever its status, and other projects' files", async () => {
    const kept = ["uploading", "processing", "ready"].map((status, i) => {
      const id = `4444444${i}-4444-4444-8444-444444444444`;
      state.sources.push(sourceRow({ id, status, storage_key: `${PROJECT}/${id}.pdf` }));
      return `${PROJECT}/${id}.pdf`;
    });
    state.accounts = [{ clerk_user_id: "user_1", plan: "pro" }];
    for (const key of [...kept, orphan, foreign]) state.files.set(key, bytes("%PDF-"));
    await uploadUrl(post(uploadBody), ctx(PROJECT));
    expect([...state.files.keys()].sort()).toEqual([...kept, foreign].sort());
  });

  test("sweeps nothing for another owner's project", async () => {
    state.files.set(foreign, bytes("%PDF-"));
    expect((await uploadUrl(post(uploadBody), ctx(OTHER_PROJECT))).status).toBe(404);
    expect(state.files.has(foreign)).toBe(true);
  });

  test.each(["listFails", "removeFails"] as const)("a failed sweep (%s) doesn't block the upload", async (flag) => {
    state.files.set(orphan, bytes("%PDF-"));
    state[flag] = true;
    expect((await uploadUrl(post(uploadBody), ctx(PROJECT))).status).toBe(200);
    expect(state.files.has(orphan)).toBe(true);
  });
});

describe("POST /api/projects/:id/knowledge/finalize", () => {
  const SID = "11111111-1111-4111-8111-111111111111";
  const key = `${PROJECT}/${SID}.pdf`;

  test("401 without a session", async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await finalize(post({ sourceId: SID }), ctx(PROJECT))).status).toBe(401);
  });

  test("404 for another owner's project", async () => {
    state.sources = [sourceRow({ project_id: OTHER_PROJECT })];
    expect((await finalize(post({ sourceId: SID }), ctx(OTHER_PROJECT))).status).toBe(404);
    expect(state.sources[0]!.status).toBe("uploading");
  });

  test("404 when the source belongs to a different project than the URL's", async () => {
    state.sources = [sourceRow({ project_id: OTHER_PROJECT })];
    expect((await finalize(post({ sourceId: SID }), ctx(PROJECT))).status).toBe(404);
  });

  test("a real pdf: claimed as processing, processed after the response", async () => {
    state.sources = [sourceRow({})];
    state.files.set(key, bytes("%PDF-1.4 hello"));
    const res = await finalize(post({ sourceId: SID }), ctx(PROJECT));
    expect(res.status).toBe(200);
    expect((await res.json()).source).toMatchObject({ id: SID, status: "processing" });
    await afterTasks[0]!();
    expect(processSource).toHaveBeenCalledWith({ sourceId: SID });
  });

  test("finalize twice: the second is 404 and processes nothing", async () => {
    state.sources = [sourceRow({})];
    state.files.set(key, bytes("%PDF-1.4 hello"));
    expect((await finalize(post({ sourceId: SID }), ctx(PROJECT))).status).toBe(200);
    expect((await finalize(post({ sourceId: SID }), ctx(PROJECT))).status).toBe(404);
    expect(afterTasks).toHaveLength(1);
  });

  test("a fake pdf is refused: 400, file and source deleted", async () => {
    state.sources = [sourceRow({})];
    state.files.set(key, bytes("<html>not a pdf</html>"));
    const res = await finalize(post({ sourceId: SID }), ctx(PROJECT));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_error");
    expect(state.files.has(key)).toBe(false);
    expect(state.sources).toHaveLength(0);
    expect(afterTasks).toHaveLength(0);
  });

  test("a missing object is refused and the source deleted", async () => {
    state.sources = [sourceRow({})];
    expect((await finalize(post({ sourceId: SID }), ctx(PROJECT))).status).toBe(400);
    expect(state.sources).toHaveLength(0);
  });

  test("an oversized object is refused", async () => {
    state.sources = [sourceRow({})];
    state.files.set(key, new Uint8Array(10 * 1024 * 1024 + 1).fill(37));
    expect((await finalize(post({ sourceId: SID }), ctx(PROJECT))).status).toBe(400);
    expect(state.files.has(key)).toBe(false);
  });

  test("a txt file needs no magic bytes", async () => {
    const txtKey = `${PROJECT}/${SID}.txt`;
    state.sources = [sourceRow({ type: "txt", storage_key: txtKey })];
    state.files.set(txtKey, bytes("plain notes"));
    expect((await finalize(post({ sourceId: SID }), ctx(PROJECT))).status).toBe(200);
  });

  test("a transient download error keeps the file and source, and the claim is put back", async () => {
    state.sources = [sourceRow({})];
    state.files.set(key, bytes("%PDF-1.4 hello"));
    state.downloadError = { message: "fetch failed" };
    const res = await finalize(post({ sourceId: SID }), ctx(PROJECT));
    expect(res.status).toBe(500);
    expect(state.files.has(key)).toBe(true);
    expect(state.sources).toHaveLength(1);
    expect(state.sources[0]!.status).toBe("uploading");
    // The retry works.
    state.downloadError = null;
    expect((await finalize(post({ sourceId: SID }), ctx(PROJECT))).status).toBe(200);
  });

  test("a failed cleanup of a refused file restores the claim, so the next request can retry", async () => {
    state.sources = [sourceRow({})];
    state.files.set(key, bytes("<html>not a pdf</html>"));
    state.removeFails = true;
    expect((await finalize(post({ sourceId: SID }), ctx(PROJECT))).status).toBe(500);
    expect(state.sources[0]!.status).toBe("uploading");
    expect(afterTasks).toHaveLength(0);
    state.removeFails = false;
    expect((await finalize(post({ sourceId: SID }), ctx(PROJECT))).status).toBe(400);
    expect(state.sources).toHaveLength(0);
    expect(state.files.has(key)).toBe(false);
  });

  test("a reservation older than 2 hours is 404", async () => {
    state.sources = [sourceRow({ created_at: new Date(Date.now() - STALE_UPLOAD_MS - 60_000).toISOString() })];
    state.files.set(key, bytes("%PDF-1.4"));
    expect((await finalize(post({ sourceId: SID }), ctx(PROJECT))).status).toBe(404);
  });
});

describe("DELETE /api/knowledge/:id", () => {
  const SID = "11111111-1111-4111-8111-111111111111";
  const del = (id: string) => remove(new Request("http://localhost/x", { method: "DELETE" }), ctx(id));

  test("401 without a session", async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await del(SID)).status).toBe(401);
  });

  test("404 for another owner's source; nothing is deleted", async () => {
    state.sources = [sourceRow({ project_id: OTHER_PROJECT, status: "ready" })];
    state.files.set(`${PROJECT}/${SID}.pdf`, bytes("%PDF-"));
    expect((await del(SID)).status).toBe(404);
    expect(state.sources).toHaveLength(1);
    expect(state.files.size).toBe(1);
  });

  test("deletes the file and the row", async () => {
    state.sources = [sourceRow({ status: "ready" })];
    state.files.set(`${PROJECT}/${SID}.pdf`, bytes("%PDF-"));
    const res = await del(SID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(state.sources).toHaveLength(0);
    expect(state.files.size).toBe(0);
  });

  test("a pasted text source (no file) is deleted too", async () => {
    state.sources = [sourceRow({ type: "text", storage_key: null, status: "ready" })];
    expect((await del(SID)).status).toBe(200);
    expect(state.sources).toHaveLength(0);
  });
});

describe("knowledge_added", () => {
  const SOURCE = "11111111-1111-4111-8111-111111111111";
  const storageKey = `${PROJECT}/${SOURCE}.pdf`;

  test("once per successful paste, with ids and the type only", async () => {
    await paste(post({ title: "SECRET title", text: "SECRET text" }), ctx(PROJECT));
    expect(trackKnowledgeAdded.mock.calls).toEqual([["user_1", PROJECT, "text"]]);
  });

  test("once on finalize success; not again on a repeat", async () => {
    state.sources = [sourceRow({})];
    state.files.set(storageKey, bytes("%PDF-1.4 hello"));
    await finalize(post({ sourceId: SOURCE }), ctx(PROJECT));
    await finalize(post({ sourceId: SOURCE }), ctx(PROJECT));
    expect(trackKnowledgeAdded.mock.calls).toEqual([["user_1", PROJECT, "pdf"]]);
  });

  test("not sent on a refused paste, an upload reservation or an invalid file", async () => {
    await paste(post({ title: "" }), ctx(PROJECT));
    await paste(post({ title: "t", text: "x" }), ctx(OTHER_PROJECT));
    await uploadUrl(post(uploadBody), ctx(PROJECT));
    state.sources = [sourceRow({})];
    state.files.set(storageKey, bytes("not a pdf"));
    expect((await finalize(post({ sourceId: SOURCE }), ctx(PROJECT))).status).toBe(400);
    expect(trackKnowledgeAdded).not.toHaveBeenCalled();
  });
});
