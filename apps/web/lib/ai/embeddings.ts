import "server-only";
import { getOpenAI } from "./client";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;
export const EMBEDDING_BATCH_SIZE = 100;

/** OpenAI rejects a request over 300,000 tokens in total; stay well under it. */
export const EMBEDDING_BATCH_TOKEN_BUDGET = 250_000;

/** Conservative token estimate (about 3 characters per token, rounded up). */
const estimateTokens = (text: string) => Math.ceil(text.length / 3);

/** Splits into consecutive batches of at most 100 inputs and ~250k estimated tokens. */
export function batchTexts(texts: string[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let tokens = 0;
  for (const text of texts) {
    const t = estimateTokens(text);
    if (current.length > 0 && (current.length >= EMBEDDING_BATCH_SIZE || tokens + t > EMBEDDING_BATCH_TOKEN_BUDGET)) {
      batches.push(current);
      current = [];
      tokens = 0;
    }
    current.push(text);
    tokens += t;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** Embeds texts in batches (≤100 inputs, ≤~250k tokens each). The result order matches the input order. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const openai = getOpenAI();
  const out: number[][] = [];
  for (const batch of batchTexts(texts)) {
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
