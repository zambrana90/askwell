import { describe, expect, test } from "vitest";
import { CHUNK_OVERLAP, CHUNK_SIZE, chunkText, normalizeText } from "../../lib/knowledge/chunk";

const sentence = "The quick brown fox jumps over the lazy dog. ";

describe("normalizeText", () => {
  test("normalises newlines and whitespace, keeps paragraph breaks", () => {
    expect(normalizeText("  a \t b\r\n\r\n\r\n\r\nc  \n d ")).toBe("a b\n\nc\nd");
  });
});

describe("chunkText", () => {
  test("empty or whitespace-only input gives no chunks", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText(" \n\t \n\n ")).toEqual([]);
  });

  test("short text is a single chunk", () => {
    expect(chunkText("Hello   world.")).toEqual(["Hello world."]);
  });

  test("no chunk is empty or longer than the size, and all text is covered", () => {
    const text = sentence.repeat(300);
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeGreaterThan(0);
      expect(c.length).toBeLessThanOrEqual(CHUNK_SIZE);
      expect(c).toBe(c.trim());
    }
    expect(chunks[0]!.length).toBeGreaterThan(CHUNK_SIZE / 2);
    const normalized = normalizeText(text);
    expect(normalized.startsWith(chunks[0]!)).toBe(true);
    expect(normalized.endsWith(chunks.at(-1)!)).toBe(true);
  });

  test("consecutive chunks overlap by about the overlap size", () => {
    const text = Array.from({ length: 400 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const chunks = chunkText(text);
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1]!;
      const head = chunks[i]!.slice(0, 40);
      const at = prev.lastIndexOf(head);
      expect(at).toBeGreaterThan(-1);
      const overlap = prev.length - at;
      expect(overlap).toBeGreaterThan(CHUNK_OVERLAP / 2);
      expect(overlap).toBeLessThanOrEqual(CHUNK_OVERLAP + 60);
    }
  });

  test("prefers paragraph boundaries", () => {
    const para = (n: number) => `Paragraph ${n}. ` + "word ".repeat(120).trim() + ".";
    const chunks = chunkText([para(1), para(2), para(3), para(4)].join("\n\n"));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.endsWith(".")).toBe(true);
    expect(chunks[0]!).toContain("Paragraph 1.");
    expect(chunks[0]!.split("\n\n").every((p) => p.startsWith("Paragraph"))).toBe(true);
  });

  test("prefers sentence boundaries over mid-sentence cuts", () => {
    const chunks = chunkText(sentence.repeat(200));
    for (const c of chunks.slice(0, -1)) expect(c.endsWith("dog.")).toBe(true);
  });

  test("cuts on whitespace when there is no sentence end, never mid-word", () => {
    const chunks = chunkText("lorem ".repeat(1000));
    for (const c of chunks) expect(c.split(" ").every((w) => w === "lorem")).toBe(true);
  });

  test("keeps a word that fits in a chunk whole, even when its separator is before the window", () => {
    const word = "x".repeat(1000);
    const chunks = chunkText("short ".repeat(100) + word);
    expect(chunks.some((c) => c.includes(word))).toBe(true);
  });

  test("a short prefix before a long word is not repeated as near-duplicate chunks", () => {
    const word = "x".repeat(1500);
    const chunks = chunkText("a ".repeat(100) + word);
    expect(chunks.length).toBeLessThanOrEqual(3);
    expect(chunks.some((c) => c.includes(word))).toBe(true);
    expect(chunks.filter((c) => c.startsWith("a a")).length).toBe(1);
  });

  test("a single huge word is cut hard and still terminates", () => {
    const chunks = chunkText("x".repeat(CHUNK_SIZE * 3 + 10));
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(CHUNK_SIZE);
  });
});
