import { describe, expect, test, vi } from "vitest";

// Importing proxy.ts builds the Clerk middleware; the matcher is what we test.
vi.mock("@clerk/nextjs/server", () => ({ clerkMiddleware: () => () => {} }));

import { config } from "../../proxy";

// Next.js applies each matcher as an anchored regex on the pathname.
const runs = (path: string) =>
  config.matcher.some((source) => new RegExp(`^${source}$`).test(path));

describe("proxy matcher", () => {
  test("/embed skips the Clerk proxy (public page, cross-site iframe)", () => {
    expect(runs("/embed")).toBe(false);
  });

  test.each(["/dashboard", "/dashboard/projects", "/api/projects", "/api/projects/abc", "/api/widget/config", "/api/widget/chat", "/"])(
    "%s still goes through the proxy",
    (path) => expect(runs(path)).toBe(true),
  );

  test("only /embed itself is excluded, not look-alikes", () => {
    expect(runs("/embedded")).toBe(true);
    expect(runs("/embed/x")).toBe(true);
  });

  test("static files and _next stay excluded", () => {
    expect(runs("/_next/static/a.js")).toBe(false);
    expect(runs("/logo.png")).toBe(false);
  });
});
