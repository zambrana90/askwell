import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const protect = vi.fn();
vi.mock("@arcjet/next", () => ({
  default: () => ({ protect }),
  fixedWindow: (o: unknown) => o,
  detectPromptInjection: (o: unknown) => o,
}));

import { protectChat, protectConfig } from "../../lib/security/arcjet";

const req = new Request("http://localhost/x");
const decision = (o: { denied?: boolean; injection?: boolean; errored?: boolean }) => ({
  isDenied: () => !!o.denied,
  isErrored: () => !!o.errored,
  reason: { isPromptInjection: () => !!o.injection, message: "boom" },
});

beforeEach(() => {
  protect.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("protectChat", () => {
  const input = { publicKey: "pk_x", message: "hello" };
  test("allow", async () => {
    protect.mockResolvedValue(decision({}));
    expect(await protectChat(req, input)).toBe("allow");
    expect(protect.mock.calls[0]?.[1]).toEqual({
      publicKey: "pk_x",
      detectPromptInjectionMessage: "hello",
    });
  });
  test("rate_limited", async () => {
    protect.mockResolvedValue(decision({ denied: true }));
    expect(await protectChat(req, input)).toBe("rate_limited");
  });
  test("injection", async () => {
    protect.mockResolvedValue(decision({ denied: true, injection: true }));
    expect(await protectChat(req, input)).toBe("injection");
  });
  test("allows and logs on an errored decision", async () => {
    protect.mockResolvedValue(decision({ errored: true }));
    expect(await protectChat(req, input)).toBe("allow");
    expect(console.error).toHaveBeenCalled();
  });
  test("allows and logs when protect throws", async () => {
    protect.mockRejectedValue(new Error("timeout"));
    expect(await protectChat(req, input)).toBe("allow");
    expect(console.error).toHaveBeenCalled();
  });
});

describe("protectConfig", () => {
  test("allow, rate_limited, fail open", async () => {
    protect.mockResolvedValueOnce(decision({}));
    expect(await protectConfig(req, { publicKey: "pk_x" })).toBe("allow");
    protect.mockResolvedValueOnce(decision({ denied: true }));
    expect(await protectConfig(req, { publicKey: "pk_x" })).toBe("rate_limited");
    protect.mockRejectedValueOnce(new Error("down"));
    expect(await protectConfig(req, { publicKey: "pk_x" })).toBe("allow");
  });
});
