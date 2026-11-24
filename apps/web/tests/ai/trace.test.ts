import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { tracedCall } from "../../lib/ai/trace";

const meta = { kind: "generation" as const, model: "gpt-5-mini" };

describe("tracedCall", () => {
  test("reports model, tokens and latency, and returns the result unchanged", async () => {
    const onCall = vi.fn();
    const result = { text: "reply" };
    await expect(tracedCall({ ...meta, onCall }, async () => result, () => ({ inputTokens: 5 }))).resolves.toBe(result);
    expect(onCall).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-5-mini", inputTokens: 5, isError: false, latencySeconds: expect.any(Number) }),
    );
  });

  test("reports an error by status only and rethrows it", async () => {
    const onCall = vi.fn();
    const err = Object.assign(new Error("bad input: SECRET"), { status: 400 });
    await expect(tracedCall({ ...meta, onCall }, async () => Promise.reject(err), () => ({}))).rejects.toBe(err);
    expect(onCall).toHaveBeenCalledWith(expect.objectContaining({ isError: true, httpStatus: 400 }));
    expect(JSON.stringify(onCall.mock.calls)).not.toContain("SECRET");
  });

  test("a failing reporter or usage reader never affects the call", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const boom = () => {
      throw new Error("boom");
    };
    await expect(tracedCall({ ...meta, onCall: boom }, async () => 1, () => ({}))).resolves.toBe(1);
    await expect(tracedCall({ ...meta, onCall: vi.fn() }, async () => 2, boom)).resolves.toBe(2);
  });
});
