import "server-only";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";
import type { KnowledgeSourceType } from "@askwell/shared";
import { normalizeText } from "./chunk";

/** Plain text of a file. PDF via unpdf, everything else decoded as UTF-8. Whitespace is normalised. */
export async function extractText(bytes: Uint8Array, type: KnowledgeSourceType): Promise<string> {
  if (type === "pdf") {
    // unpdf takes ownership of the buffer, so hand it a copy.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractPdfText(pdf, { mergePages: true });
    return normalizeText(text);
  }
  return normalizeText(new TextDecoder("utf-8").decode(bytes));
}
