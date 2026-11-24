import "server-only";
import { extractText as extractPdfText } from "unpdf";
import type { KnowledgeSourceType } from "@askwell/shared";
import { normalizeText } from "./chunk";

/** Plain text of a file. PDF via unpdf, everything else decoded as UTF-8. Whitespace is normalised. */
export async function extractText(bytes: Uint8Array, type: KnowledgeSourceType): Promise<string> {
  if (type === "pdf") {
    // unpdf takes ownership of the buffer, so hand it a copy. Given bytes (not a proxy), it
    // creates the document itself and releases it when done, even on failure.
    const { text } = await extractPdfText(new Uint8Array(bytes), { mergePages: true });
    return normalizeText(text);
  }
  return normalizeText(new TextDecoder("utf-8").decode(bytes));
}
