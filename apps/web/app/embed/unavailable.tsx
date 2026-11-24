"use client";

import { useEscapeToClose } from "../../components/embed/use-escape-to-close";
import { Button } from "../../components/ui/button";
import { postToHost } from "../../lib/embed/bridge";
import { ChatError, chatErrorMessage } from "../../lib/embed/chat";

/**
 * Shown instead of the panel when this visitor loads /embed too often. Nothing about the project
 * is read, so it has no header text or colors. Close and Escape ask the loader to close, as in
 * the panel.
 */
export function Unavailable({ hostOrigin }: { hostOrigin: string | null }) {
  useEscapeToClose(hostOrigin);
  const close = () => postToHost({ type: "askwell:close" }, hostOrigin);
  return (
    <div className="theme-auto flex h-dvh flex-col bg-canvas text-ink">
      <div className="flex justify-end px-4 py-3">
        <Button variant="ghost" aria-label="Close chat" className="size-10 shrink-0 px-0" onClick={close}>
          <span aria-hidden="true">✕</span>
        </Button>
      </div>
      <p role="status" className="flex flex-1 items-center justify-center px-6 pb-14 text-center text-sm">
        {chatErrorMessage(new ChatError("payment_required"))}
      </p>
    </div>
  );
}
