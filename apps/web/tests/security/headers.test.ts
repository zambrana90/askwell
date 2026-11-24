// @vitest-environment node
import { unstable_getResponseFromNextConfig as responseFor } from "next/experimental/testing/server";
import { describe, expect, test, vi } from "vitest";
import nextConfig from "../../next.config";

vi.mock("@clerk/nextjs/server", () => ({ clerkMiddleware: () => () => undefined }));

const headersFor = async (path: string) =>
  (await responseFor({ url: `https://askwell.example${path}`, nextConfig })).headers;

const SELF = [
  "/",
  "/dashboard",
  "/dashboard/billing",
  "/dashboard/projects/abc/knowledge",
  "/sign-in",
  "/sign-up",
  "/api/projects",
  "/api/widget/config",
  "/api/widget/chat",
  "/api/clerk/webhook",
  "/widget.js",
  "/embed/other",
  "/embedded",
];

describe("security headers", () => {
  test.each(["/embed", "/embed?key=pk_1"])("%s may be framed anywhere", async (path) => {
    expect((await headersFor(path)).get("content-security-policy")).toBe("frame-ancestors *");
  });

  test.each(SELF)("%s may only be framed by this site", async (path) => {
    expect((await headersFor(path)).get("content-security-policy")).toBe("frame-ancestors 'self'");
  });

  test.each(["/embed", ...SELF])("%s sends nosniff, Referrer-Policy and Permissions-Policy", async (path) => {
    const headers = await headersFor(path);
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("permissions-policy")).toBe("camera=(), microphone=(), geolocation=()");
  });

  test("next.config adds no CORS header", async () => {
    for (const path of ["/embed", ...SELF]) {
      const names = [...(await headersFor(path)).keys()];
      expect(names.filter((name) => name.startsWith("access-control-"))).toEqual([]);
    }
  });
});

describe("widget.js", () => {
  // It is a static file: Next serves it with a JavaScript content type. Keeping it out of the
  // Clerk proxy means it needs no cookies and sets none.
  test("skips the Clerk proxy", async () => {
    const { config } = await import("../../proxy");
    const runs = config.matcher.some((source) => new RegExp(`^${source}$`).test("/widget.js"));
    expect(runs).toBe(false);
    expect(config.matcher.some((source) => new RegExp(`^${source}$`).test("/dashboard"))).toBe(true);
  });
});
