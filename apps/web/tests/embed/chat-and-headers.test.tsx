import { afterEach, expect, test, vi } from "vitest";
import config from "../../next.config";
import { ChatError, chatErrorMessage, sendMessage } from "../../lib/embed/chat";

afterEach(() => vi.useRealTimers());

test("the mock sendMessage waits, then returns a canned reply and a stable id", async () => {
  vi.useFakeTimers();
  const req = { key: "pk_abcdef123456", visitorId: "v1", message: "hi" };
  const first = sendMessage(req);
  await vi.advanceTimersByTimeAsync(2000);
  const a = await first;
  expect(a.reply.length).toBeGreaterThan(0);
  const second = sendMessage(req);
  await vi.advanceTimersByTimeAsync(2000);
  expect((await second).conversationId).toBe(a.conversationId);
  const third = sendMessage({ ...req, conversationId: "11111111-1111-4111-8111-111111111111" });
  await vi.advanceTimersByTimeAsync(2000);
  expect((await third).conversationId).toBe("11111111-1111-4111-8111-111111111111");
});

test("chatErrorMessage maps codes to friendly text", () => {
  expect(chatErrorMessage(new ChatError("rate_limited"))).toMatch(/too fast/i);
  expect(chatErrorMessage(new ChatError("quota_exceeded"))).toMatch(/unavailable/i);
  expect(chatErrorMessage(new ChatError("internal"))).toMatch(/went wrong/i);
  expect(chatErrorMessage("x")).toMatch(/went wrong/i);
});

test("framing headers: /embed is open, every other route is same-origin only", async () => {
  const rules = await config.headers!();
  const csp = (r: (typeof rules)[number]) => r.headers.find((h) => h.key === "Content-Security-Policy")?.value;
  const embed = rules.find((r) => r.source === "/embed")!;
  expect(csp(embed)).toBe("frame-ancestors *");
  const rest = rules.filter((r) => r.source !== "/embed");
  expect(rest).toHaveLength(1);
  expect(csp(rest[0]!)).toBe("frame-ancestors 'self'");
  // The catch-all must not match /embed, and must match the others.
  const match = (path: string) => new RegExp(`^${rest[0]!.source.replace(/^\/:path/, "/")}$`).test(path);
  expect(match("/embed")).toBe(false);
  expect(match("/")).toBe(true);
  expect(match("/dashboard")).toBe(true);
  expect(match("/embedded")).toBe(true);
});
