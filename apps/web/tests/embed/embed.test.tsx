import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DEFAULT_WIDGET_CONFIG, MAX_MESSAGE_LENGTH, MAX_VISITOR_ID_LENGTH, type WidgetConfig } from "@askwell/shared";
import { VISITOR_ID_STORAGE_KEY } from "@askwell/shared/embed";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getConfig = vi.hoisted(() => vi.fn());
vi.mock("../../lib/widget/config", () => ({ getWidgetConfigByKey: getConfig }));

const send = vi.hoisted(() => vi.fn());
vi.mock("../../lib/embed/chat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/embed/chat")>()),
  sendMessage: send,
}));

import EmbedPage from "../../app/embed/page";
import { EmbedPanel } from "../../components/embed/embed-panel";
import { ChatError } from "../../lib/embed/chat";
import { parseHostOrigin } from "../../lib/embed/origin";
import { getVisitorId, resetVisitorMemory } from "../../lib/embed/visitor";

const KEY = "pk_abcdef123456";
const HOST = "https://example.com";
const config: WidgetConfig = { ...DEFAULT_WIDGET_CONFIG, headerText: "Hi there" };

const parentPost = vi.fn();
const fakeParent = { postMessage: parentPost };

beforeEach(() => {
  localStorage.clear();
  resetVisitorMemory();
  parentPost.mockClear();
  send.mockReset();
  getConfig.mockReset();
  Object.defineProperty(window, "parent", { configurable: true, value: fakeParent });
});
afterEach(() => {
  cleanup();
  delete (window as { parent?: unknown }).parent;
  vi.restoreAllMocks();
});

const panel = (hostOrigin: string | null = HOST) => (
  <EmbedPanel publicKey={KEY} config={config} hostOrigin={hostOrigin} />
);
const typeAndSend = (text: string) => {
  fireEvent.change(screen.getByLabelText("Your message"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
};
const fromLoader = (data: unknown, origin = HOST, source: unknown = fakeParent) =>
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data, origin, source: source as Window }));
  });

describe("/embed page", () => {
  const run = async (params: Record<string, string | undefined>) =>
    EmbedPage({ searchParams: Promise.resolve(params) });

  test("a bad key renders nothing and never queries", async () => {
    for (const params of [{}, { key: "nope" }, { key: "" }]) {
      expect(await run(params)).toBeNull();
    }
    expect(getConfig).not.toHaveBeenCalled();
  });

  test("an unknown key renders nothing", async () => {
    getConfig.mockResolvedValue(null);
    expect(await run({ key: KEY })).toBeNull();
  });

  test("a lookup failure renders nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getConfig.mockRejectedValue(new Error("db down"));
    expect(await run({ key: KEY })).toBeNull();
  });

  test("a good key renders the panel with the header text", async () => {
    getConfig.mockResolvedValue(config);
    const ui = await run({ key: KEY, origin: HOST });
    render(ui);
    expect(screen.getByRole("heading", { name: "Hi there" })).toBeTruthy();
    expect(getConfig).toHaveBeenCalledWith(KEY);
  });
});

describe("panel", () => {
  test("send shows the typing state, then the reply", async () => {
    let resolve!: (value: { conversationId: string; reply: string }) => void;
    send.mockReturnValue(new Promise((r) => (resolve = r)));
    render(panel());
    typeAndSend("Hello");
    expect(screen.getByText("Hello")).toBeTruthy();
    expect(screen.getByTestId("typing")).toBeTruthy();
    await act(async () => resolve({ conversationId: "c1", reply: "Hi back" }));
    expect(screen.queryByTestId("typing")).toBeNull();
    expect(screen.getByText("Hi back")).toBeTruthy();
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ key: KEY, message: "Hello" }));
  });

  test("the conversation id is reused for the next message", async () => {
    send.mockResolvedValue({ conversationId: "c1", reply: "ok" });
    render(panel());
    typeAndSend("one");
    await screen.findByText("ok");
    typeAndSend("two");
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1]?.[0].conversationId).toBe("c1");
  });

  test("messages and replies are text, never HTML", async () => {
    const evil = "<img src=x onerror=alert(1)>";
    send.mockResolvedValue({ conversationId: "c1", reply: "<b>bold</b>" });
    const { container } = render(panel());
    typeAndSend(evil);
    await screen.findByText("<b>bold</b>");
    expect(screen.getByText(evil)).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  test("the input is capped and empty messages are not sent", () => {
    render(panel());
    expect(screen.getByLabelText("Your message").getAttribute("maxlength")).toBe(String(MAX_MESSAGE_LENGTH));
    fireEvent.change(screen.getByLabelText("Your message"), { target: { value: "   " } });
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  test.each([
    ["rate_limited", /too fast/i],
    ["quota_exceeded", /unavailable/i],
    ["forbidden", /can't help with that/i],
  ] as const)("%s shows a friendly message", async (code, pattern) => {
    send.mockRejectedValue(new ChatError(code, "server detail that must not show"));
    render(panel());
    typeAndSend("hi");
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(pattern);
    expect(alert.textContent).not.toMatch(/server detail/);
    expect(screen.queryByTestId("typing")).toBeNull();
  });

  test("not_found clears the conversation id and shows the generic error", async () => {
    send.mockResolvedValueOnce({ conversationId: "c1", reply: "ok" });
    send.mockRejectedValueOnce(new ChatError("not_found"));
    send.mockResolvedValueOnce({ conversationId: "c2", reply: "fresh" });
    render(panel());
    typeAndSend("one");
    await screen.findByText("ok");
    typeAndSend("two");
    expect((await screen.findByRole("alert")).textContent).toMatch(/something went wrong/i);
    typeAndSend("three");
    await screen.findByText("fresh");
    expect(send.mock.calls[1]?.[0].conversationId).toBe("c1");
    expect(send.mock.calls[2]?.[0].conversationId).toBeUndefined();
  });

  test("an unknown error shows a generic message", async () => {
    send.mockRejectedValue(new Error("boom"));
    render(panel());
    typeAndSend("hi");
    expect((await screen.findByRole("alert")).textContent).toMatch(/something went wrong/i);
  });

  test("the badge shows only when showBadge is true", () => {
    const { rerender } = render(panel());
    expect(screen.getByText(/Powered by Askwell/)).toBeTruthy();
    rerender(<EmbedPanel publicKey={KEY} config={{ ...config, showBadge: false }} hostOrigin={HOST} />);
    expect(screen.queryByText(/Powered by/)).toBeNull();
  });
});

describe("visitor id", () => {
  test("is created once, stored, and reused", () => {
    const first = getVisitorId();
    expect(first.length).toBeGreaterThan(0);
    expect(localStorage.getItem(VISITOR_ID_STORAGE_KEY)).toBe(first);
    resetVisitorMemory(); // a new page load
    expect(getVisitorId()).toBe(first);
  });

  test("stays stable in memory when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const id = getVisitorId();
    expect(id.length).toBeGreaterThan(0);
    expect(getVisitorId()).toBe(id);
  });

  test("a stored id is kept even if storage fails later", () => {
    localStorage.setItem(VISITOR_ID_STORAGE_KEY, "stored-id");
    expect(getVisitorId()).toBe("stored-id");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getVisitorId()).toBe("stored-id");
  });

  test("works without crypto.randomUUID (non-secure context)", () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    try {
      const id = getVisitorId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(localStorage.getItem(VISITOR_ID_STORAGE_KEY)).toBe(id);
      expect(id.length).toBeLessThanOrEqual(MAX_VISITOR_ID_LENGTH);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("the panel sends it with each message", async () => {
    send.mockResolvedValue({ conversationId: "c1", reply: "ok" });
    render(panel());
    typeAndSend("hi");
    await screen.findByText("ok");
    expect(send.mock.calls[0]?.[0].visitorId).toBe(localStorage.getItem(VISITOR_ID_STORAGE_KEY));
  });
});

describe("postMessage", () => {
  test("close and resize go to the host origin, never *", () => {
    render(panel());
    fireEvent.click(screen.getByRole("button", { name: "Close chat" }));
    expect(parentPost).toHaveBeenCalledWith({ type: "askwell:close" }, HOST);
    expect(parentPost).toHaveBeenCalledWith(expect.objectContaining({ type: "askwell:resize" }), HOST);
    for (const call of parentPost.mock.calls) expect(call[1]).toBe(HOST);
  });

  test("Escape inside the panel posts close to the host origin", () => {
    render(panel());
    fireEvent.keyDown(screen.getByLabelText("Your message"), { key: "Escape" });
    expect(parentPost).toHaveBeenCalledWith({ type: "askwell:close" }, HOST);
    parentPost.mockClear();
    fireEvent.keyDown(screen.getByLabelText("Your message"), { key: "a" });
    expect(parentPost).not.toHaveBeenCalledWith({ type: "askwell:close" }, HOST);
  });

  test("Escape that cancels an IME composition does not close", () => {
    render(panel());
    fireEvent.keyDown(screen.getByLabelText("Your message"), { key: "Escape", isComposing: true });
    expect(parentPost).not.toHaveBeenCalledWith({ type: "askwell:close" }, HOST);
  });

  test("Escape with no valid origin posts nothing", () => {
    render(panel(null));
    fireEvent.keyDown(screen.getByLabelText("Your message"), { key: "Escape" });
    expect(parentPost).not.toHaveBeenCalled();
  });

  test("with no valid origin nothing is posted", () => {
    render(panel(null));
    fireEvent.click(screen.getByRole("button", { name: "Close chat" }));
    expect(parentPost).not.toHaveBeenCalled();
  });

  test("hidden: replies count as unread; shown: reset and focus", async () => {
    send.mockResolvedValue({ conversationId: "c1", reply: "ok" });
    render(panel());
    fromLoader({ type: "askwell:visibility", open: false });
    typeAndSend("hi");
    await screen.findByText("ok");
    await waitFor(() =>
      expect(parentPost).toHaveBeenCalledWith({ type: "askwell:unread", count: 1 }, HOST),
    );
    fromLoader({ type: "askwell:visibility", open: true });
    await waitFor(() =>
      expect(parentPost).toHaveBeenLastCalledWith({ type: "askwell:unread", count: 0 }, HOST),
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Your message"));
  });

  test("ignores foreign origins, foreign windows and junk", async () => {
    send.mockResolvedValue({ conversationId: "c1", reply: "ok" });
    render(panel());
    fromLoader({ type: "askwell:visibility", open: false }, "https://evil.com");
    fromLoader({ type: "askwell:visibility", open: false }, HOST, window);
    fromLoader({ type: "askwell:visibility", open: "no" });
    fromLoader({ type: "askwell:close" });
    typeAndSend("hi");
    await screen.findByText("ok");
    // Still open, so the reply is not unread.
    expect(parentPost).not.toHaveBeenCalledWith({ type: "askwell:unread", count: 1 }, HOST);
  });
});

describe("parseHostOrigin", () => {
  test.each([
    ["https://example.com", "https://example.com"],
    ["http://localhost:3000", "http://localhost:3000"],
    ["https://example.com/", "https://example.com"],
  ])("accepts %s", (raw, expected) => expect(parseHostOrigin(raw)).toBe(expected));

  test.each([
    undefined, null, "", "null", "*", "example.com", "file:///x", "javascript:alert(1)",
    "https://example.com/path", "https://example.com?x=1", "https://u:p@example.com", 5,
  ])("rejects %s", (raw) => expect(parseHostOrigin(raw)).toBeNull());
});
