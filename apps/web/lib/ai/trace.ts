import "server-only";

/** What one OpenAI call cost. Numbers and the model name only: never prompt, chunk or reply text. */
export type AiCall = {
  kind: "generation" | "embedding";
  model: string;
  latencySeconds: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  isError: boolean;
  httpStatus?: number;
};

export type OnAiCall = (call: AiCall) => void;

/**
 * Runs one OpenAI call and reports its model, tokens and latency to `onCall`. The result or the
 * error passes through unchanged, and a failure while reporting is ignored.
 */
export async function tracedCall<T>(
  meta: { kind: AiCall["kind"]; model: string; onCall?: OnAiCall },
  run: () => Promise<T>,
  usage: (result: T) => Partial<Pick<AiCall, "model" | "inputTokens" | "outputTokens" | "cachedInputTokens">>,
): Promise<T> {
  const start = performance.now();
  const report = (extra: () => Partial<AiCall> & Pick<AiCall, "isError">) => {
    if (!meta.onCall) return;
    try {
      const latencySeconds = (performance.now() - start) / 1000;
      meta.onCall({ kind: meta.kind, model: meta.model, latencySeconds, ...extra() });
    } catch (err) {
      console.error("AI trace failed:", err instanceof Error ? err.message : err);
    }
  };
  let result: T;
  try {
    result = await run();
  } catch (err) {
    // The status only: an OpenAI error message can quote the input.
    const status = (err as { status?: unknown } | null)?.status;
    report(() => ({ isError: true, httpStatus: typeof status === "number" ? status : undefined }));
    throw err;
  }
  report(() => ({ ...usage(result), isError: false }));
  return result;
}
