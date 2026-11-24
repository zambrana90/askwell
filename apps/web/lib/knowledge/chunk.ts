/** Target size of one chunk, in characters. */
export const CHUNK_SIZE = 1500;
/** How much of the previous chunk the next one repeats, in characters. */
export const CHUNK_OVERLAP = 200;
/** A chunk is never cut earlier than this share of CHUNK_SIZE just to land on a boundary. */
const MIN_CHUNK_SHARE = 0.5;

/** Unix newlines, no trailing spaces, single spaces, at most one blank line between paragraphs. */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** End index (exclusive) for a chunk starting at `start`: paragraph, then sentence, then word boundary. */
function findEnd(text: string, start: number): number {
  const hardEnd = start + CHUNK_SIZE;
  if (hardEnd >= text.length) return text.length;
  const floor = start + Math.floor(CHUNK_SIZE * MIN_CHUNK_SHARE);
  const window = text.slice(floor, hardEnd + 1);

  const paragraph = window.lastIndexOf("\n\n");
  if (paragraph >= 0) return floor + paragraph + 2;

  let sentence = -1;
  for (const m of window.matchAll(/[.!?]["')\]]?(\s)/g)) sentence = m.index + m[0].length;
  if (sentence > 0) return floor + sentence;

  const space = window.search(/\s\S*$/);
  if (space > 0) return floor + space + 1;

  return hardEnd;
}

/**
 * Splits text into chunks of about CHUNK_SIZE characters that overlap by about CHUNK_OVERLAP,
 * cutting on paragraph, sentence or word boundaries where possible. Never returns an empty chunk.
 */
export function chunkText(input: string): string[] {
  const text = normalizeText(input);
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = findEnd(text, start);
    const chunk = text.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= text.length) break;

    // Step back for the overlap, then forward to a word start so no chunk begins mid-word.
    let next = Math.max(end - CHUNK_OVERLAP, start + 1);
    if (!/\s/.test(text[next - 1] ?? "")) {
      const ws = text.slice(next, end).search(/\s/);
      if (ws >= 0) next += ws + 1;
    }
    start = next;
  }
  return chunks;
}
