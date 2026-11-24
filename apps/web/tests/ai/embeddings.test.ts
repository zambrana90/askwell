import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const create = vi.fn();
vi.mock("openai", () => ({
  default: class {
    embeddings = { create };
  },
}));

import { embedQuery, embedTexts } from "../../lib/ai/embeddings";

beforeEach(() => {
  create.mockReset();
  process.env.OPENAI_API_KEY = "test";
});

describe("embedTexts", () => {
  test("batches at 100 inputs and keeps order", async () => {
    create.mockImplementation(async ({ input }: { input: string[] }) => ({
      // return reversed, to prove order is restored from `index`
      data: input.map((t, index) => ({ index, embedding: [Number(t)] })).reverse(),
    }));
    const texts = Array.from({ length: 250 }, (_, i) => String(i));
    const out = await embedTexts(texts);
    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls.map((c) => c[0].input.length)).toEqual([100, 100, 50]);
    expect(create.mock.calls[0]?.[0].model).toBe("text-embedding-3-small");
    expect(out.map((v) => v[0])).toEqual(texts.map(Number));
  });

  test("embedQuery returns one vector", async () => {
    create.mockResolvedValue({ data: [{ index: 0, embedding: [1, 2, 3] }] });
    expect(await embedQuery("hi")).toEqual([1, 2, 3]);
  });
});
