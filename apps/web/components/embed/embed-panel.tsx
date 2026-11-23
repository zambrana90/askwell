"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { APP_NAME, MAX_MESSAGE_LENGTH, type WidgetConfig } from "@askwell/shared";
import { listenForVisibility, postToHost } from "../../lib/embed/bridge";
import { chatErrorMessage, sendMessage } from "../../lib/embed/chat";
import { getVisitorId } from "../../lib/embed/visitor";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";

type Props = {
  publicKey: string;
  config: WidgetConfig;
  /** Validated host origin, or null (then nothing is posted to the parent). */
  hostOrigin: string | null;
};

type ChatMessage = { id: number; from: "visitor" | "bot"; text: string };

const MIN_HEIGHT = 320;
const MAX_HEIGHT = 640;

export function EmbedPanel({ publicKey, config, hostOrigin }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const conversationId = useRef<string | undefined>(undefined);
  const nextId = useRef(1);
  const openRef = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // The loader tells us when the panel is shown or hidden. Shown: reset the
  // unread count and focus the input.
  useEffect(
    () =>
      listenForVisibility(hostOrigin, (open) => {
        openRef.current = open;
        if (!open) return;
        setUnread(0);
        inputRef.current?.focus();
      }),
    [hostOrigin],
  );

  useEffect(() => {
    postToHost({ type: "askwell:unread", count: unread }, hostOrigin);
  }, [unread, hostOrigin]);

  // Tell the loader the height we want; it clamps.
  useEffect(() => {
    const root = rootRef.current;
    const list = listRef.current;
    const content = contentRef.current;
    if (!root || !list || !content) return;
    // Header + input + badge, plus the messages' own height (not the list's, which
    // fills the iframe and would only echo the current height back).
    const chrome = root.offsetHeight - list.clientHeight;
    const wanted = Math.round(chrome + content.offsetHeight);
    const height = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, wanted));
    postToHost({ type: "askwell:resize", height }, hostOrigin);
  }, [messages, typing, error, hostOrigin]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, typing, error]);

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text || typing) return;
    setDraft("");
    setError(null);
    setMessages((prev) => [...prev, { id: nextId.current++, from: "visitor", text }]);
    setTyping(true);
    try {
      const response = await sendMessage({
        key: publicKey,
        visitorId: getVisitorId(),
        conversationId: conversationId.current,
        message: text,
      });
      conversationId.current = response.conversationId;
      setMessages((prev) => [...prev, { id: nextId.current++, from: "bot", text: response.reply }]);
      if (!openRef.current) setUnread((count) => count + 1);
    } catch (caught) {
      setError(chatErrorMessage(caught));
    } finally {
      setTyping(false);
    }
  }, [draft, typing, publicKey]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <div ref={rootRef} className="theme-auto flex h-dvh flex-col bg-canvas text-ink">
      <header className="flex items-center justify-between gap-2 border-b border-glass-edge bg-glass px-4 py-3 backdrop-blur-glass">
        <h1 className="truncate text-base font-semibold">{config.headerText}</h1>
        <Button
          variant="ghost"
          aria-label="Close chat"
          className="size-10 shrink-0 px-0"
          onClick={() => postToHost({ type: "askwell:close" }, hostOrigin)}
        >
          <span aria-hidden="true">✕</span>
        </Button>
      </header>

      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        className="flex-1 overflow-y-auto"
      >
        <div ref={contentRef} className="flex flex-col gap-2 px-4 py-4">
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-muted">Ask a question to get started.</p>
        ) : null}
        {messages.map((message) => (
          <p
            key={message.id}
            data-from={message.from}
            // Plain text only: React escapes it; never HTML.
            className={`max-w-[85%] whitespace-pre-wrap break-words rounded-glass px-3 py-2 text-sm ${
              message.from === "visitor"
                ? "self-end bg-accent text-accent-ink"
                : "self-start border border-glass-edge bg-glass"
            }`}
          >
            {message.text}
          </p>
        ))}
        {typing ? (
          <p
            data-testid="typing"
            aria-label="Typing"
            className="flex items-center gap-2 self-start text-sm text-ink-muted"
          >
            <Spinner />
            Typing…
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-glass border border-glass-edge bg-glass px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}
        </div>
      </div>

      <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-glass-edge bg-glass px-3 py-3 backdrop-blur-glass">
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          maxLength={MAX_MESSAGE_LENGTH}
          rows={1}
          aria-label="Your message"
          placeholder="Type your message"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-glass border border-glass-edge bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-muted"
        />
        <Button type="submit" disabled={!draft.trim() || typing} className="shrink-0">
          Send
        </Button>
      </form>

      {config.showBadge ? (
        <p className="border-t border-glass-edge px-4 py-2 text-center text-xs text-ink-muted">
          Powered by {APP_NAME}
        </p>
      ) : null}
    </div>
  );
}
