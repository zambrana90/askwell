import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Project } from "@askwell/shared";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/projects/p1",
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
const loadOwnedProject = vi.fn();
vi.mock("../../components/projects/owned-project", () => ({
  loadOwnedProject: (id: string) => loadOwnedProject(id),
}));

import { limitMessage } from "../../components/projects/limit-message";
import { ProjectsView } from "../../components/projects/projects-view";
import { ProjectSubnav } from "../../components/projects/project-subnav";
import ProjectLayout from "../../app/dashboard/projects/[id]/layout";
import ProjectPage from "../../app/dashboard/projects/[id]/page";
import NotFound from "../../app/dashboard/projects/[id]/not-found";
import Loading from "../../app/dashboard/projects/[id]/loading";

const FREE_MSG = "Your Free plan includes 1 project. Upgrade to Pro for up to 5.";
const p = (id: string, name: string): Project => ({
  id,
  name,
  publicKey: `pk_${id}`,
  messagesUsed: 7,
  periodStart: "2026-11-01T00:00:00+00:00",
  createdAt: "2026-11-02T10:00:00+00:00",
});

const fetchMock = vi.fn();
const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });

function view(projects: Project[], maxProjects = 5) {
  return render(
    <ProjectsView
      initialProjects={projects}
      maxProjects={maxProjects}
      messagesPerMonth={2000}
      limitMessage={FREE_MSG}
    />,
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  loadOwnedProject.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

test("limitMessage: the Free text from the task, and a Pro text", () => {
  expect(limitMessage("free")).toBe(FREE_MSG);
  expect(limitMessage("pro")).toBe("Your Pro plan includes 5 projects.");
});

test("list renders name, link, date and usage; empty state when none", () => {
  const { unmount } = view([p("p1", "Docs bot")]);
  expect(screen.getByRole("link", { name: "Docs bot" }).getAttribute("href")).toBe("/dashboard/projects/p1");
  expect(screen.getByText(/Created Nov 2, 2026 · 7 of 2000 messages this month/)).toBeTruthy();
  unmount();
  view([]);
  expect(screen.getByText("No projects yet")).toBeTruthy();
});

test("create posts the name, adds the project and clears the field", async () => {
  reply(201, { project: p("p2", "New one") });
  view([p("p1", "Old")]);
  fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "  New one " } });
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  await screen.findByRole("link", { name: "New one" });
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/projects",
    expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "New one" }) }),
  );
  expect((screen.getByLabelText("Project name") as HTMLInputElement).value).toBe("");
  const links = screen.getAllByRole("link").map((l) => l.textContent);
  expect(links.indexOf("New one")).toBeLessThan(links.indexOf("Old"));
});

test("at the plan limit: create is disabled and the message shows up front", () => {
  view([p("p1", "Only")], 1);
  expect((screen.getByRole("button", { name: "Create project" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByLabelText("Project name") as HTMLInputElement).disabled).toBe(true);
  expect(screen.getByText(FREE_MSG)).toBeTruthy();
});

test("a 403 plan_limit from the server shows the message", async () => {
  reply(403, { error: { code: "plan_limit", message: "x" } });
  view([], 1);
  expect(screen.queryByText(FREE_MSG)).toBeNull();
  fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Second" } });
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  expect(await screen.findByText(FREE_MSG)).toBeTruthy();
});

test("another create error is shown as an alert", async () => {
  reply(500, { error: { code: "internal", message: "Could not create the project." } });
  view([]);
  fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "X" } });
  fireEvent.click(screen.getByRole("button", { name: "Create project" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Could not create the project.");
});

test("rename: edit inline, PATCH, list updates", async () => {
  reply(200, { project: p("p1", "Renamed") });
  view([p("p1", "Old")]);
  fireEvent.click(screen.getByRole("button", { name: "Rename Old" }));
  fireEvent.change(screen.getByLabelText("New name for Old"), { target: { value: "Renamed" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("link", { name: "Renamed" });
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/projects/p1",
    expect.objectContaining({ method: "PATCH", body: JSON.stringify({ name: "Renamed" }) }),
  );
  expect(screen.queryByRole("link", { name: "Old" })).toBeNull();
});

test("rename cancel leaves the name alone; a failed rename shows the error", async () => {
  view([p("p1", "Old")]);
  fireEvent.click(screen.getByRole("button", { name: "Rename Old" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("link", { name: "Old" })).toBeTruthy();

  reply(404, { error: { code: "not_found", message: "Project not found." } });
  fireEvent.click(screen.getByRole("button", { name: "Rename Old" }));
  fireEvent.change(screen.getByLabelText("New name for Old"), { target: { value: "Z" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Project not found.");
});

test("delete: the dialog names the project and says it can't be undone; confirm removes it", async () => {
  reply(200, { ok: true });
  view([p("p1", "Docs bot"), p("p2", "Other")]);
  fireEvent.click(screen.getByRole("button", { name: "Delete Docs bot" }));
  const dialog = screen.getByRole("dialog");
  expect(dialog.textContent).toContain("Delete Docs bot?");
  expect(dialog.textContent).toContain("can't be undone");
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
  await waitFor(() => expect(screen.queryByRole("link", { name: "Docs bot" })).toBeNull());
  expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1", expect.objectContaining({ method: "DELETE" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("link", { name: "Other" })).toBeTruthy();
});

test("delete: cancel and Escape close the dialog without calling the API", () => {
  view([p("p1", "Docs bot")]);
  fireEvent.click(screen.getByRole("button", { name: "Delete Docs bot" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Delete Docs bot" }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("deleting at the limit re-enables create", async () => {
  reply(200, { ok: true });
  view([p("p1", "Only")], 1);
  fireEvent.click(screen.getByRole("button", { name: "Delete Only" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
  await waitFor(() => expect(screen.getByText("No projects yet")).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Again" } });
  expect((screen.getByRole("button", { name: "Create project" }) as HTMLButtonElement).disabled).toBe(false);
});

const ID = "5f0c2f0e-8a3a-4a53-9b0e-3a6f1d1a2b3c";

test("project layout: name, public key page and the Install link", async () => {
  loadOwnedProject.mockResolvedValue(p(ID, "Docs bot"));
  const ui = await ProjectLayout({ children: <span>child</span>, params: Promise.resolve({ id: ID }) });
  render(ui);
  expect(screen.getByRole("heading", { name: "Docs bot" })).toBeTruthy();
  expect(screen.getByText("child")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Install" }).getAttribute("href")).toBe(`/dashboard/projects/${ID}/install`);
});

test("project page shows the public key", async () => {
  loadOwnedProject.mockResolvedValue(p(ID, "Docs bot"));
  render(await ProjectPage({ params: Promise.resolve({ id: ID }) }));
  expect(screen.getByText(`pk_${ID}`)).toBeTruthy();
});

test("not found (missing or someone else's): layout shows the not-found state, page calls notFound", async () => {
  loadOwnedProject.mockResolvedValue(null);
  render(await ProjectLayout({ children: <span>child</span>, params: Promise.resolve({ id: ID }) }));
  expect(screen.getByText("Project not found")).toBeTruthy();
  expect(screen.queryByText("child")).toBeNull();
  await expect(ProjectPage({ params: Promise.resolve({ id: ID }) })).rejects.toThrow("NEXT_NOT_FOUND");
  cleanup();
  render(<NotFound />);
  expect(screen.getByRole("link", { name: "Back to projects" }).getAttribute("href")).toBe("/dashboard");
});

test("subnav marks the current page; loading announces status", () => {
  render(<ProjectSubnav projectId="p1" />);
  expect(screen.getByRole("link", { name: "Overview" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "Install" }).getAttribute("aria-current")).toBeNull();
  cleanup();
  render(<Loading />);
  expect(screen.getByRole("status").textContent).toBe("Loading project…");
});

test("dialog: Escape is ignored while the delete request is in flight", async () => {
  let finish!: (v: unknown) => void;
  fetchMock.mockReturnValueOnce(new Promise((r) => (finish = r)));
  view([p("p1", "Docs bot")]);
  fireEvent.click(screen.getByRole("button", { name: "Delete Docs bot" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.getByRole("dialog")).toBeTruthy();
  finish({ ok: true, status: 200, json: async () => ({ ok: true }) });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("dialog: focus starts on Cancel and returns to the opener on cancel", () => {
  view([p("p1", "Docs bot")]);
  const opener = screen.getByRole("button", { name: "Delete Docs bot" });
  opener.focus();
  fireEvent.click(opener);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(document.activeElement).toBe(opener);
});

test("dialog: after a delete the opener is gone, so focus goes to the page heading", async () => {
  reply(200, { ok: true });
  view([p("p1", "Docs bot")]);
  const opener = screen.getByRole("button", { name: "Delete Docs bot" });
  opener.focus();
  fireEvent.click(opener);
  fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Projects" }));
});

test("dialog: Tab and Shift+Tab stay inside the dialog", () => {
  view([p("p1", "Docs bot")]);
  fireEvent.click(screen.getByRole("button", { name: "Delete Docs bot" }));
  const cancel = screen.getByRole("button", { name: "Cancel" });
  const confirm = screen.getByRole("button", { name: "Delete project" });
  confirm.focus();
  fireEvent.keyDown(document, { key: "Tab" });
  expect(document.activeElement).toBe(cancel);
  fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
  expect(document.activeElement).toBe(confirm);
});
