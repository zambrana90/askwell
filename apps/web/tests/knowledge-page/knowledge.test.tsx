import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { KnowledgeSource } from "@askwell/shared";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/projects/p1/knowledge",
  useRouter: () => ({ refresh }),
}));
const uploadToSignedUrl = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl }) } }),
}));

import { KnowledgeView } from "../../components/knowledge/knowledge-view";
import { checkFile } from "../../components/knowledge/api";
import { knowledgeLimitMessage } from "../../components/knowledge/limit-message";
import { ProjectSubnav } from "../../components/projects/project-subnav";

const MSG = "Your Free plan includes 3 sources per project. Upgrade to Pro for up to 25.";
const src = (id: string, title: string, status: KnowledgeSource["status"], type: KnowledgeSource["type"] = "text"): KnowledgeSource => ({
  id,
  title,
  type,
  status,
  createdAt: "2026-11-02T10:00:00+00:00",
});

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });

function view(sources: KnowledgeSource[], max = 3, pollMs = 4000) {
  return render(
    <KnowledgeView projectId="p1" initialSources={sources} maxSources={max} limitMessage={MSG} pollMs={pollMs} />,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

test("lists each status; uploading shows as Processing; count uses the plan limit", () => {
  view([src("1", "A", "uploading", "pdf"), src("2", "B", "processing"), src("3", "C", "ready", "md")], 25);
  expect(screen.getAllByText("Processing")).toHaveLength(2);
  expect(screen.getByText("Ready")).toBeTruthy();
  expect(screen.getByTestId("source-count").textContent).toBe("3 of 25 sources");
  expect(screen.queryByText(MSG)).toBeNull();
});

test("shows the failed status", () => {
  view([src("1", "A", "failed")]);
  expect(screen.getByText("Failed")).toBeTruthy();
});

test("empty state", () => {
  view([]);
  expect(screen.getByText("No knowledge yet")).toBeTruthy();
});

test("titles render as text, not HTML", () => {
  view([src("1", "<img src=x onerror=alert(1)>", "ready")]);
  expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeTruthy();
  expect(document.querySelector("img")).toBeNull();
});

test("at the limit: add and upload are disabled and the message shows", () => {
  view([src("1", "A", "ready"), src("2", "B", "ready"), src("3", "C", "ready")]);
  expect((screen.getByRole("button", { name: "Add text" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText(/File \(PDF/) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText("Title") as HTMLInputElement).disabled).toBe(true);
  expect(screen.getByText(MSG)).toBeTruthy();
});

test("a plan_limit reply shows the limit message", async () => {
  view([]);
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
  fireEvent.change(screen.getByLabelText("Text"), { target: { value: "body" } });
  reply(403, { error: { code: "plan_limit", message: "nope" } });
  fireEvent.click(screen.getByRole("button", { name: "Add text" }));
  expect(await screen.findByText(MSG)).toBeTruthy();
});

test("after a plan_limit reply the form is blocked and refreshed; fresh data with room unblocks it", async () => {
  const { rerender } = view([src("1", "A", "ready")]);
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
  fireEvent.change(screen.getByLabelText("Text"), { target: { value: "body" } });
  reply(403, { error: { code: "plan_limit", message: "nope" } });
  fireEvent.click(screen.getByRole("button", { name: "Add text" }));
  expect(await screen.findByText(MSG)).toBeTruthy();
  expect(refresh).toHaveBeenCalled();
  // The local list (1 of 3) looked like it had room, but the API said full: everything is blocked.
  expect((screen.getByLabelText("Title") as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByLabelText("Text") as HTMLTextAreaElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Add text" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText(/File \(PDF/) as HTMLInputElement).disabled).toBe(true);
  // A refresh that still shows no room keeps it blocked.
  rerender(
    <KnowledgeView projectId="p1" initialSources={[src("1", "A", "ready"), src("2", "B", "ready"), src("3", "C", "ready")]} maxSources={3} limitMessage={MSG} pollMs={4000} />,
  );
  expect(screen.getByText(MSG)).toBeTruthy();
  // Fresh data with room clears the block.
  rerender(
    <KnowledgeView projectId="p1" initialSources={[src("1", "A", "ready")]} maxSources={3} limitMessage={MSG} pollMs={4000} />,
  );
  expect(screen.queryByText(MSG)).toBeNull();
  expect((screen.getByLabelText("Title") as HTMLInputElement).disabled).toBe(false);
});

test("paste text posts, lists the new source and clears the form", async () => {
  view([]);
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: " Hours " } });
  fireEvent.change(screen.getByLabelText("Text"), { target: { value: "Open 9 to 5" } });
  reply(200, { source: src("9", "Hours", "processing") });
  fireEvent.click(screen.getByRole("button", { name: "Add text" }));
  expect(await screen.findByText("Hours")).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/projects/p1/knowledge",
    expect.objectContaining({ method: "POST", body: JSON.stringify({ title: "Hours", text: "Open 9 to 5" }) }),
  );
  expect((screen.getByLabelText("Title") as HTMLInputElement).value).toBe("");
});

test("a validation error from the API is shown", async () => {
  view([]);
  fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
  fireEvent.change(screen.getByLabelText("Text"), { target: { value: "x" } });
  reply(400, { error: { code: "validation_error", message: "Text is too long." } });
  fireEvent.click(screen.getByRole("button", { name: "Add text" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Text is too long.");
});

function pick(file: File) {
  fireEvent.change(screen.getByLabelText(/File \(PDF/), { target: { files: [file] } });
}

test("rejects a .docx in the browser, without calling the API", async () => {
  view([]);
  pick(new File(["x"], "notes.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/Only PDF, Markdown/);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("rejects an 11 MB file in the browser, without calling the API", async () => {
  view([]);
  const big = new File(["x"], "big.pdf", { type: "application/pdf" });
  Object.defineProperty(big, "size", { value: 11 * 1024 * 1024 });
  pick(big);
  expect((await screen.findByRole("alert")).textContent).toMatch(/too large/);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("checkFile accepts pdf, md and txt up to 10 MB", () => {
  expect(checkFile({ name: "a.PDF", size: 10 * 1024 * 1024 })).toBeNull();
  expect(checkFile({ name: "a.md", size: 5 })).toBeNull();
  expect(checkFile({ name: "a.txt", size: 5 })).toBeNull();
  expect(checkFile({ name: "a", size: 5 })).not.toBeNull();
  expect(checkFile({ name: "a.txt", size: 10 * 1024 * 1024 + 1 })).not.toBeNull();
});

test("upload: upload-url, then Storage with path + token, then finalize", async () => {
  view([]);
  uploadToSignedUrl.mockResolvedValueOnce({ data: {}, error: null });
  reply(200, { sourceId: "s1", path: "p1/s1.pdf", token: "tok" });
  reply(200, { source: src("s1", "guide.pdf", "ready", "pdf") });
  const file = new File(["%PDF"], "guide.pdf", { type: "application/pdf" });
  pick(file);
  expect(await screen.findByText("guide.pdf")).toBeTruthy();
  expect(fetchMock.mock.calls[0]![0]).toBe("/api/projects/p1/knowledge/upload-url");
  expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({
    fileName: "guide.pdf",
    size: 4,
    mime: "application/pdf",
  });
  expect(uploadToSignedUrl).toHaveBeenCalledWith("p1/s1.pdf", "tok", file, { contentType: "application/pdf" });
  expect(fetchMock.mock.calls[1]![0]).toBe("/api/projects/p1/knowledge/finalize");
  expect(JSON.parse(fetchMock.mock.calls[1]![1].body)).toEqual({ sourceId: "s1" });
});

test("a failed Storage upload shows an error and does not finalize", async () => {
  view([]);
  uploadToSignedUrl.mockResolvedValueOnce({ data: null, error: new Error("boom") });
  reply(200, { sourceId: "s1", path: "p1/s1.pdf", token: "tok" });
  pick(new File(["%PDF"], "guide.pdf", { type: "application/pdf" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/upload failed/i);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("delete asks first, then removes the source", async () => {
  view([src("1", "Hours", "ready")]);
  fireEvent.click(screen.getByRole("button", { name: "Delete Hours" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  reply(200, { ok: true });
  fireEvent.click(screen.getByRole("button", { name: "Delete source" }));
  await waitFor(() => expect(screen.queryByText("Hours")).toBeNull());
  expect(fetchMock).toHaveBeenCalledWith("/api/knowledge/1", expect.objectContaining({ method: "DELETE" }));
});

test("polls while a source is processing and stops when none is", () => {
  vi.useFakeTimers();
  const { rerender } = view([src("1", "A", "processing")], 3, 1000);
  act(() => {
    vi.advanceTimersByTime(3100);
  });
  expect(refresh).toHaveBeenCalledTimes(3);
  rerender(
    <KnowledgeView projectId="p1" initialSources={[src("1", "A", "ready")]} maxSources={3} limitMessage={MSG} pollMs={1000} />,
  );
  expect(screen.getByText("Ready")).toBeTruthy();
  refresh.mockClear();
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(refresh).not.toHaveBeenCalled();
});

test("does not poll when nothing is processing", () => {
  vi.useFakeTimers();
  view([src("1", "A", "ready")], 3, 1000);
  act(() => {
    vi.advanceTimersByTime(5000);
  });
  expect(refresh).not.toHaveBeenCalled();
});

test("limit message for each plan", () => {
  expect(knowledgeLimitMessage("free")).toBe(MSG);
  expect(knowledgeLimitMessage("pro")).toBe("Your Pro plan includes 25 sources per project.");
});

test("subnav has Knowledge after Overview, before Conversations", () => {
  render(<ProjectSubnav projectId="p1" />);
  const links = screen.getAllByRole("link").map((a) => a.textContent);
  expect(links).toEqual(["Overview", "Knowledge", "Conversations", "Customize", "Install"]);
  expect(screen.getByRole("link", { name: "Knowledge" }).getAttribute("aria-current")).toBe("page");
});

test("sources past the plan limit show Not used for answers with a note and an upgrade link (Free)", () => {
  const at = (n: number): KnowledgeSource => ({ ...src(`s${n}`, `Source ${n}`, "ready"), createdAt: `2026-11-0${n}T10:00:00+00:00` });
  render(
    <KnowledgeView projectId="p1" initialSources={[at(4), at(3), at(2), at(1)]} maxSources={3} limitMessage={MSG} planName="Free" />,
  );
  expect(screen.getAllByText("Not used for answers")).toHaveLength(1);
  const row = screen.getByText("Source 4").closest("li")!;
  expect(row.textContent).toContain("Not used for answers");
  expect(row.textContent).toContain("Your Free plan uses 3 sources per project for answers. Upgrade or delete sources to use this one again.");
  expect(row.querySelector('a[href="/dashboard/billing"]')).toBeTruthy();
  expect(screen.getByText("Source 1").closest("li")!.textContent).not.toContain("Not used for answers");
});

test("nothing is paused within the source limit", () => {
  view([src("1", "A", "ready"), src("2", "B", "ready")], 3);
  expect(screen.queryByText("Not used for answers")).toBeNull();
  expect(screen.queryByTestId("paused-note")).toBeNull();
});
