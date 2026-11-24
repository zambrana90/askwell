/** `snippet_copied` (§6.11), from the browser. The identified owner is the distinct id. Never throws. */
export async function trackSnippetCopied(projectId: string): Promise<void> {
  try {
    const { default: posthog } = await import("posthog-js");
    // PosthogGate initialises it; without keys it never does, and there is nothing to send.
    if (posthog.__loaded) posthog.capture("snippet_copied", { projectId });
  } catch (err) {
    console.error("snippet_copied failed:", err instanceof Error ? err.message : err);
  }
}
