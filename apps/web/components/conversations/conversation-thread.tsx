import Link from "next/link";
import type { ConversationThreadResponse } from "@askwell/shared";
import { Panel } from "../ui/panel";
import { messageTime, shortVisitorId } from "./format";
import { RefreshButton } from "./refresh-button";

type Props = { projectId: string; thread: ConversationThreadResponse };

export function ConversationThread({ projectId, thread }: Props) {
  const { conversation, messages } = thread;
  return (
    <section aria-labelledby="thread-heading">
      <Link
        href={`/dashboard/projects/${projectId}/conversations`}
        className="inline-flex min-h-10 items-center text-sm text-ink-muted hover:text-ink"
      >
        ← Conversations
      </Link>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="thread-heading" className="truncate text-lg font-semibold">
          Visitor {shortVisitorId(conversation.visitorId)}
        </h2>
        <RefreshButton />
      </div>
      <Panel className="p-4">
        <ol className="flex flex-col gap-4" aria-label="Messages">
          {messages.map((m) => {
            const visitor = m.role === "visitor";
            return (
              <li key={m.id} className={`flex flex-col gap-1 ${visitor ? "items-end" : "items-start"}`}>
                {/* Text only: message bodies are visitor- and model-written, never HTML. */}
                <p
                  data-role={m.role}
                  className={`max-w-[85%] whitespace-pre-wrap break-words rounded-glass px-3 py-2 text-sm ${
                    visitor ? "bg-accent text-accent-ink" : "border border-glass-edge bg-glass"
                  }`}
                >
                  {m.body}
                </p>
                <span className="text-xs text-ink-muted">
                  {visitor ? "Visitor" : "Bot"} · {messageTime(m.createdAt)}
                </span>
              </li>
            );
          })}
        </ol>
      </Panel>
    </section>
  );
}
