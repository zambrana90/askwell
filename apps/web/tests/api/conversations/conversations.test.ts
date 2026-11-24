import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));

// Owner client only. The service client must never be touched.
const results: Record<string, { data: unknown; error: unknown }> = {};
const calls: Array<[string, unknown[]]> = [];
function query(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order"]) {
    b[m] = (...args: unknown[]) => (calls.push([`${table}.${m}`, args]), b);
  }
  b.maybeSingle = () => Promise.resolve(results[table]);
  b.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(results[table]).then(res, rej);
  return b;
}
const rpc = vi.fn();
vi.mock("../../../lib/supabase/owner", () => ({ createOwnerClient: () => ({ from: query, rpc }) }));
const serviceClient = vi.fn();
vi.mock("../../../lib/supabase/service", () => ({ createServiceClient: () => serviceClient() }));

import { GET as LIST } from "../../../app/api/projects/[id]/conversations/route";
import { GET as THREAD } from "../../../app/api/conversations/[id]/route";

const PID = "5f0c2f0e-8a3a-4a53-9b0e-3a6f1d1a2b3c";
const CID = "6a0c2f0e-8a3a-4a53-9b0e-3a6f1d1a2b3d";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = new Request("http://localhost/x");
const project = {
  id: PID, name: "Docs", public_key: "pk_abc", messages_used: 0,
  period_start: "2026-11-01T00:00:00+00:00", created_at: "2026-11-02T00:00:00+00:00", owner_id: "user_1",
};

beforeEach(() => {
  calls.length = 0;
  authMock.mockReset().mockResolvedValue({ userId: "user_1" });
  serviceClient.mockReset();
  rpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  results.projects = { data: project, error: null };
  results.conversations = {
    data: { id: CID, visitor_id: "v1", created_at: "2026-11-03T10:00:00+00:00" },
    error: null,
  };
  results.messages = {
    data: [
      { id: "m1", role: "visitor", body: "<b>Hi</b>", created_at: "2026-11-03T10:00:00+00:00" },
      { id: "m2", role: "bot", body: "Hello", created_at: "2026-11-03T10:00:01+00:00" },
    ],
    error: null,
  };
});

describe("GET /api/projects/:id/conversations", () => {
  test("401 without a session", async () => {
    authMock.mockResolvedValue({ userId: null });
    const res = await LIST(req, ctx(PID));
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
    expect(rpc).not.toHaveBeenCalled();
  });

  test("400 for a bad id", async () => {
    const res = await LIST(req, ctx("nope"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_error");
  });

  test("404 for another owner's (or unknown) project, without calling owner_activity", async () => {
    results.projects = { data: null, error: null };
    const res = await LIST(req, ctx(PID));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
    expect(rpc).not.toHaveBeenCalled();
  });

  test("200: maps owner_activity rows to camelCase, through the owner client only", async () => {
    rpc.mockResolvedValue({
      data: [{ id: CID, visitor_id: "v1", created_at: "2026-11-03T10:00:00+00:00", preview: "Hi", message_count: 2 }],
      error: null,
    });
    const res = await LIST(req, ctx(PID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      conversations: [{ id: CID, visitorId: "v1", preview: "Hi", messageCount: 2, createdAt: "2026-11-03T10:00:00+00:00" }],
    });
    expect(rpc).toHaveBeenCalledWith("owner_activity", { p_project_id: PID });
    expect(serviceClient).not.toHaveBeenCalled();
  });

  test("an empty project returns an empty list", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await (await LIST(req, ctx(PID))).json()).toEqual({ conversations: [] });
  });

  test("500 internal on an rpc error, no detail leaked", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "secret detail" } });
    const res = await LIST(req, ctx(PID));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/secret/);
  });
});

describe("GET /api/conversations/:id", () => {
  test("401 without a session", async () => {
    authMock.mockResolvedValue({ userId: null });
    expect((await THREAD(req, ctx(CID))).status).toBe(401);
  });

  test("400 for a bad id", async () => {
    const res = await THREAD(req, ctx("nope"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_error");
  });

  test("404 for another owner's (or unknown) conversation, messages never read", async () => {
    results.conversations = { data: null, error: null };
    const res = await THREAD(req, ctx(CID));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
    expect(calls.some(([n]) => n.startsWith("messages."))).toBe(false);
  });

  test("200: the conversation and its messages, oldest first, through the owner client only", async () => {
    const res = await THREAD(req, ctx(CID));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      conversation: { id: CID, visitorId: "v1", createdAt: "2026-11-03T10:00:00+00:00" },
      messages: [
        { id: "m1", role: "visitor", body: "<b>Hi</b>", createdAt: "2026-11-03T10:00:00+00:00" },
        { id: "m2", role: "bot", body: "Hello", createdAt: "2026-11-03T10:00:01+00:00" },
      ],
    });
    const orders = calls.filter(([n]) => n === "messages.order").map(([, a]) => a);
    expect(orders).toEqual([["created_at", { ascending: true }], ["id", { ascending: true }]]);
    expect(serviceClient).not.toHaveBeenCalled();
  });

  test("500 internal on a database error, no detail leaked", async () => {
    results.messages = { data: null, error: { message: "secret detail" } };
    const res = await THREAD(req, ctx(CID));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/secret/);
  });
});
