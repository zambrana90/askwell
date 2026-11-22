import { describe, expect, it } from "vitest";
import { isProtectedApi, isProtectedPage, isPublicRoute } from "../../lib/auth/routes";

describe("route matchers", () => {
  it.each(["/dashboard", "/dashboard/settings"])("protects page %s", (p) => {
    expect(isProtectedPage(p)).toBe(true);
    expect(isPublicRoute(p)).toBe(false);
  });

  it.each(["/api/projects", "/api/projects/1/keys", "/api/knowledge", "/api/conversations/x"])(
    "protects api %s",
    (p) => {
      expect(isProtectedApi(p)).toBe(true);
      expect(isPublicRoute(p)).toBe(false);
    },
  );

  it.each([
    "/",
    "/sign-in",
    "/sign-in/factor-one",
    "/sign-up",
    "/embed",
    "/embed/abc",
    "/api/widget/config",
    "/api/clerk/webhook",
    "/api/posthog-config",
  ])("leaves %s public", (p) => {
    expect(isPublicRoute(p)).toBe(true);
    expect(isProtectedPage(p)).toBe(false);
    expect(isProtectedApi(p)).toBe(false);
  });

  it("does not match look-alike prefixes", () => {
    expect(isProtectedPage("/dashboards")).toBe(false);
    expect(isProtectedApi("/api/projectsX")).toBe(false);
  });
});
