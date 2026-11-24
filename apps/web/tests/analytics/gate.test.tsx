import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

const posthog = {
  init: vi.fn(),
  startSessionRecording: vi.fn(),
  stopSessionRecording: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  get_property: vi.fn(),
  get_distinct_id: vi.fn(),
};
/** The identity PostHog holds, persisted across page loads. */
let stored: string | null = null;
let posthogLoaded = false;
vi.mock("posthog-js", () => {
  posthogLoaded = true; // the factory runs only when something imports posthog-js
  return { default: posthog };
});

import { isEmbedPath, wantsIdentity, wantsReplay } from "../../lib/analytics/paths";

const env = { ...process.env };
beforeEach(() => {
  pathname = "/";
  posthogLoaded = false;
  Object.values(posthog).forEach((f) => f.mockReset());
  stored = null;
  posthog.get_property.mockImplementation(() => (stored ? "identified" : "anonymous"));
  posthog.get_distinct_id.mockImplementation(() => stored ?? "anon-device-id");
  posthog.identify.mockImplementation((id: string) => (stored = id));
  posthog.reset.mockImplementation(() => (stored = null));
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test";
  process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://eu.i.posthog.com";
  vi.resetModules();
});
afterEach(() => {
  cleanup();
  process.env = { ...env };
  delete (window as unknown as { Clerk?: unknown }).Clerk;
});

const mount = async () => {
  const { PosthogGate } = await import("../../components/analytics/posthog-gate");
  return render(<PosthogGate />);
};

describe("paths", () => {
  test("embed", () => {
    expect(isEmbedPath("/embed")).toBe(true);
    expect(isEmbedPath("/embed/x")).toBe(true);
    expect(isEmbedPath("/embedded")).toBe(false);
    expect(isEmbedPath("/")).toBe(false);
  });
  test("replay: landing and dashboard only", () => {
    for (const p of ["/", "/dashboard", "/dashboard/projects/1"]) expect(wantsReplay(p), p).toBe(true);
    for (const p of ["/embed", "/sign-in", "/api/x", "/dashboardx"]) expect(wantsReplay(p), p).toBe(false);
  });
  test("identity pages", () => {
    expect(wantsIdentity("/dashboard/billing")).toBe(true);
    expect(wantsIdentity("/sign-in")).toBe(true);
    expect(wantsIdentity("/")).toBe(false);
  });
});

describe("PosthogGate", () => {
  test("on /embed it never imports or starts PostHog", async () => {
    pathname = "/embed";
    await mount();
    await new Promise((r) => setTimeout(r, 50));
    expect(posthogLoaded).toBe(false);
    expect(posthog.init).not.toHaveBeenCalled();
  });

  test("on the landing page it inits with masked inputs and starts replay", async () => {
    pathname = "/";
    await mount();
    await waitFor(() => expect(posthog.startSessionRecording).toHaveBeenCalled());
    expect(posthog.init).toHaveBeenCalledTimes(1);
    const [key, options] = posthog.init.mock.calls[0]!;
    expect(key).toBe("phc_test");
    expect(options).toMatchObject({
      api_host: "https://eu.i.posthog.com",
      capture_exceptions: true,
      disable_session_recording: true,
      session_recording: { maskAllInputs: true },
    });
  });

  test("on a page without replay (sign-in) it stops recording", async () => {
    pathname = "/api-docs";
    await mount();
    await waitFor(() => expect(posthog.stopSessionRecording).toHaveBeenCalled());
    expect(posthog.startSessionRecording).not.toHaveBeenCalled();
  });

  test("does nothing without a key", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    await mount();
    await new Promise((r) => setTimeout(r, 50));
    expect(posthog.init).not.toHaveBeenCalled();
    expect(posthog.startSessionRecording).not.toHaveBeenCalled();
  });

  test("on the dashboard it identifies by Clerk id only, and resets on sign-out", async () => {
    pathname = "/dashboard";
    let listener: (r: { user?: { id: string } | null }) => void = () => undefined;
    (window as unknown as { Clerk: unknown }).Clerk = {
      loaded: true,
      user: { id: "user_abc", primaryEmailAddress: { emailAddress: "a@b.c" }, fullName: "Ann" },
      addListener: (cb: typeof listener) => {
        listener = cb;
        return () => undefined;
      },
    };
    await mount();
    await waitFor(() => expect(posthog.identify).toHaveBeenCalledWith("user_abc"), { timeout: 3000 });
    expect(posthog.identify).toHaveBeenCalledTimes(1); // the id only, no traits
    listener({ user: null });
    expect(posthog.reset).toHaveBeenCalledTimes(1);
  });

  const signedInAs = (id: string | null) => {
    (window as unknown as { Clerk: unknown }).Clerk = {
      loaded: true,
      user: id ? { id } : null,
      addListener: () => () => undefined,
    };
  };

  test.each([
    { name: "resets a restored identity when Clerk has no user", before: "user_old", clerk: null, resets: 1, identifies: 0 },
    { name: "resets before identifying a different user", before: "user_old", clerk: "user_new", resets: 1, identifies: 1 },
    { name: "keeps a restored identity for the same user", before: "user_abc", clerk: "user_abc", resets: 0, identifies: 0 },
    { name: "leaves an anonymous visitor alone", before: null, clerk: null, resets: 0, identifies: 0 },
  ])("$name", async ({ before, clerk, resets, identifies }) => {
    pathname = "/dashboard";
    stored = before;
    signedInAs(clerk);
    await mount();
    await waitFor(() => expect(posthog.get_property).toHaveBeenCalled(), { timeout: 3000 });
    expect(posthog.reset).toHaveBeenCalledTimes(resets);
    expect(posthog.identify).toHaveBeenCalledTimes(identifies);
  });
});
