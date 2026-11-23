import {
  EMBED_MESSAGE_TYPES,
  parseEmbedMessage,
  type PanelToLoaderMessage,
} from "@askwell/shared/embed";

/**
 * Post to the host page with its origin as targetOrigin, never "*".
 * No valid origin, or not framed: post nothing.
 */
export function postToHost(message: PanelToLoaderMessage, hostOrigin: string | null): void {
  if (!hostOrigin || window.parent === window) return;
  window.parent.postMessage(message, hostOrigin);
}

/**
 * Listen for `visibility` messages from the loader. Accepts only messages from
 * the parent window whose origin equals the host origin, and only valid shapes.
 * Returns the cleanup function.
 */
export function listenForVisibility(
  hostOrigin: string | null,
  onVisibility: (open: boolean) => void,
): () => void {
  if (!hostOrigin) return () => {};
  const handler = (event: MessageEvent) => {
    if (event.origin !== hostOrigin || event.source !== window.parent) return;
    const message = parseEmbedMessage(event.data);
    if (message?.type === EMBED_MESSAGE_TYPES.visibility) onVisibility(message.open);
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}
