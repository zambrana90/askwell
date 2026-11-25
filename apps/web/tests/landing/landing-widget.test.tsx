import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../../components/auth/app-clerk-provider", () => ({ AppClerkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../components/landing/header", () => ({ LandingHeader: () => null }));

import Home, * as pageModule from "../../app/page";
import { landingWidgetKey } from "../../components/landing/landing-widget";

const KEY = "pk_abcdef123456";

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => vi.unstubAllEnvs());

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

describe("landing page", () => {
  test("the page is dynamic, so the key is read per request and not inlined at build", () => {
    expect(pageModule.dynamic).toBe("force-dynamic");
  });

  test("no corner widget: the page adds no script, with or without a key", () => {
    for (const key of ["", KEY]) {
      vi.stubEnv("LANDING_WIDGET_KEY", key);
      const html = renderToStaticMarkup(<Home />);
      expect(html).not.toContain("<script");
    }
  });

  test("without the key: the demo says it is not available, with no chat input", () => {
    vi.stubEnv("LANDING_WIDGET_KEY", "");
    const html = renderToStaticMarkup(<Home />);
    expect(html).toContain("The live demo is not available right now.");
    expect(html).not.toContain("Your message");
  });
});
