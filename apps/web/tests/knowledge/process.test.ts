import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const state = {
  sources: [] as Row[],
  chunks: [] as Row[],
  files: new Map<string, Uint8Array>(),
  failInsert: false,
};
const embedTexts = vi.fn();

vi.mock("../../lib/ai", () => ({ embedTexts: (t: string[]) => embedTexts(t) }));
vi.mock("../../lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (table: "knowledge_sources" | "knowledge_chunks") => {
      const rows = table === "knowledge_sources" ? state.sources : state.chunks;
      return {
        select: () => ({
          eq: (col: string, val: unknown) => ({
            maybeSingle: async () => ({ data: rows.find((r) => r[col] === val) ?? null, error: null }),
          }),
        }),
        delete: () => ({
          eq: async (col: string, val: unknown) => {
            const keep = rows.filter((r) => r[col] !== val);
            rows.length = 0;
            rows.push(...keep);
            return { error: null };
          },
        }),
        insert: async (batch: Row[]) => {
          if (state.failInsert) return { error: new Error("insert failed") };
          rows.push(...batch);
          return { error: null };
        },
        update: (patch: Row) => ({
          eq: async (col: string, val: unknown) => {
            for (const r of rows) if (r[col] === val) Object.assign(r, patch);
            return { error: null };
          },
        }),
      };
    },
    storage: {
      from: () => ({
        download: async (key: string) => {
          const bytes = state.files.get(key);
          return bytes
            ? { data: new Blob([bytes as BlobPart]), error: null }
            : { data: null, error: new Error("Object not found") };
        },
      }),
    },
  }),
}));

import { INSERT_BATCH_SIZE, processSource } from "../../lib/knowledge/process";
import { makePdf } from "./pdf-fixture";

const PROJECT = "p1";
const vector = (n: number) => Array.from({ length: 1536 }, (_, i) => (i === 0 ? n : 0));

beforeEach(() => {
  state.sources = [];
  state.chunks = [];
  state.files = new Map();
  state.failInsert = false;
  embedTexts.mockReset();
  embedTexts.mockImplementation(async (texts: string[]) => texts.map((_, i) => vector(i)));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const addSource = (over: Row = {}) => {
  const row = { id: "s1", project_id: PROJECT, type: "text", storage_key: null, status: "processing", ...over };
  state.sources.push(row);
  return row;
};
const status = () => state.sources[0]!.status;

describe("processSource", () => {
  test("pasted text → chunks stored with project and source → ready", async () => {
    addSource();
    const res = await processSource({ sourceId: "s1", text: "Our shop opens at nine. ".repeat(200) });
    expect(res.status).toBe("ready");
    expect(status()).toBe("ready");
    expect(state.chunks.length).toBeGreaterThan(1);
    expect(res).toEqual({ status: "ready", chunks: state.chunks.length });
    for (const c of state.chunks) {
      expect(c).toMatchObject({ project_id: PROJECT, source_id: "s1" });
      expect(c.content).toEqual(expect.any(String));
      expect(String(c.embedding)).toMatch(/^\[.*\]$/);
      expect(String(c.embedding).split(",")).toHaveLength(1536);
    }
  });

  test("file source is downloaded by storage_key and extracted", async () => {
    addSource({ type: "pdf", storage_key: "p1/s1.pdf" });
    state.files.set("p1/s1.pdf", makePdf("Refunds within thirty days"));
    const res = await processSource({ sourceId: "s1" });
    expect(res.status).toBe("ready");
    expect(state.chunks).toHaveLength(1);
    expect(state.chunks[0]!.content).toContain("Refunds within thirty days");
  });

  test("inserts in batches", async () => {
    addSource();
    const text = Array.from({ length: INSERT_BATCH_SIZE * 3 }, (_, i) => `Paragraph ${i}. ${"word ".repeat(250)}`).join("\n\n");
    const res = await processSource({ sourceId: "s1", text });
    expect(res.status).toBe("ready");
    expect(state.chunks.length).toBeGreaterThan(INSERT_BATCH_SIZE);
  });

  test("re-running replaces the chunks, never duplicates", async () => {
    addSource();
    const text = "Our shop opens at nine. ".repeat(200);
    await processSource({ sourceId: "s1", text });
    const first = state.chunks.length;
    await processSource({ sourceId: "s1", text });
    expect(state.chunks).toHaveLength(first);
    expect(status()).toBe("ready");
  });

  test("a re-run that fails leaves no chunks of the old run", async () => {
    addSource();
    await processSource({ sourceId: "s1", text: "Some text. ".repeat(100) });
    expect(state.chunks.length).toBeGreaterThan(0);
    state.failInsert = true;
    expect((await processSource({ sourceId: "s1", text: "Other text. ".repeat(100) })).status).toBe("failed");
    expect(state.chunks).toHaveLength(0);
    expect(status()).toBe("failed");
  });

  test("other sources' chunks are untouched", async () => {
    addSource();
    state.chunks.push({ project_id: PROJECT, source_id: "other", content: "keep", embedding: "[0]" });
    await processSource({ sourceId: "s1", text: "Hello there. ".repeat(50) });
    expect(state.chunks.filter((c) => c.source_id === "other")).toHaveLength(1);
  });

  test.each([
    ["empty text", () => ({ sourceId: "s1", text: "  \n " })],
    ["no text for a source without a file", () => ({ sourceId: "s1" })],
  ])("%s → failed, no chunks, no throw", async (_name, input) => {
    addSource();
    await expect(processSource(input())).resolves.toEqual({ status: "failed" });
    expect(status()).toBe("failed");
    expect(state.chunks).toHaveLength(0);
    expect(embedTexts).not.toHaveBeenCalled();
  });

  test("OpenAI error → failed, no chunks, no throw", async () => {
    addSource();
    embedTexts.mockRejectedValue(new Error("429 rate limited"));
    await expect(processSource({ sourceId: "s1", text: "Some text here." })).resolves.toEqual({ status: "failed" });
    expect(status()).toBe("failed");
    expect(state.chunks).toHaveLength(0);
  });

  test("corrupt PDF → failed", async () => {
    addSource({ type: "pdf", storage_key: "p1/s1.pdf" });
    state.files.set("p1/s1.pdf", new TextEncoder().encode("not a pdf"));
    await expect(processSource({ sourceId: "s1" })).resolves.toEqual({ status: "failed" });
    expect(status()).toBe("failed");
  });

  test("missing file in Storage → failed", async () => {
    addSource({ type: "pdf", storage_key: "p1/missing.pdf" });
    await expect(processSource({ sourceId: "s1" })).resolves.toEqual({ status: "failed" });
    expect(status()).toBe("failed");
  });

  test("insert error → failed, partial chunks removed", async () => {
    addSource();
    state.failInsert = true;
    await expect(processSource({ sourceId: "s1", text: "Some text here." })).resolves.toEqual({ status: "failed" });
    expect(state.chunks).toHaveLength(0);
  });

  test("unknown source never throws", async () => {
    await expect(processSource({ sourceId: "nope", text: "x" })).resolves.toEqual({ status: "failed" });
  });

  test("the logged error never contains the document text", async () => {
    addSource();
    embedTexts.mockRejectedValue(new Error("boom"));
    await processSource({ sourceId: "s1", text: "SECRET-DOCUMENT-TEXT" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("SECRET-DOCUMENT-TEXT");
  });
});
