import "server-only";
import { getOpenAI } from "./client";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
export const EMBEDDING_BATCH_SIZE = 100;

/** Embeds texts in batches of at most 100. The result order matches the input order. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const openai = getOpenAI();
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: batch });
    const sorted = [...res.data].sort((a, b) => a.index - b.index);
    if (sorted.length !== batch.length) {
      throw new Error("Embeddings response length does not match the request");
    }
    for (const item of sorted) out.push(item.embedding);
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  if (!vector) throw new Error("No embedding returned");
  return vector;
}
