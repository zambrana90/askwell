"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { trackSnippetCopied } from "../../lib/analytics/client";
import { Button } from "../ui/button";
import { Panel } from "../ui/panel";

type CopyState = "idle" | "copied" | "manual";

export function InstallSnippet({ snippet }: { snippet: string }) {
  const projectId = useParams<{ id?: string }>()?.id; // /dashboard/projects/[id]/install
  const codeRef = useRef<HTMLElement>(null);
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  function selectText() {
    const node = codeRef.current;
    if (!node) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  async function copy() {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(snippet);
      setState("copied");
      if (projectId) void trackSnippetCopied(projectId);
      timer.current = setTimeout(() => setState("idle"), 2000);
    } catch {
      // Blocked or unavailable (permissions, insecure context): select it for the user.
      selectText();
      setState("manual");
    }
  }

  return (
    <Panel className="p-4">
      <pre className="whitespace-pre-wrap break-all rounded-glass border border-glass-edge bg-canvas p-3 text-sm">
        <code ref={codeRef} tabIndex={0} aria-label="Install snippet">
          {snippet}
        </code>
      </pre>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={copy}>{state === "copied" ? "Copied" : "Copy snippet"}</Button>
        <p role="status" className="text-sm text-ink-muted">
          {state === "copied" ? "Copied to your clipboard." : null}
          {state === "manual" ? "Couldn't reach the clipboard. The snippet is selected: press Ctrl+C (⌘C on Mac)." : null}
        </p>
      </div>
    </Panel>
  );
}
