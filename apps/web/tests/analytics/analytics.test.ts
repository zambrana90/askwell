import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const captureImmediate = vi.fn();
const constructed: Array<[string, Record<string, unknown>]> = [];
vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor(key: string, options: Record<string, unknown>) {
      constructed.push([key, options]);
    }
    captureImmediate = captureImmediate;
  },
}));

import { GET } from "../../app/api/posthog-config/route";

const env = { ...process.env };
beforeEach(() => {
  captureImmediate.mockReset().mockResolvedValue(undefined);
  constructed.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.resetModules();
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

  test("defaults the host when only the key is set", async () => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
    expect((await GET().json()).host).toBe("https://us.i.posthog.com");
  });

  test("500 with the standard error shape when the key is missing", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
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
