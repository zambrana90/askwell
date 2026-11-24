import { beforeEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_WIDGET_CONFIG, PLAN_LIMITS } from "@askwell/shared";

vi.mock("server-only", () => ({}));

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
const rpc = vi.fn();
vi.mock("../../../lib/supabase/service", () => ({ createServiceClient: () => ({ from, rpc }) }));

const protectConfig = vi.fn();
vi.mock("../../../lib/security/arcjet", () => ({ protectConfig: (...a: unknown[]) => protectConfig(...a) }));

import { GET, OPTIONS } from "../../../app/api/widget/config/route";

const KEY = "pk_abcdef123456";
const saved = {
  button_color: "#ff0000",
  position: "top-left",
  label: "Help",
  animation: "scale",
  header_text: "Hi there",
  show_badge: false,
};
const call = (qs: string) => GET(new Request(`http://localhost/api/widget/config${qs}`));
const row = (plan: string) => ({ data: { id: "p1", widget_configs: saved, accounts: { plan } }, error: null });

beforeEach(() => {
  protectConfig.mockReset();
  protectConfig.mockResolvedValue("allow");
  maybeSingle.mockReset();
  rpc.mockReset().mockResolvedValue({ data: true, error: null });
  from.mockClear();
  eq.mockClear();
});

describe("GET /api/widget/config", () => {
  test("Pro gets the saved config, with only the six fields", async () => {
    maybeSingle.mockResolvedValue(row("pro"));
    const res = await call(`?key=${KEY}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      buttonColor: "#ff0000",
      position: "top-left",
      label: "Help",
      animation: "scale",
      headerText: "Hi there",
      showBadge: false,
    });
    expect(eq).toHaveBeenCalledWith("public_key", KEY);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Cache-Control")).toBe("public, no-cache");
    expect(res.headers.get("Vercel-CDN-Cache-Control")).toBe("no-store");
    expect(res.headers.get("CDN-Cache-Control")).toBe("no-store");
  });

  test("Free gets the defaults and badge even when custom values are saved", async () => {
    maybeSingle.mockResolvedValue(row("free"));
    const res = await call(`?key=${KEY}`);
    expect(await res.json()).toEqual({ ...DEFAULT_WIDGET_CONFIG, showBadge: true });
  });

  test("a bad key format returns 400 with CORS and does not query", async () => {
    const res = await call("?key=nope");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_error");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(from).not.toHaveBeenCalled();
  });

  test("a missing key returns 400", async () => {
    expect((await call("")).status).toBe(400);
  });

  test("an unknown key returns 404 with CORS", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await call(`?key=${KEY}`);
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("not_found");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("a database failure returns 500 with CORS", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await call(`?key=${KEY}`);
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  test("OPTIONS answers 204 with CORS headers", () => {
    const res = OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  test("over the rate limit: 429 rate_limited with CORS headers, no DB read", async () => {
    protectConfig.mockResolvedValue("rate_limited");
    const res = await call(`?key=${KEY}`);
    expect(res.status).toBe(429);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect((await res.json()).error.code).toBe("rate_limited");
    expect(from).not.toHaveBeenCalled();
  });

  test("a paused project: 402 payment_required with CORS headers (the loader renders nothing on any error)", async () => {
    maybeSingle.mockResolvedValue(row("free"));
    rpc.mockResolvedValue({ data: false, error: null });
    const res = await call(`?key=${KEY}`);
    expect(res.status).toBe(402);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect((await res.json()).error.code).toBe("payment_required");
  });

  test("the plan's project limit is passed to project_is_active", async () => {
    for (const plan of ["free", "pro"] as const) {
      rpc.mockClear();
      maybeSingle.mockResolvedValue(row(plan));
      await call(`?key=${KEY}`);
      expect(rpc).toHaveBeenCalledWith("project_is_active", { p_project_id: "p1", p_max_projects: PLAN_LIMITS[plan].projects });
    }
  });

  test("a project_is_active error is a 500, not a widget", async () => {
    maybeSingle.mockResolvedValue(row("pro"));
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await call(`?key=${KEY}`)).status).toBe(500);
  });
});
