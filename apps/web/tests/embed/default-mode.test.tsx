import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { expect, test } from "vitest";
import { EmbedPanel } from "../../components/embed/embed-panel";

// Captured before the inline mode was added: with no new props, /embed's markup must not change.
test("default mode renders the same markup as before", () => {
  const html = renderToStaticMarkup(
    <EmbedPanel publicKey="pk_abcdef123456" config={DEFAULT_WIDGET_CONFIG} hostOrigin="https://example.com" />,
  );
  expect(html).toMatchInlineSnapshot(`"<div class="theme-auto flex h-dvh flex-col bg-canvas text-ink"><header class="flex items-center justify-between gap-2 border-b border-glass-edge bg-glass px-4 py-3 backdrop-blur-glass"><h1 class="truncate text-base font-semibold">Ask us anything</h1><button type="button" class="inline-flex min-h-10 items-center justify-center gap-2 rounded-glass px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 text-ink hover:bg-glass-edge size-10 shrink-0 px-0" aria-label="Close chat"><span aria-hidden="true">✕</span></button></header><div role="log" aria-live="polite" aria-label="Conversation" tabindex="0" class="flex-1 overflow-y-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"><div class="flex flex-col gap-2 px-4 py-4"><p class="py-8 text-center text-sm text-ink-muted">Ask a question to get started.</p></div></div><form class="flex items-end gap-2 border-t border-glass-edge bg-glass px-3 py-3 backdrop-blur-glass"><textarea maxLength="1000" rows="1" aria-label="Your message" placeholder="Type your message" class="max-h-32 min-h-10 flex-1 resize-none rounded-glass border border-glass-edge bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-muted"></textarea><button type="submit" disabled="" class="inline-flex min-h-10 items-center justify-center gap-2 rounded-glass px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 bg-accent text-accent-ink hover:opacity-90 shrink-0">Send</button></form><p class="border-t border-glass-edge px-4 py-2 text-center text-xs text-ink-muted">Powered by Askwell</p></div>"`);
});
