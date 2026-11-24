import { afterEach, expect, test, vi } from "vitest";
import config from "../../next.config";
import { ChatError, chatErrorMessage, sendMessage } from "../../lib/embed/chat";

afterEach(() => vi.unstubAllGlobals());

const req = { key: "pk_abcdef123456", visitorId: "v1", message: "hi" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test("sendMessage posts the request to /api/widget/chat and returns the parsed response", async () => {
  const fetchMock = vi.fn().mockResolvedValue(json({ conversationId: "c1", reply: "<b>hi</b>" }));
  vi.stubGlobal("fetch", fetchMock);
  const withId = { ...req, conversationId: "11111111-1111-4111-8111-111111111111" };
  expect(await sendMessage(withId)).toEqual({ conversationId: "c1", reply: "<b>hi</b>" });
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe("/api/widget/chat");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual(withId);
});

test.each([
  [429, "rate_limited"],
  [429, "quota_exceeded"],
  [403, "forbidden"],
  [404, "not_found"],
  [400, "validation_error"],
])("sendMessage throws ChatError(%i %s) with the API's code", async (status, code) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { code, message: "detail" } }, status)));
  await expect(sendMessage(req)).rejects.toMatchObject({ name: "ChatError", code });
});

test("network errors, junk bodies and unknown codes become ChatError(internal)", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
  await expect(sendMessage(req)).rejects.toMatchObject({ code: "internal" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 502 })));
  await expect(sendMessage(req)).rejects.toMatchObject({ code: "internal" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { code: "weird" } }, 500)));
  await expect(sendMessage(req)).rejects.toMatchObject({ code: "internal" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ nope: 1 })));
  await expect(sendMessage(req)).rejects.toMatchObject({ code: "internal" });
});

test("chatErrorMessage maps codes to friendly text", () => {
  expect(chatErrorMessage(new ChatError("rate_limited"))).toMatch(/too fast/i);
  expect(chatErrorMessage(new ChatError("quota_exceeded"))).toMatch(/unavailable/i);
  expect(chatErrorMessage(new ChatError("forbidden"))).toBe("Sorry, I can't help with that.");
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
