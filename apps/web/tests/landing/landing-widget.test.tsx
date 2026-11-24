import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../../components/auth/app-clerk-provider", () => ({ AppClerkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../components/landing/header", () => ({ LandingHeader: () => null }));

import Home, * as pageModule from "../../app/page";
import { Demo } from "../../components/landing/demo";
import { LandingWidget, landingWidgetKey } from "../../components/landing/landing-widget";

const KEY = "pk_abcdef123456";
// React 19 hoists <script async src> into <head>, so look at the whole document.
const scripts = () => Array.from(document.querySelectorAll<HTMLScriptElement>("script[data-key]"));

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => {
  cleanup();
  document.head.querySelectorAll("script[data-key]").forEach((n) => n.remove());
  vi.unstubAllEnvs();
});

describe("landingWidgetKey", () => {
  test("reads LANDING_WIDGET_KEY from the environment on every call (request time)", () => {
    vi.stubEnv("LANDING_WIDGET_KEY", KEY);
    expect(landingWidgetKey()).toBe(KEY);
    vi.stubEnv("LANDING_WIDGET_KEY", "pk_anotherkey1234");
    expect(landingWidgetKey()).toBe("pk_anotherkey1234");
  });

  test("missing, empty or invalid is null", () => {
    vi.stubEnv("LANDING_WIDGET_KEY", "");
    expect(landingWidgetKey()).toBeNull();
    vi.stubEnv("LANDING_WIDGET_KEY", "not a key");
    expect(landingWidgetKey()).toBeNull();
    vi.stubEnv("LANDING_WIDGET_KEY", '"><script>alert(1)</script>');
    expect(landingWidgetKey()).toBeNull();
    delete (process.env as Record<string, string | undefined>).LANDING_WIDGET_KEY; // unset
    expect(landingWidgetKey()).toBeNull();
  });

  test("whitespace around the key is ignored", () => {
    vi.stubEnv("LANDING_WIDGET_KEY", `  ${KEY}\n`);
    expect(landingWidgetKey()).toBe(KEY);
  });
});

describe("LandingWidget", () => {
  test("renders the widget script tag with the key", () => {
    render(<LandingWidget widgetKey={KEY} />);
    const [tag] = scripts();
    expect(tag?.getAttribute("src")).toBe("/widget.js");
    expect(tag?.getAttribute("data-key")).toBe(KEY);
    expect(tag?.hasAttribute("async")).toBe(true);
  });

  test("renders nothing without a key", () => {
    const { container } = render(<LandingWidget widgetKey={null} />);
    expect(container.innerHTML).toBe("");
    expect(scripts()).toHaveLength(0);
  });
});

describe("landing page", () => {
  test("the page is dynamic, so the key is read per request and not inlined at build", () => {
    expect(pageModule.dynamic).toBe("force-dynamic");
  });

  test("with the key set: the script tag is on the page and Demo points to the corner button", () => {
    vi.stubEnv("LANDING_WIDGET_KEY", KEY);
    // Server render, as the request does: React puts the script in the document head.
    const html = renderToStaticMarkup(<Home />);
    expect(html).toMatch(new RegExp(`<script[^>]*src="/widget.js"[^>]*data-key="${KEY}"|<script[^>]*data-key="${KEY}"[^>]*src="/widget.js"`));
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).toContain("the chat button in the corner of this page is the real");
    expect(html).not.toContain("Preview of the chat widget"); // no static mock
  });

  test("without the key: no script tag, no error, no mock", () => {
    vi.stubEnv("LANDING_WIDGET_KEY", "");
    const html = renderToStaticMarkup(<Home />);
    expect(html).not.toContain("<script");
    expect(html).toContain("The live demo is not available right now.");
    expect(html).not.toContain("Preview of the chat widget");
  });
});

describe("Demo", () => {
  test("live text vs not-live text", () => {
    const { rerender } = render(<Demo live />);
    expect(screen.getByRole("heading", { name: "Live demo" })).toBeTruthy();
    expect(screen.getByText(/real Askwell widget/)).toBeTruthy();
    rerender(<Demo live={false} />);
    expect(screen.getByText("The live demo is not available right now.")).toBeTruthy();
  });
});
