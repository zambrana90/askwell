"use client";

// Client component for the copy button.
import { useEffect, useState } from "react";
import { PUBLIC_KEY_PREFIX } from "@askwell/shared";
import { Panel } from "../ui/panel";
import { Section } from "./section";

const SNIPPET = `<script src="https://your-app.example/widget.js" data-key="${PUBLIC_KEY_PREFIX}…" async></script>`;
/** How long the button says what happened. */
const RESET_MS = 2500;

type CopyState = "idle" | "copied" | "failed";

export function Install() {
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state !== "copied") return;
    const timer = setTimeout(() => setState("idle"), RESET_MS);
    return () => clearTimeout(timer);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(SNIPPET);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <Section id="install" title="Install" intro="Paste this before the closing body tag. Your own key is in the dashboard. This one is an example.">
      <Panel className="landing-card landing-terminal overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-glass-edge py-2 pl-4 pr-2">
          <div aria-hidden="true" className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-glass-edge" />
            <span className="size-2.5 rounded-full bg-glass-edge" />
            <span className="size-2.5 rounded-full bg-glass-edge" />
          </div>
          <span className="mr-auto font-mono text-xs text-ink-muted">index.html</span>
          <button
            type="button"
            onClick={copy}
            className="inline-flex min-h-10 min-w-20 items-center justify-center rounded-xl border border-glass-edge bg-glass px-3 text-sm font-medium transition hover:bg-glass-edge"
          >
            {state === "copied" ? "Copied" : "Copy"}
          </button>
        </div>
        {/* Focusable, so keyboard users can scroll the long line. */}
        <pre tabIndex={0} role="region" aria-label="Example script tag" className="overflow-x-auto p-4 text-sm md:p-6">
          <code>{SNIPPET}</code>
        </pre>
      </Panel>
      <p role="status" className={state === "failed" ? "mt-3 text-sm text-ink-muted" : "sr-only"}>
        {state === "copied" ? "Copied to your clipboard." : null}
        {state === "failed" ? "Couldn't reach the clipboard. Select the text and copy it." : null}
      </p>
    </Section>
  );
}
