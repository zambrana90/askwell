import Link from "next/link";
import type { ConversationSummary } from "@askwell/shared";
import { EmptyState } from "../ui/empty-state";
import { Panel } from "../ui/panel";
import { relativeTime, shortVisitorId } from "./format";
import { RefreshButton } from "./refresh-button";

type Props = { projectId: string; conversations: ConversationSummary[]; now: Date };

export function ConversationList({ projectId, conversations, now }: Props) {
  return (
    <section aria-labelledby="conversations-heading">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="conversations-heading" className="text-lg font-semibold">
          Conversations
        </h2>
        <RefreshButton />
      </div>
      {conversations.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          description="No conversations yet. Install the widget and send a message."
        />
      ) : (
        <Panel className="divide-y divide-glass-edge">
          <ul className="divide-y divide-glass-edge">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/dashboard/projects/${projectId}/conversations/${c.id}`}
                  className="flex flex-col gap-1 px-4 py-3 hover:bg-glass-edge"
                >
                  {/* Text only: React escapes the preview. */}
                  <span className="truncate text-sm font-medium">{c.preview || "(no message)"}</span>
                  <span className="text-xs text-ink-muted">
                    {c.messageCount} {c.messageCount === 1 ? "message" : "messages"} · {relativeTime(c.createdAt, now)} ·
                    Visitor {shortVisitorId(c.visitorId)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </section>
  );
}
