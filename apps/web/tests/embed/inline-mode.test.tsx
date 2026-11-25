import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
vi.mock("../../lib/embed/chat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/embed/chat")>()),
  sendMessage: send,
}));

import { EmbedPanel } from "../../components/embed/embed-panel";

const KEY = "pk_abcdef123456";
const HOST = "https://example.com";
const SAMPLE = [
  { from: "visitor", text: "Sample question" },
  { from: "bot", text: "<b>Sample</b> answer" },
] as const;

const parentPost = vi.fn();
const fakeParent = { postMessage: parentPost };

beforeEach(() => {
  parentPost.mockClear();
  send.mockReset().mockResolvedValue({ conversationId: "c1", reply: "Live answer" });
  Object.defineProperty(window, "parent", { configurable: true, value: fakeParent });
});
afterEach(() => {
  cleanup();
  delete (window as { parent?: unknown }).parent;
  vi.restoreAllMocks();
});

// A host origin is passed on purpose: inline mode must ignore it.
const panel = () => (
  <EmbedPanel publicKey={KEY} config={DEFAULT_WIDGET_CONFIG} hostOrigin={HOST} inline initialMessages={SAMPLE} initialDivider="Your turn" />
);
const ask = async (text: string) => {
  fireEvent.change(screen.getByLabelText("Your message"), { target: { value: text } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
  });
};

describe("inline mode", () => {
  test("has no close button, and its heading is not a second h1", () => {
    render(panel());
    expect(screen.queryByRole("button", { name: "Close chat" })).toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 3, name: DEFAULT_WIDGET_CONFIG.headerText })).toBeTruthy();
  });

  test("posts nothing to a parent and listens for no messages", async () => {
    const listen = vi.spyOn(window, "addEventListener");
    render(panel());
    await ask("Hello");
    fireEvent.keyDown(screen.getByLabelText("Your message"), { key: "Escape" });
    expect(parentPost).not.toHaveBeenCalled();
    expect(listen.mock.calls.filter(([type]) => type === "message")).toEqual([]);
  });

  test("fills its container, takes the page's theme, and does not take focus", () => {
    const { container } = render(panel());
    const root = container.firstElementChild!;
    expect(root.className.split(" ")).toContain("h-full");
    // No size of its own, and no frame: the container draws it.
    expect(root.className).not.toMatch(/h-dvh|h-\[|theme-auto|rounded|border|shadow/);
    expect(document.activeElement).toBe(document.body);
  });

  test("sends only what the visitor types; the sample is text, not HTML", async () => {
    const { container } = render(panel());
    expect(screen.getByText("<b>Sample</b> answer")).toBeTruthy();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.queryByText("Ask a question to get started.")).toBeNull();
    await ask("Hello");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toMatchObject({ key: KEY, message: "Hello", conversationId: undefined });
    expect(JSON.stringify(send.mock.calls[0])).not.toContain("Sample");
    expect(screen.getByText("Live answer")).toBeTruthy();
  });

  test("what the visitor and the bot say is kept out of session replay", async () => {
    render(panel());
    await ask("Hello");
    for (const text of ["Hello", "Live answer"]) expect(screen.getByText(text).className).toContain("ph-no-capture");
  });
});
