import { beforeEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_WIDGET_CONFIG, PLAN_LIMITS } from "@askwell/shared";

vi.mock("server-only", () => ({}));

const trackProjectCreated = vi.fn();
vi.mock("../../../lib/analytics/events", () => ({
  trackProjectCreated: (...a: unknown[]) => trackProjectCreated(...a),
}));

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));

// Owner client: a thenable query builder that resolves to `result`.
let result: { data: unknown; error: unknown };
const calls: Array<[string, unknown[]]> = [];
const builder: Record<string, unknown> = {};
for (const m of ["select", "order", "update", "delete", "eq"]) {
  builder[m] = (...args: unknown[]) => {
    calls.push([m, args]);
    return builder;
  };
}
builder.maybeSingle = () => Promise.resolve(result);
builder.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
  Promise.resolve(result).then(res, rej);
const ownerFrom = vi.fn((table: string) => {
  calls.push(["from", [table]]);
  return builder;
});
vi.mock("../../../lib/supabase/owner", () => ({ createOwnerClient: () => ({ from: ownerFrom }) }));

const rpc = vi.fn();
const serviceFrom = vi.fn();
vi.mock("../../../lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc, from: serviceFrom }),
}));

const ensureAccount = vi.fn();
vi.mock("../../../lib/accounts", () => ({ ensureAccount: (id: string) => ensureAccount(id) }));

import { GET, POST } from "../../../app/api/projects/route";
import { DELETE, PATCH } from "../../../app/api/projects/[id]/route";
import { generatePublicKey, getOwnedProject, getPlan, toProject } from "../../../lib/projects/projects";

const ID = "5f0c2f0e-8a3a-4a53-9b0e-3a6f1d1a2b3c";
const row = {
  id: ID,
  name: "Docs",
  public_key: "pk_abc",
  messages_used: 3,
  period_start: "2026-11-01T00:00:00+00:00",
  created_at: "2026-11-02T00:00:00+00:00",
  owner_id: "user_1",
};
const project = {
  id: ID,
  name: "Docs",
  publicKey: "pk_abc",
  messagesUsed: 3,
  periodStart: "2026-11-01T00:00:00+00:00",
  createdAt: "2026-11-02T00:00:00+00:00",
};
const json = (body: unknown) =>
  new Request("http://localhost/api/projects", { method: "POST", body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  trackProjectCreated.mockReset();
  calls.length = 0;
  result = { data: null, error: null };
  authMock.mockReset().mockResolvedValue({ userId: "user_1" });
  rpc.mockReset();
  ownerFrom.mockClear();
  serviceFrom.mockClear();
  ensureAccount.mockReset().mockResolvedValue(undefined);
});

describe("helpers", () => {
  test("generatePublicKey: pk_ + 24 bytes base64url, unique", () => {
    const k = generatePublicKey();
    expect(k).toMatch(/^pk_[A-Za-z0-9_-]{32}$/);
    expect(generatePublicKey()).not.toBe(k);
  });

  test("toProject maps columns and drops owner_id", () => {
    expect(toProject(row)).toEqual(project);
  });

  test("getOwnedProject returns the project, or null when RLS hides it", async () => {
    result = { data: row, error: null };
    expect(await getOwnedProject(ID)).toEqual(project);
    result = { data: null, error: null };
    expect(await getOwnedProject(ID)).toBeNull();
  });

  test("getPlan reads accounts.plan; no row means free", async () => {
    result = { data: { plan: "pro" }, error: null };
    expect(await getPlan("user_1")).toBe("pro");
    result = { data: null, error: null };
    expect(await getPlan("user_1")).toBe("free");
  });
});

describe("GET /api/projects", () => {
  test("lists through the owner client, newest first, with no owner filter", async () => {
    result = { data: [row], error: null };
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ projects: [project] });
    expect(calls).toContainEqual(["order", ["created_at", { ascending: false }]]);
    expect(calls.some(([m]) => m === "eq")).toBe(false);
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  test("signed out gives 401 JSON", async () => {
    authMock.mockResolvedValue({ userId: null });
    const res = await GET();
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
  });
});

describe("POST /api/projects", () => {
  test("creates: 201, plan read on the server, limit and defaults passed", async () => {
    result = { data: { plan: "free" }, error: null };
    rpc.mockResolvedValue({ data: row, error: null });
    const res = await POST(json({ name: " Docs " }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ project });
    expect(ensureAccount).toHaveBeenCalledWith("user_1");
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0]!;
    expect(fn).toBe("create_project");
    expect(args).toMatchObject({
      p_owner_id: "user_1",
      p_name: "Docs",
      p_max_projects: PLAN_LIMITS.free.projects,
      p_button_color: DEFAULT_WIDGET_CONFIG.buttonColor,
      p_position: DEFAULT_WIDGET_CONFIG.position,
      p_label: DEFAULT_WIDGET_CONFIG.label,
      p_animation: DEFAULT_WIDGET_CONFIG.animation,
      p_header_text: DEFAULT_WIDGET_CONFIG.headerText,
      p_show_badge: DEFAULT_WIDGET_CONFIG.showBadge,
    });
    expect(args.p_public_key).toMatch(/^pk_/);
  });

  test("Pro gets the Pro limit", async () => {
    result = { data: { plan: "pro" }, error: null };
    rpc.mockResolvedValue({ data: row, error: null });
    await POST(json({ name: "x" }));
    expect(rpc.mock.calls[0]![1].p_max_projects).toBe(PLAN_LIMITS.pro.projects);
  });

  test("400 for a missing name, an empty name and bad JSON", async () => {
    for (const req of [
      json({}),
      json({ name: "   " }),
      new Request("http://localhost/api/projects", { method: "POST", body: "{nope" }),
    ]) {
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("validation_error");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  test("403 plan_limit on Free's second project", async () => {
    result = { data: { plan: "free" }, error: null };
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "plan_limit" } });
    const res = await POST(json({ name: "Second" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("plan_limit");
    expect(body.error.message).toMatch(/1 project/);
  });

  test("retries once with a new key on a public_key collision", async () => {
    result = { data: { plan: "free" }, error: null };
    rpc
      .mockResolvedValueOnce({ data: null, error: { code: "23505", message: "duplicate key" } })
      .mockResolvedValueOnce({ data: row, error: null });
    const res = await POST(json({ name: "Docs" }));
    expect(res.status).toBe(201);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]![1].p_public_key).not.toBe(rpc.mock.calls[1]![1].p_public_key);
  });

  test("gives up with 500 after a second collision", async () => {
    result = { data: { plan: "free" }, error: null };
    rpc.mockResolvedValue({ data: null, error: { code: "23505", message: "duplicate key" } });
    const res = await POST(json({ name: "Docs" }));
    expect(res.status).toBe(500);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  test("signed out gives 401 JSON", async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await POST(json({ name: "x" }))).status).toBe(401);
  });
});

describe("PATCH /api/projects/:id", () => {
  const patch = (body: unknown) =>
    new Request("http://localhost/api/projects/x", { method: "PATCH", body: JSON.stringify(body) });

  test("renames through the owner client", async () => {
    result = { data: { ...row, name: "New" }, error: null };
    const res = await PATCH(patch({ name: "New" }), ctx(ID));
    expect(res.status).toBe(200);
    expect((await res.json()).project.name).toBe("New");
    expect(calls).toContainEqual(["update", [{ name: "New" }]]);
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  test("404 for another owner's project (RLS matches no row)", async () => {
    result = { data: null, error: null };
    const res = await PATCH(patch({ name: "New" }), ctx(ID));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  test("400 for a bad id or name", async () => {
    expect((await PATCH(patch({ name: "New" }), ctx("nope"))).status).toBe(400);
    expect((await PATCH(patch({ name: "" }), ctx(ID))).status).toBe(400);
  });

  test("signed out gives 401 JSON", async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await PATCH(patch({ name: "New" }), ctx(ID))).status).toBe(401);
  });
});

describe("DELETE /api/projects/:id", () => {
  const del = () => new Request("http://localhost/api/projects/x", { method: "DELETE" });

  test("deletes through the owner client", async () => {
    result = { data: [{ id: ID }], error: null };
    const res = await DELETE(del(), ctx(ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(serviceFrom).not.toHaveBeenCalled();
  });

  test("404 when no row was deleted", async () => {
    result = { data: [], error: null };
    const res = await DELETE(del(), ctx(ID));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
  });

  test("400 for a bad id; 401 signed out", async () => {
    expect((await DELETE(del(), ctx("nope"))).status).toBe(400);
    authMock.mockResolvedValue({ userId: null });
    expect((await DELETE(del(), ctx(ID))).status).toBe(401);
  });
});

describe("project_created", () => {
  test("once on success, with the owner and the project id only", async () => {
    rpc.mockResolvedValue({ data: row, error: null });
    expect((await POST(json({ name: "Docs" }))).status).toBe(201);
    expect(trackProjectCreated.mock.calls).toEqual([["user_1", ID]]);
  });

  test("not sent when creating fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0001", message: "plan_limit" } });
    await POST(json({ name: "Docs" }));
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    await POST(json({ name: "Docs" }));
    await POST(json({}));
    expect(trackProjectCreated).not.toHaveBeenCalled();
  });
});
