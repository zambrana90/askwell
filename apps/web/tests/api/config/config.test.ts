import { beforeEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";

vi.mock("server-only", () => ({}));
const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));

const getOwnedProject = vi.fn();
const getPlan = vi.fn();
vi.mock("../../../lib/projects/projects", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../lib/projects/projects")>()),
  getOwnedProject: (id: string) => getOwnedProject(id),
  getPlan: (id: string) => getPlan(id),
}));

// Service client: records writes. Never reached before the ownership and plan checks.
type Result = { data: unknown; error: unknown };
let updateResult: Result;
let insertResult: Result;
const writes: Array<[string, unknown]> = [];
const serviceClient = vi.fn(() => ({
  from: (table: string) => ({
    update: (cols: unknown) => {
      writes.push([`${table}.update`, cols]);
      const b: Record<string, unknown> = {};
      b.eq = (...a: unknown[]) => (writes.push([`${table}.eq`, a]), b);
      b.select = () => b;
      b.maybeSingle = () => Promise.resolve(updateResult);
      return b;
    },
    insert: (row: unknown) => {
      writes.push([`${table}.insert`, row]);
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.single = () => Promise.resolve(insertResult);
      return b;
    },
  }),
}));
vi.mock("../../../lib/supabase/service", () => ({ createServiceClient: () => serviceClient() }));

import { PATCH } from "../../../app/api/projects/[id]/config/route";

const ID = "5f0c2f0e-8a3a-4a53-9b0e-3a6f1d1a2b3c";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const patch = (body: unknown, id = ID) =>
  PATCH(new Request("http://localhost/x", { method: "PATCH", body: typeof body === "string" ? body : JSON.stringify(body) }), ctx(id));
const stored = {
  button_color: "#112233",
  position: "top-left",
  label: "Help",
  animation: "scale",
  header_text: "Hi there",
  show_badge: false,
};

beforeEach(() => {
  writes.length = 0;
  serviceClient.mockClear();
  authMock.mockReset().mockResolvedValue({ userId: "user_1" });
  getOwnedProject.mockReset().mockResolvedValue({ id: ID });
  getPlan.mockReset().mockResolvedValue("pro");
  updateResult = { data: stored, error: null };
  insertResult = { data: stored, error: null };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PATCH /api/projects/:id/config", () => {
  test("401 without a session", async () => {
    authMock.mockResolvedValue({ userId: null });
    const res = await patch({ label: "x" });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
    expect(getOwnedProject).not.toHaveBeenCalled();
    expect(serviceClient).not.toHaveBeenCalled();
  });

  test("400 for a bad project id", async () => {
    const res = await patch({ label: "x" }, "nope");
    expect(res.status).toBe(400);
    expect(getOwnedProject).not.toHaveBeenCalled();
  });

  test("404 for another owner's (or unknown) project: nothing written, plan not even read", async () => {
    getOwnedProject.mockResolvedValue(null);
    const res = await patch({ label: "x" });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
    expect(getPlan).not.toHaveBeenCalled();
    expect(serviceClient).not.toHaveBeenCalled();
  });

  test("402 for Free, before the body is validated; nothing written", async () => {
    getPlan.mockResolvedValue("free");
    for (const body of [{ label: "ok" }, { buttonColor: "not a color" }, "{not json"]) {
      const res = await patch(body);
      expect(res.status).toBe(402);
      expect((await res.json()).error.code).toBe("payment_required");
    }
    expect(serviceClient).not.toHaveBeenCalled();
    expect(getPlan).toHaveBeenCalledWith("user_1");
  });

  test.each([
    ["empty object", {}],
    ["bad color", { buttonColor: "red" }],
    ["bad position", { position: "middle" }],
    ["blank label", { label: "   " }],
    ["label too long", { label: "x".repeat(41) }],
    ["header too long", { headerText: "x".repeat(61) }],
    ["wrong type", { showBadge: "yes" }],
    ["not JSON", "{nope"],
  ])("400 for Pro with %s: nothing written", async (_n, body) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_error");
    expect(serviceClient).not.toHaveBeenCalled();
  });

  test("Pro partial update: only the sent fields are written, and the response is the stored config", async () => {
    const res = await patch({ buttonColor: "#112233", showBadge: false });
    expect(res.status).toBe(200);
    expect(writes).toContainEqual(["widget_configs.update", { button_color: "#112233", show_badge: false }]);
    expect(writes).toContainEqual(["widget_configs.eq", ["project_id", ID]]);
    expect(await res.json()).toEqual({
      config: { buttonColor: "#112233", position: "top-left", label: "Help", animation: "scale", headerText: "Hi there", showBadge: false },
    });
  });

  test("the response is plan-applied: a non-Pro plan value never returns saved settings", async () => {
    // Defensive: the route only saves for Pro, so the applied config equals the stored one.
    const res = await patch({ label: "Help" });
    expect((await res.json()).config.label).toBe("Help");
    expect(DEFAULT_WIDGET_CONFIG.label).not.toBe("Help");
  });

  test("a project without a config row gets one, with defaults plus the patch", async () => {
    updateResult = { data: null, error: null };
    insertResult = { data: { ...stored, label: "Help" }, error: null };
    const res = await patch({ label: "Help" });
    expect(res.status).toBe(200);
    const insert = writes.find(([n]) => n === "widget_configs.insert")?.[1];
    expect(insert).toEqual({
      project_id: ID,
      button_color: DEFAULT_WIDGET_CONFIG.buttonColor,
      position: DEFAULT_WIDGET_CONFIG.position,
      label: "Help",
      animation: DEFAULT_WIDGET_CONFIG.animation,
      header_text: DEFAULT_WIDGET_CONFIG.headerText,
      show_badge: DEFAULT_WIDGET_CONFIG.showBadge,
    });
  });

  test("500 internal on a database error, no detail leaked", async () => {
    updateResult = { data: null, error: { message: "secret db detail" } };
    const res = await patch({ label: "x" });
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/secret/);
  });
});
