import { cleanup, render, screen } from "@testing-library/react";
import { DEFAULT_WIDGET_CONFIG, PLAN_LIMITS, PLAN_PRICES_USD_MONTHLY } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getConfig = vi.hoisted(() => vi.fn());
vi.mock("../../lib/widget/config", () => ({ getWidgetConfigByKey: getConfig }));
const protectConfig = vi.hoisted(() => vi.fn());
vi.mock("../../lib/security/arcjet", () => ({ protectConfig }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));
const send = vi.hoisted(() => vi.fn());
vi.mock("../../lib/embed/chat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/embed/chat")>()),
  sendMessage: send,
}));

import { Demo, LiveDemo, SAMPLE_CONVERSATION, SAMPLE_DIVIDER } from "../../components/landing/demo";

const KEY = "pk_abcdef123456";
const NOT_AVAILABLE = "The live demo is not available right now.";

beforeEach(() => {
  getConfig.mockReset().mockResolvedValue(DEFAULT_WIDGET_CONFIG);
  protectConfig.mockReset().mockResolvedValue("allow");
  send.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("sample conversation", () => {
  test("is two questions and two answers", () => {
    expect(SAMPLE_CONVERSATION.map((m) => m.from)).toEqual(["visitor", "bot", "visitor", "bot"]);
  });

  test("every number in the plan answer comes from packages/shared", () => {
    const answer = SAMPLE_CONVERSATION[3]!.text;
    const numbers = answer.match(/\d[\d,]*/g)!.map((n) => Number(n.replaceAll(",", "")));
    const plan = (name: "free" | "pro") => [
      PLAN_PRICES_USD_MONTHLY[name],
      PLAN_LIMITS[name].projects,
      PLAN_LIMITS[name].messagesPerMonth,
      PLAN_LIMITS[name].knowledgeSources,
    ];
    expect(numbers).toEqual([...plan("free"), ...plan("pro")]);
  });
});

describe("LiveDemo", () => {
  test("shows the open chat: the sample, then the divider, then the input", async () => {
    const { container } = render(await LiveDemo({ widgetKey: KEY }));
    const log = screen.getByRole("log");
    const texts = Array.from(log.querySelectorAll("p"), (p) => p.textContent);
    expect(texts).toEqual([...SAMPLE_CONVERSATION.map((m) => m.text), SAMPLE_DIVIDER]);
    const input = screen.getByLabelText("Your message");
    expect(log.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close chat" })).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(getConfig).toHaveBeenCalledWith(KEY);
    expect(send).not.toHaveBeenCalled(); // the script is never sent
  });

  test("no config for the key: not available", async () => {
    getConfig.mockResolvedValue(null);
    render(await LiveDemo({ widgetKey: KEY }));
    expect(screen.getByText(NOT_AVAILABLE)).toBeTruthy();
    expect(screen.queryByLabelText("Your message")).toBeNull();
  });

  test("a failed lookup: not available", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getConfig.mockRejectedValue(new Error("db down"));
    render(await LiveDemo({ widgetKey: KEY }));
    expect(screen.getByText(NOT_AVAILABLE)).toBeTruthy();
  });

  test("over the rate limit: not available, and no database read", async () => {
    protectConfig.mockResolvedValue("rate_limited");
    render(await LiveDemo({ widgetKey: KEY }));
    expect(screen.getByText(NOT_AVAILABLE)).toBeTruthy();
    expect(getConfig).not.toHaveBeenCalled();
    expect(protectConfig.mock.calls[0]?.[0].headers.get("x-forwarded-for")).toBe("203.0.113.7");
  });
});

test("Demo without a key: not available, and nothing is read", () => {
  render(<Demo widgetKey={null} />);
  expect(screen.getByRole("heading", { name: "Live demo" })).toBeTruthy();
  expect(screen.getByText(NOT_AVAILABLE)).toBeTruthy();
  expect(getConfig).not.toHaveBeenCalled();
});
