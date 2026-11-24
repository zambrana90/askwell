import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ConversationSummary, ConversationThreadResponse } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
  usePathname: () => "/dashboard/projects/p1/conversations/c1",
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));
const loadOwnedProject = vi.fn();
vi.mock("../../components/projects/owned-project", () => ({ loadOwnedProject: (id: string) => loadOwnedProject(id) }));
const listConversations = vi.fn();
const getThread = vi.fn();
vi.mock("../../lib/conversations/conversations", () => ({
  NotFoundError: class NotFoundError extends Error {},
  listConversations: (id: string) => listConversations(id),
  getThread: (id: string) => getThread(id),
}));

import ConversationsPage from "../../app/dashboard/projects/[id]/conversations/page";
import ThreadPage from "../../app/dashboard/projects/[id]/conversations/[conversationId]/page";
import { ConversationList } from "../../components/conversations/conversation-list";
import { ConversationThread } from "../../components/conversations/conversation-thread";
import { messageTime, relativeTime, shortVisitorId } from "../../components/conversations/format";
import { ProjectSubnav } from "../../components/projects/project-subnav";
import { NotFoundError } from "../../lib/conversations/conversations";

const NOW = new Date("2026-11-24T12:00:00Z");
const PID = "5f0c2f0e-8a3a-4a53-9b0e-3a6f1d1a2b3c";
const CID = "6a0c2f0e-8a3a-4a53-9b0e-3a6f1d1a2b3d";
const summary = (o: Partial<ConversationSummary> = {}): ConversationSummary => ({
  id: CID,
  visitorId: "abcdef12-3456-4789-8abc-def012345678",
  preview: "What are your opening hours?",
  messageCount: 2,
  createdAt: "2026-11-24T11:55:00Z",
  ...o,
});
const thread = (o: Partial<ConversationThreadResponse> = {}): ConversationThreadResponse => ({
  conversation: { id: CID, visitorId: "abcdef12-3456-4789-8abc-def012345678", createdAt: "2026-11-24T11:55:00Z" },
  messages: [
    { id: "m1", role: "visitor", body: "Hello there", createdAt: "2026-11-24T11:55:00Z" },
    { id: "m2", role: "bot", body: "Hi! How can I help?", createdAt: "2026-11-24T11:55:02Z" },
  ],
  ...o,
});

beforeEach(() => {
  refresh.mockReset();
  authMock.mockReset().mockResolvedValue({ userId: "u1" });
  loadOwnedProject.mockReset().mockResolvedValue({ id: PID, name: "Docs" });
  listConversations.mockReset();
  getThread.mockReset();
});
afterEach(cleanup);

describe("format helpers", () => {
  test("relativeTime", () => {
    expect(relativeTime("2026-11-24T11:59:40Z", NOW)).toBe("just now");
    expect(relativeTime("2026-11-24T11:55:00Z", NOW)).toBe("5 min ago");
    expect(relativeTime("2026-11-24T09:00:00Z", NOW)).toBe("3 h ago");
    expect(relativeTime("2026-11-22T12:00:00Z", NOW)).toBe("2 d ago");
    expect(relativeTime("2026-10-01T12:00:00Z", NOW)).toBe("Oct 1, 2026");
    expect(relativeTime("2026-11-24T12:05:00Z", NOW)).toBe("just now"); // clock skew
    expect(relativeTime("nope", NOW)).toBe("");
  });
  test("shortVisitorId and messageTime", () => {
    expect(shortVisitorId("abcdef12-3456")).toBe("abcdef12");
    expect(messageTime("2026-11-24T11:55:00Z")).toBe("Nov 24, 11:55 AM UTC");
  });
});

describe("list", () => {
  test("rows show preview, count, relative time and a short visitor id, and link to the thread", () => {
    render(
      <ConversationList
        projectId={PID}
        now={NOW}
        conversations={[summary(), summary({ id: "c2", preview: "Second", messageCount: 1, createdAt: "2026-11-23T12:00:00Z" })]}
      />,
    );
    const first = screen.getByRole("link", { name: /What are your opening hours\?/ });
    expect(first.getAttribute("href")).toBe(`/dashboard/projects/${PID}/conversations/${CID}`);
    expect(first.textContent).toContain("2 messages");
    expect(first.textContent).toContain("5 min ago");
    expect(first.textContent).toContain("Visitor abcdef12");
    expect(screen.getByRole("link", { name: /Second/ }).textContent).toContain("1 message ·");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  test("empty state", () => {
    render(<ConversationList projectId={PID} now={NOW} conversations={[]} />);
    expect(screen.getByText("No conversations yet. Install the widget and send a message.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  test("HTML in a preview shows as literal text", () => {
    const evil = "<img src=x onerror=alert(1)>";
    const { container } = render(<ConversationList projectId={PID} now={NOW} conversations={[summary({ preview: evil })]} />);
    expect(screen.getByText(evil)).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  test("Refresh calls router.refresh", () => {
    render(<ConversationList projectId={PID} now={NOW} conversations={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("thread", () => {
  test("messages are in the given (oldest first) order with the right roles and times", () => {
    render(<ConversationThread projectId={PID} thread={thread()} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain("Hello there");
    expect(items[0]?.querySelector("[data-role]")?.getAttribute("data-role")).toBe("visitor");
    expect(items[0]?.textContent).toContain("Visitor · Nov 24, 11:55 AM UTC");
    expect(items[1]?.querySelector("[data-role]")?.getAttribute("data-role")).toBe("bot");
    expect(items[1]?.textContent).toContain("Bot ·");
    expect(screen.getByRole("link", { name: "← Conversations" }).getAttribute("href")).toBe(
      `/dashboard/projects/${PID}/conversations`,
    );
  });

  test("HTML in a message body shows as literal text", () => {
    const evil = "<img src=x onerror=alert(1)><b>bold</b>";
    const { container } = render(
      <ConversationThread
        projectId={PID}
        thread={thread({ messages: [{ id: "m1", role: "bot", body: evil, createdAt: "2026-11-24T11:55:00Z" }] })}
      />,
    );
    expect(screen.getByText(evil)).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });

  test("Refresh calls router.refresh", () => {
    render(<ConversationThread projectId={PID} thread={thread()} />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("pages", () => {
  const listParams = { params: Promise.resolve({ id: PID }) };
  const threadParams = { params: Promise.resolve({ id: PID, conversationId: CID }) };

  test("list page: renders the rows read through the helper", async () => {
    listConversations.mockResolvedValue({ conversations: [summary()] });
    render(await ConversationsPage(listParams));
    expect(listConversations).toHaveBeenCalledWith(PID);
    expect(screen.getByText("What are your opening hours?")).toBeTruthy();
  });

  test("list page: signed out redirects; unknown project is not found; an error shows the error state", async () => {
    authMock.mockResolvedValueOnce({ userId: null });
    await expect(ConversationsPage(listParams)).rejects.toThrow("REDIRECT:/sign-in");
    loadOwnedProject.mockResolvedValueOnce(null);
    await expect(ConversationsPage(listParams)).rejects.toThrow("NEXT_NOT_FOUND");
    listConversations.mockRejectedValue(new Error("boom"));
    render(await ConversationsPage(listParams));
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't load your conversations/i);
  });

  test("thread page: renders the thread; foreign or malformed conversation is not found; error state", async () => {
    getThread.mockResolvedValue(thread());
    render(await ThreadPage(threadParams));
    expect(screen.getByText("Hello there")).toBeTruthy();
    cleanup();
    getThread.mockRejectedValueOnce(new NotFoundError());
    await expect(ThreadPage(threadParams)).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(ThreadPage({ params: Promise.resolve({ id: PID, conversationId: "nope" }) })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(getThread).toHaveBeenCalledTimes(2);
    getThread.mockRejectedValueOnce(new Error("boom"));
    render(await ThreadPage(threadParams));
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't load this conversation/i);
  });
});

describe("subnav", () => {
  test("has a Conversations tab that is current on the thread page too", () => {
    render(<ProjectSubnav projectId="p1" />);
    expect(screen.getByRole("link", { name: "Conversations" }).getAttribute("href")).toBe(
      "/dashboard/projects/p1/conversations",
    );
    expect(screen.getByRole("link", { name: "Conversations" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBeNull();
  });
});
