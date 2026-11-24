"use client";

import { useEffect } from "react";
import { postToHost } from "../../lib/embed/bridge";

/**
 * Keys pressed inside the iframe never reach the host page, so Escape asks the loader to close.
 * Listens on the iframe's document: with nothing focused, the key goes to `body`.
 */
export function useEscapeToClose(hostOrigin: string | null) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) postToHost({ type: "askwell:close" }, hostOrigin);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [hostOrigin]);
}
