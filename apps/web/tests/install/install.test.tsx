import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const trackSnippetCopied = vi.fn();
vi.mock("../../lib/analytics/client", () => ({ trackSnippetCopied: (id: string) => trackSnippetCopied(id) }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "5f0c2f0e-8a3a-4a53-9b0e-3a6f1d1a2b3c" }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
const headerValues = vi.hoisted(() => ({ current: {} as Record<string, string> }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => headerValues.current[k] ?? null }),
}));
const loadOwnedProject = vi.fn();
vi.mock("../../components/projects/owned-project", () => ({
  loadOwnedProject: (id: string) => loadOwnedProject(id),
}));

import InstallPage from "../../app/dashboard/projects/[id]/install/page";
import Loading from "../../app/dashboard/projects/[id]/install/loading";
import { InstallSnippet } from "../../components/install/install-snippet";
import { buildInstallSnippet, resolveAppUrl } from "../../lib/install/snippet";

const ID = "5f0c2f0e-8a3a-4a53-9b0e-3a6f1d1a2b3c";
const project = {
  id: ID,
  name: "Docs bot",
  publicKey: "pk_abcDEF123-_",
  messagesUsed: 0,
  periodStart: "2026-11-01T00:00:00+00:00",
  createdAt: "2026-11-02T00:00:00+00:00",
};

beforeEach(() => {
  trackSnippetCopied.mockReset();
  loadOwnedProject.mockReset();
  headerValues.current = {};
  vi.unstubAllEnvs();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.getSelection()?.removeAllRanges();
});

describe("resolveAppUrl", () => {
  test("uses NEXT_PUBLIC_APP_URL when set, without a trailing slash", () => {
    expect(resolveAppUrl("https://askwell.app/", { host: "other.vercel.app" })).toBe("https://askwell.app");
  });

  test("http is allowed only for localhost; other http URLs are invalid", () => {
    expect(resolveAppUrl("http://askwell.app", { host: "x.vercel.app" })).toBeNull();
    expect(resolveAppUrl("http://192.168.1.5:3000", { host: "x.vercel.app" })).toBeNull();
    expect(resolveAppUrl("http://127.0.0.1:3000", { host: "x.vercel.app" })).toBe("http://127.0.0.1:3000");
  });

  test("the env value is reduced to its origin: no path, query or fragment", () => {
    expect(resolveAppUrl("https://askwell.app/?version=1", { host: "x" })).toBe("https://askwell.app");
    expect(resolveAppUrl("https://askwell.app/app/#top", { host: "x" })).toBe("https://askwell.app");
    expect(buildInstallSnippet({ appUrl: resolveAppUrl("https://askwell.app/?v=1", { host: "x" })!, publicKey: "pk_1" })).toContain(
      'src="https://askwell.app/widget.js"',
    );
  });

  test("keeps valid absolute URLs: https anywhere, http on localhost", () => {
    expect(resolveAppUrl("http://localhost:3000", { host: "x.vercel.app" })).toBe("http://localhost:3000");
    expect(resolveAppUrl(" https://askwell.app ", { host: "x.vercel.app" })).toBe("https://askwell.app");
  });

  test("a set but invalid env URL is null, not a relative or odd address", () => {
    for (const bad of ["askwell.app", "//askwell.app", "ftp://askwell.app", "javascript:alert(1)", "https://", "/widget"]) {
      expect(resolveAppUrl(bad, { host: "x.vercel.app" })).toBeNull();
    }
  });

  test("falls back to the request's own origin when the env var is unset or blank", () => {
    expect(resolveAppUrl(undefined, { host: "askwell-git-x.vercel.app" })).toBe("https://askwell-git-x.vercel.app");
    expect(resolveAppUrl("  ", { host: "askwell-git-x.vercel.app" })).toBe("https://askwell-git-x.vercel.app");
  });

  test("prefers forwarded host and proto, using the first value", () => {
    expect(
      resolveAppUrl(undefined, { host: "internal:3000", forwardedHost: "app.example.com, proxy", forwardedProto: "https, http" }),
    ).toBe("https://app.example.com");
  });

  test("a non-local host is always https, even when the forwarded proto says http", () => {
    expect(resolveAppUrl(undefined, { host: "app.example.com", forwardedProto: "http" })).toBe("https://app.example.com");
    expect(resolveAppUrl(undefined, { host: "10.0.0.5:3000", forwardedProto: "http" })).toBe("https://10.0.0.5:3000");
  });

  test("localhost defaults to http, and an explicit proto wins", () => {
    expect(resolveAppUrl(undefined, { host: "localhost:3000" })).toBe("http://localhost:3000");
    expect(resolveAppUrl(undefined, { host: "localhost:3000", forwardedProto: "https" })).toBe("https://localhost:3000");
  });

  test("returns null for a missing or malformed host", () => {
    expect(resolveAppUrl(undefined, { host: null })).toBeNull();
    for (const host of ['evil.com"><script>', "a b", "x/y", "https://x.com", ""]) {
      expect(resolveAppUrl(undefined, { host })).toBeNull();
    }
  });
});

describe("buildInstallSnippet", () => {
  test("is the script tag with the widget path, the key and async", () => {
    expect(buildInstallSnippet({ appUrl: "https://askwell.app", publicKey: "pk_abc" })).toBe(
      '<script src="https://askwell.app/widget.js" data-key="pk_abc" async></script>',
    );
  });

  test("escapes attribute-breaking characters", () => {
    const s = buildInstallSnippet({ appUrl: "https://a.com", publicKey: 'pk_"><img>' });
    expect(s).not.toContain('"><img>');
    expect(s).toContain("pk_&quot;&gt;&lt;img&gt;");
  });
});

describe("InstallSnippet", () => {
  const snippet = '<script src="https://x.app/widget.js" data-key="pk_1" async></script>';

  test("shows the snippet as text, not markup", () => {
    const { container } = render(<InstallSnippet snippet={snippet} />);
    expect(screen.getByLabelText("Install snippet").textContent).toBe(snippet);
    expect(container.querySelector("script")).toBeNull();
  });

  test("Copy writes the snippet to the clipboard and shows Copied", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<InstallSnippet snippet={snippet} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy snippet" }));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(snippet);
    expect(trackSnippetCopied.mock.calls).toEqual([[ID]]); // snippet_copied, once
    expect(screen.getByRole("status").textContent).toContain("Copied");
  });

  test("Copied goes back to Copy snippet after a moment", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
      render(<InstallSnippet snippet={snippet} />);
      fireEvent.click(screen.getByRole("button", { name: "Copy snippet" }));
      await vi.waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2100);
      });
      expect(screen.getByRole("button", { name: "Copy snippet" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  test("a blocked clipboard selects the text and says to copy by hand", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
    render(<InstallSnippet snippet={snippet} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy snippet" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/press Ctrl\+C/));
    expect(window.getSelection()?.toString()).toBe(snippet);
    expect(screen.getByRole("button", { name: "Copy snippet" })).toBeTruthy();
    expect(trackSnippetCopied).not.toHaveBeenCalled();
  });

  test("no Clipboard API at all falls back the same way", async () => {
    vi.stubGlobal("navigator", {});
    render(<InstallSnippet snippet={snippet} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy snippet" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/press Ctrl\+C/));
    expect(window.getSelection()?.toString()).toBe(snippet);
  });
});

describe("InstallPage", () => {
  test("shows the snippet with the project's key and the env URL, plus the three steps", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://askwell.app");
    loadOwnedProject.mockResolvedValue(project);
    render(await InstallPage({ params: Promise.resolve({ id: ID }) }));
    expect(screen.getByLabelText("Install snippet").textContent).toBe(
      '<script src="https://askwell.app/widget.js" data-key="pk_abcDEF123-_" async></script>',
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(/before the closing/)).toBeTruthy();
  });

  test("without the env var it uses the request's own origin", async () => {
    headerValues.current = { host: "askwell-git-p2p-t08.vercel.app", "x-forwarded-proto": "https" };
    loadOwnedProject.mockResolvedValue(project);
    render(await InstallPage({ params: Promise.resolve({ id: ID }) }));
    expect(screen.getByLabelText("Install snippet").textContent).toContain(
      'src="https://askwell-git-p2p-t08.vercel.app/widget.js"',
    );
  });

  test("not found (missing or someone else's project) calls notFound", async () => {
    loadOwnedProject.mockResolvedValue(null);
    await expect(InstallPage({ params: Promise.resolve({ id: ID }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  test("an unusable host and no env var shows an error state, not a broken snippet", async () => {
    headerValues.current = { host: "bad host" };
    loadOwnedProject.mockResolvedValue(project);
    render(await InstallPage({ params: Promise.resolve({ id: ID }) }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByLabelText("Install snippet")).toBeNull();
  });

  test("a misconfigured NEXT_PUBLIC_APP_URL shows the error state", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "askwell.app");
    loadOwnedProject.mockResolvedValue(project);
    render(await InstallPage({ params: Promise.resolve({ id: ID }) }));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByLabelText("Install snippet")).toBeNull();
  });

  test("loading announces status", () => {
    render(<Loading />);
    expect(screen.getByRole("status").textContent).toBe("Loading install steps…");
  });
});
