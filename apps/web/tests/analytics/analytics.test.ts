import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const captureImmediate = vi.fn();
const captureExceptionImmediate = vi.fn();
const constructed: Array<[string, Record<string, unknown>]> = [];
const posthogMock = () => ({
  PostHog: class {
    constructor(key: string, options: Record<string, unknown>) {
      constructed.push([key, options]);
    }
    captureImmediate = captureImmediate;
    captureExceptionImmediate = captureExceptionImmediate;
  },
});


import { GET } from "../../app/api/posthog-config/route";

const env = { ...process.env };
beforeEach(() => {
  process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://eu.i.posthog.com";
  captureImmediate.mockReset().mockResolvedValue(undefined);
  captureExceptionImmediate.mockReset().mockResolvedValue(undefined);
  constructed.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.resetModules();
  vi.doMock("posthog-node", posthogMock); // re-applied each test: one test swaps it for a throwing client
});
afterEach(() => {
  process.env = { ...env };
});

describe("GET /api/posthog-config", () => {
  test("returns the key and host, read at request time", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://eu.i.posthog.com";
    const res = GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ key: "phc_test", host: "https://eu.i.posthog.com" });
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_changed";
    expect((await GET().json()).key).toBe("phc_changed");
  });

  test("500 when only the key is set: no guessed host", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
    expect(GET().status).toBe(500);
  });

  test("500 with the standard error shape when the key is missing", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://eu.i.posthog.com";
    const res = GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal");
  });

  test("is not cached", () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    expect(GET().headers.get("Cache-Control")).toBe("no-store");
  });
});

describe("captureServer", () => {
  const load = async () => (await import("../../lib/analytics/server")).captureServer;

  test("sends the event and waits for delivery", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    const captureServer = await load();
    await captureServer("user_1", "thing_happened", { a: 1 });
    expect(captureImmediate).toHaveBeenCalledWith({ distinctId: "user_1", event: "thing_happened", properties: { a: 1 } });
    expect(constructed[0]![1]).toMatchObject({ flushAt: 1, flushInterval: 0 });
  });

  test("does nothing, without throwing, when no key is set", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const captureServer = await load();
    await expect(captureServer("user_1", "e")).resolves.toBeUndefined();
    expect(captureImmediate).not.toHaveBeenCalled();
  });

  test("never throws when PostHog fails", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    captureImmediate.mockRejectedValue(new Error("network down"));
    const captureServer = await load();
    await expect(captureServer("user_1", "e")).resolves.toBeUndefined();
  });

  test("never throws when the client cannot even be created", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    vi.doMock("posthog-node", () => ({
      PostHog: class {
        constructor() {
          throw new Error("bad config");
        }
      },
    }));
    const captureServer = await load();
    await expect(captureServer("user_1", "e")).resolves.toBeUndefined();
  });
});

describe("server error tracking", () => {
  const load = async () => (await import("../../lib/analytics/errors")).captureServerException;
  const onRequestError = async () => (await import("../../instrumentation")).onRequestError;

  test("sends the error with the route path only", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    const captureServerException = await load();
    const err = new Error("boom");
    await captureServerException(err, { path: "/api/x", routeType: "route", routePath: "/api/x" });
    expect(captureExceptionImmediate).toHaveBeenCalledWith(err, {
      properties: { source: "server", path: "/api/x", route_type: "route", route_path: "/api/x" },
    });
  });

  test("wraps a non-Error value", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    await (await load())("a string", {});
    expect(captureExceptionImmediate.mock.calls[0]![0]).toBeInstanceOf(Error);
  });

  test("never throws, with or without a key", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    await expect((await load())(new Error("x"), {})).resolves.toBeUndefined();
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    captureExceptionImmediate.mockRejectedValue(new Error("network down"));
    await expect((await load())(new Error("x"), {})).resolves.toBeUndefined();
  });

  test("onRequestError reports the path without the query string", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    process.env.NEXT_RUNTIME = "nodejs";
    const handler = await onRequestError();
    await handler(
      new Error("boom"),
      { path: "/api/projects?token=secret", method: "GET", headers: {} },
      { routerKind: "App Router", routePath: "/api/projects", routeType: "route", renderSource: undefined, revalidateReason: undefined },
    );
    const props = captureExceptionImmediate.mock.calls[0]![1].properties;
    expect(props.path).toBe("/api/projects");
    expect(JSON.stringify(props)).not.toContain("secret");
  });
});

describe("/embed loads no PostHog", () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : [p];
    });
  const root = join(__dirname, "../..");

  test("nothing under app/embed or components/embed mentions PostHog", () => {
    for (const f of [...files(join(root, "app/embed")), ...files(join(root, "components/embed"))]) {
      expect(readFileSync(f, "utf8").toLowerCase(), f).not.toContain("posthog");
    }
  });

  test("the root layout does not import PostHog directly (it would load on /embed)", () => {
    expect(readFileSync(join(root, "app/layout.tsx"), "utf8").toLowerCase()).not.toMatch(/from ["'](posthog|@posthog)/);
  });
});
