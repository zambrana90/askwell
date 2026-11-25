import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, test } from "vitest";
import { LandingWidgetScript } from "../../components/landing/landing-widget-script";

const KEY = "pk_abcdef123456";
const win = window as unknown as Record<string, unknown>;
const scripts = () => Array.from(document.querySelectorAll<HTMLScriptElement>('script[src="/widget.js"]'));
const hosts = () => document.querySelectorAll("askwell-widget");
/** Let MutationObserver callbacks run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** What widget.js does once its config has arrived. */
async function widgetStarts() {
  win.__askwellWidget = true;
  document.body.append(document.createElement("askwell-widget"));
  await settle();
}

afterEach(() => {
  cleanup();
  delete win.__askwellWidget;
});

describe("LandingWidgetScript", () => {
  test("mount adds exactly one script to body, with the key", () => {
    render(<LandingWidgetScript widgetKey={KEY} />);
    expect(scripts()).toHaveLength(1);
    const [script] = scripts();
    expect(script?.parentElement).toBe(document.body);
    expect(script?.dataset.key).toBe(KEY);
    expect(script?.async).toBe(true);
  });

  test("Strict Mode's double mount still leaves one script", () => {
    render(
      <StrictMode>
        <LandingWidgetScript widgetKey={KEY} />
      </StrictMode>,
    );
    expect(scripts()).toHaveLength(1);
  });

  test("unmount removes the script and every widget element", async () => {
    const { unmount } = render(<LandingWidgetScript widgetKey={KEY} />);
    const [script] = scripts();
    await widgetStarts();
    expect(hosts()).toHaveLength(1);
    unmount();
    expect(scripts()).toHaveLength(0);
    expect(hosts()).toHaveLength(0);
    // If it had not run yet, widget.js now finds no key and does nothing.
    expect(script?.dataset.key).toBeUndefined();
  });

  test("a widget that finishes starting after unmount is removed", async () => {
    render(<LandingWidgetScript widgetKey={KEY} />).unmount();
    await widgetStarts();
    expect(hosts()).toHaveLength(0);
  });

  test("mount, unmount, mount: the widget can start again, with exactly one element", async () => {
    const first = render(<LandingWidgetScript widgetKey={KEY} />);
    await widgetStarts();
    first.unmount();
    expect(win.__askwellWidget).toBeUndefined(); // widget.js would otherwise refuse to start
    render(<LandingWidgetScript widgetKey={KEY} />);
    expect(scripts()).toHaveLength(1);
    await widgetStarts();
    expect(hosts()).toHaveLength(1);
    await widgetStarts(); // a late start left over from the first visit
    expect(hosts()).toHaveLength(1);
  });
});
