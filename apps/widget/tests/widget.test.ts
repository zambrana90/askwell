import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DEFAULT_WIDGET_CONFIG, type WidgetConfig } from "@askwell/shared";
import { buildEmbedUrl } from "@askwell/shared/embed";
import { init } from "../src/widget";
import { inkFor, parseConfig } from "../src/config";

const APP = "https://app.test";
const KEY = "pk_abcdef123456";
const config: WidgetConfig = {
  ...DEFAULT_WIDGET_CONFIG,
  buttonColor: "#ff0000",
  label: "Help me",
  position: "top-left",
  animation: "slide",
  headerText: "Hi there",
};

function scriptTag(attrs: { key?: string; src?: string } = {}): HTMLScriptElement {
  const s = document.createElement("script");
  s.src = attrs.src ?? `${APP}/widget.js`;
  if (attrs.key !== undefined) s.dataset.key = attrs.key;
  else if (!("key" in attrs)) s.dataset.key = KEY;
  document.head.append(s);
  return s;
}
const respond = (body: unknown, ok = true) =>
  vi.fn().mockResolvedValue({ ok, json: () => Promise.resolve(body) });
const root = (host: HTMLElement) => host.shadowRoot!;
const button = (host: HTMLElement) => root(host).querySelector<HTMLButtonElement>("button")!;
const panelFrame = (host: HTMLElement) => root(host).querySelector("iframe");

beforeEach(() => {
  delete (window as unknown as Record<string, unknown>).__askwellWidget;
  document.body.innerHTML = "";
  document.head.innerHTML = "";
});
afterEach(() => vi.unstubAllGlobals());

async function mount(cfg: unknown = config) {
  vi.stubGlobal("fetch", respond(cfg));
  const host = await init(scriptTag());
  expect(host).not.toBeNull();
  return host!;
}
const post = (data: unknown, origin: string, source: unknown) =>
  window.dispatchEvent(new MessageEvent("message", { data, origin, source: source as Window }));

describe("nothing renders", () => {
  test("no data-key: no fetch, nothing rendered", async () => {
    const fetchMock = respond(config);
    vi.stubGlobal("fetch", fetchMock);
    expect(await init(scriptTag({ key: "" }))).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.body.children).toHaveLength(0);
  });

  test.each([
    ["a non-OK response", () => respond({ error: { code: "not_found" } }, false)],
    ["a network error", () => vi.fn().mockRejectedValue(new TypeError("offline"))],
    ["invalid JSON", () => vi.fn().mockResolvedValue({ ok: true, json: () => Promise.reject(new SyntaxError("x")) })],
    ["a wrong shape", () => respond({ hello: "world" })],
    ["a null body", () => respond(null)],
  ])("%s: nothing rendered, nothing thrown", async (_name, make) => {
    vi.stubGlobal("fetch", make());
    await expect(init(scriptTag())).resolves.toBeNull();
    expect(document.body.children).toHaveLength(0);
  });

  test("an opaque script origin renders nothing", async () => {
    vi.stubGlobal("fetch", respond(config));
    expect(await init(scriptTag({ src: "data:text/javascript,1" }))).toBeNull();
  });

  test("fetches the config from the script's own origin, without credentials", async () => {
    const fetchMock = respond(config);
    vi.stubGlobal("fetch", fetchMock);
    await init(scriptTag({ src: "https://other.example/widget.js?v=1" }));
    expect(fetchMock).toHaveBeenCalledWith(
      `https://other.example/api/widget/config?key=${KEY}`,
      expect.objectContaining({ credentials: "omit" }),
    );
  });

  test("a second init does nothing (double-init guard)", async () => {
    vi.stubGlobal("fetch", respond(config));
    await init(scriptTag());
    expect(await init(scriptTag())).toBeNull();
    expect(document.body.children).toHaveLength(1);
  });
});

describe("rendering", () => {
  test("one host element; the button lives only in its shadow root", async () => {
    const host = await mount();
    expect(document.body.children).toHaveLength(1);
    expect(document.body.contains(host)).toBe(true);
    expect(document.querySelector("button")).toBeNull();
    expect(button(host)).toBeTruthy();
    expect(host.shadowRoot!.querySelector("style")).toBeTruthy();
  });

  test("config styles apply: color, label, corner, animation", async () => {
    const host = await mount();
    const wrap = root(host).querySelector<HTMLElement>("[data-pos]")!;
    expect(wrap.dataset.pos).toBe("top-left");
    expect(wrap.dataset.anim).toBe("slide");
    expect(wrap.style.getPropertyValue("--c")).toBe("#ff0000");
    expect(button(host).textContent).toContain("Help me");
  });

  test("the label is text, never HTML", async () => {
    const host = await mount({ ...config, label: "<img src=x onerror=alert(1)>" });
    expect(root(host).querySelector("img")).toBeNull();
    expect(button(host).textContent).toContain("<img src=x onerror=alert(1)>");
  });

  test("an unsafe color falls back to black", async () => {
    const host = await mount({ ...config, buttonColor: "red;background:url(x)" });
    expect(root(host).querySelector<HTMLElement>("[data-pos]")!.style.getPropertyValue("--c")).toBe("#000000");
  });

  test("text color contrasts with the button", () => {
    expect(inkFor("#000000")).toBe("#ffffff");
    expect(inkFor("#ffffff")).toBe("#000000");
    expect(inkFor("#fff")).toBe("#000000");
  });

  test("parseConfig rejects bad values", () => {
    expect(parseConfig(config)).toEqual(config);
    for (const bad of [{ ...config, position: "middle" }, { ...config, animation: "spin" }, { ...config, showBadge: "yes" }, { ...config, label: 3 }]) {
      expect(parseConfig(bad)).toBeNull();
    }
  });
});

describe("opening and closing", () => {
  test("the iframe is created once, on first click, with the contract's url", async () => {
    const host = await mount();
    expect(panelFrame(host)).toBeNull();
    button(host).click();
    const frame = panelFrame(host)!;
    expect(frame.src).toBe(buildEmbedUrl(APP, KEY, location.origin));
    expect(frame.getAttribute("sandbox")).toContain("allow-scripts");
    expect(button(host).getAttribute("aria-expanded")).toBe("true");
    button(host).click();
    button(host).click();
    expect(root(host).querySelectorAll("iframe")).toHaveLength(1);
    expect(button(host).getAttribute("aria-expanded")).toBe("true");
  });

  test("visibility goes to the iframe with the app origin as targetOrigin", async () => {
    const host = await mount();
    button(host).click();
    const spy = vi.spyOn(panelFrame(host)!.contentWindow!, "postMessage");
    button(host).click();
    expect(spy).toHaveBeenLastCalledWith({ type: "askwell:visibility", open: false }, APP);
    button(host).click();
    expect(spy).toHaveBeenLastCalledWith({ type: "askwell:visibility", open: true }, APP);
  });

  test("Escape closes", async () => {
    const host = await mount();
    button(host).click();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(button(host).getAttribute("aria-expanded")).toBe("false");
    expect(root(host).querySelector("[data-open]")).toBeNull();
  });
});

describe("messages from the panel", () => {
  async function opened() {
    const host = await mount();
    button(host).click();
    return { host, source: panelFrame(host)!.contentWindow };
  }
  const badge = (host: HTMLElement) => root(host).querySelector<HTMLElement>(".badge")!;

  test("close from the panel closes it", async () => {
    const { host, source } = await opened();
    post({ type: "askwell:close" }, APP, source);
    expect(button(host).getAttribute("aria-expanded")).toBe("false");
  });

  test("unread shows a badge on the closed button, and opening clears it", async () => {
    const { host, source } = await opened();
    button(host).click(); // close
    post({ type: "askwell:unread", count: 3 }, APP, source);
    expect(badge(host).hidden).toBe(false);
    expect(badge(host).textContent).toBe("3");
    expect(button(host).getAttribute("aria-label")).toContain("3 unread");
    button(host).click(); // open
    expect(badge(host).hidden).toBe(true);
  });

  test("resize is clamped", async () => {
    const { host, source } = await opened();
    const wrap = root(host).querySelector<HTMLElement>("[data-pos]")!;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 2000 });
    post({ type: "askwell:resize", height: 5000 }, APP, source);
    expect(wrap.style.getPropertyValue("--h")).toBe("640px");
    post({ type: "askwell:resize", height: 10 }, APP, source);
    expect(wrap.style.getPropertyValue("--h")).toBe("320px");
    post({ type: "askwell:resize", height: 450 }, APP, source);
    expect(wrap.style.getPropertyValue("--h")).toBe("450px");
  });

  test("a foreign origin is ignored", async () => {
    const { host, source } = await opened();
    button(host).click();
    post({ type: "askwell:unread", count: 5 }, "https://evil.test", source);
    post({ type: "askwell:close" }, "https://evil.test", source);
    expect(badge(host).hidden).toBe(true);
    expect(button(host).getAttribute("aria-expanded")).toBe("false"); // our own click above
  });

  test("a foreign source (right origin, other window) is ignored", async () => {
    const { host } = await opened();
    post({ type: "askwell:close" }, APP, window);
    post({ type: "askwell:close" }, APP, null);
    expect(button(host).getAttribute("aria-expanded")).toBe("true");
  });

  test("junk and loader-direction messages are ignored", async () => {
    const { host, source } = await opened();
    for (const data of [null, "askwell:close", { type: "askwell:close", x: 1 }, { type: "askwell:visibility", open: false }, { type: "askwell:resize", height: "9" }]) {
      post(data, APP, source);
    }
    expect(button(host).getAttribute("aria-expanded")).toBe("true");
  });

  test("messages before the iframe exists are ignored", async () => {
    const host = await mount();
    post({ type: "askwell:unread", count: 2 }, APP, window);
    expect(root(host).querySelector<HTMLElement>(".badge")!.hidden).toBe(true);
  });
});
