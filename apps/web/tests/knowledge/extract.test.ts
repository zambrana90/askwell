import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { extractText } from "../../lib/knowledge/extract";
import { makePdf } from "./pdf-fixture";

describe("extractText", () => {
  test("txt and md are decoded as UTF-8 and whitespace is normalised", async () => {
    const bytes = new TextEncoder().encode("Café  menu\r\n\r\n\r\n# Prices \t€5\n");
    expect(await extractText(bytes, "txt")).toBe("Café menu\n\n# Prices €5");
    expect(await extractText(bytes, "md")).toBe("Café menu\n\n# Prices €5");
  });

  test("reads the text of a small PDF", async () => {
    const text = await extractText(makePdf("Opening hours are nine to five"), "pdf");
    expect(text).toContain("Opening hours are nine to five");
  });

  test("does not consume the caller's buffer", async () => {
    const bytes = makePdf("Hello Askwell");
    await extractText(bytes, "pdf");
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  test("rejects bytes that are not a PDF", async () => {
    await expect(extractText(new TextEncoder().encode("not a pdf"), "pdf")).rejects.toThrow();
  });
});
