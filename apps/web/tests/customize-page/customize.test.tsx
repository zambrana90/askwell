import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DEFAULT_WIDGET_CONFIG, type WidgetConfig } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/projects/p1/customize",
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
const getPlan = vi.fn();
vi.mock("../../lib/projects/projects", () => ({ getPlan: (id: string) => getPlan(id) }));
let configResult: { data: unknown; error: unknown };
vi.mock("../../lib/supabase/owner", () => ({
  createOwnerClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(configResult) }) }) }),
  }),
}));

import CustomizePage from "../../app/dashboard/projects/[id]/customize/page";
import { CustomizeForm, saveErrorMessage } from "../../components/customize/customize-form";
import { inkFor, isHexColor, placement } from "../../components/customize/preview-utils";
import { WidgetPreview } from "../../components/customize/widget-preview";
import { ProjectSubnav } from "../../components/projects/project-subnav";

const PID = "5f0c2f0e-8a3a-4a53-9b0e-3a6f1d1a2b3c";
const saved: WidgetConfig = {
  buttonColor: "#112233",
  position: "top-left",
  label: "Help",
  animation: "scale",
  headerText: "Hi there",
  showBadge: false,
};
const fetchMock = vi.fn();
const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce({ ok: status < 400, status, json: async () => body });
const form = (o: { canCustomize: boolean; initial?: WidgetConfig }) =>
  render(<CustomizeForm projectId={PID} initialConfig={o.initial ?? DEFAULT_WIDGET_CONFIG} canCustomize={o.canCustomize} />);
const button = () => screen.getByTestId("preview-button");

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  authMock.mockReset().mockResolvedValue({ userId: "u1" });
  loadOwnedProject.mockReset().mockResolvedValue({ id: PID, name: "Docs" });
  getPlan.mockReset().mockResolvedValue("pro");
  configResult = {
    data: { button_color: "#112233", position: "top-left", label: "Help", animation: "scale", header_text: "Hi there", show_badge: false },
    error: null,
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("helpers", () => {
  test("isHexColor, inkFor (readable text) and placement", () => {
    expect(isHexColor("#a1B2c3")).toBe(true);
    expect(isHexColor("#fff")).toBe(false);
    expect(isHexColor("red")).toBe(false);
    expect(inkFor("#000000")).toBe("#ffffff");
    expect(inkFor("#ffffff")).toBe("#000000");
    expect(inkFor("#ffeb3b")).toBe("#000000");
    expect(inkFor("#0a2a66")).toBe("#ffffff");
    expect(inkFor("nope")).toBe("#ffffff"); // falls back to black background
    expect(placement("top-left").button).toContain("top-3");
    expect(placement("top-left").button).toContain("left-3");
    expect(placement("bottom-right").button).toContain("bottom-3");
    expect(placement("bottom-right").button).toContain("right-3");
  });

  test("saveErrorMessage: friendly text, never server text", () => {
    expect(saveErrorMessage(402, "payment_required")).toMatch(/Pro feature/);
    expect(saveErrorMessage(400, "validation_error")).toMatch(/not valid/);
    expect(saveErrorMessage(500, "internal")).toMatch(/went wrong/);
  });
});

describe("Free: locked", () => {
  test("fields are disabled, defaults shown, upgrade prompt links to billing, Save disabled", () => {
    form({ canCustomize: false });
    expect(screen.getByText("Customizing is a Pro feature.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Upgrade to Pro" }).getAttribute("href")).toBe("/dashboard/billing");
    expect(screen.getByLabelText("Button label").matches(":disabled")).toBe(true); // disabled via its fieldset
    expect((screen.getByLabelText("Button label") as HTMLInputElement).value).toBe(DEFAULT_WIDGET_CONFIG.label);
    expect(screen.getByLabelText("Header text").matches(":disabled")).toBe(true); // disabled via its fieldset
    expect(screen.getByLabelText("Animation").matches(":disabled")).toBe(true); // disabled via its fieldset
    expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("preview-badge")).toBeTruthy();
  });

  test("submitting a locked form never calls the route", () => {
    form({ canCustomize: false });
    fireEvent.submit(screen.getByRole("button", { name: "Save" }).closest("form")!);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Pro: editing and the live preview", () => {
  test("the preview updates per field", () => {
    form({ canCustomize: true });
    expect((screen.getByLabelText("Button label") as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByText("Customizing is a Pro feature.")).toBeNull();

    fireEvent.change(screen.getByLabelText("Button label"), { target: { value: "Ask us" } });
    expect(button().textContent).toBe("Ask us");

    fireEvent.change(screen.getByLabelText("Header text"), { target: { value: "Docs help" } });
    expect(screen.getByTestId("preview-panel").textContent).toContain("Docs help");

    fireEvent.change(screen.getByLabelText("Button color (hex)"), { target: { value: "#ffeb3b" } });
    expect(button().style.backgroundColor).toBe("rgb(255, 235, 59)");
    expect(button().style.color).toBe("rgb(0, 0, 0)"); // readable on yellow

    fireEvent.click(screen.getByLabelText("Top left"));
    expect(screen.getByTestId("preview-frame").getAttribute("data-position")).toBe("top-left");
    expect(button().className).toContain("top-3");
    expect(button().className).toContain("left-3");

    fireEvent.change(screen.getByLabelText("Animation"), { target: { value: "slide" } });
    expect(screen.getByTestId("preview-frame").getAttribute("data-animation")).toBe("slide");

    fireEvent.click(screen.getByLabelText(/Show the "Powered by" badge/));
    expect(screen.queryByTestId("preview-badge")).toBeNull();
  });

  test("an invalid hex does not change the preview, and Save asks for a valid color", () => {
    form({ canCustomize: true });
    fireEvent.change(screen.getByLabelText("Button color (hex)"), { target: { value: "#12" } });
    expect(button().style.backgroundColor).toBe("rgb(0, 0, 0)");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert").textContent).toMatch(/hex value/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("label and header inputs carry the shared length limits", () => {
    form({ canCustomize: true });
    expect(screen.getByLabelText("Button label").getAttribute("maxlength")).toBe("40");
    expect(screen.getByLabelText("Header text").getAttribute("maxlength")).toBe("60");
  });

  test("HTML in the label or header shows as literal text", () => {
    const evil = "<img src=x onerror=alert(1)>";
    const { container } = form({ canCustomize: true });
    fireEvent.change(screen.getByLabelText("Header text"), { target: { value: evil } });
    expect(screen.getByTestId("preview-panel").textContent).toContain(evil);
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("Pro: save", () => {
  test("calls PATCH /api/projects/:id/config with the config and shows the saved state", async () => {
    reply(200, { config: { ...saved, label: "Ask us" } });
    form({ canCustomize: true, initial: saved });
    fireEvent.change(screen.getByLabelText("Button label"), { target: { value: "Ask us" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Saved/));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`/api/projects/${PID}/config`);
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ ...saved, label: "Ask us" });
  });

  test.each([
    [402, "payment_required", /Pro feature/],
    [400, "validation_error", /not valid/],
    [500, "internal", /went wrong/],
  ])("%i shows a friendly message, not the server's", async (status, code, pattern) => {
    reply(status, { error: { code, message: "server detail that must not show" } });
    form({ canCustomize: true, initial: saved });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(pattern);
    expect(alert.textContent).not.toMatch(/server detail/);
  });

  test("the fields are locked while a save is pending, so a newer edit can't be overwritten", async () => {
    let resolve!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    form({ canCustomize: true, initial: saved });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByLabelText("Button label").matches(":disabled")).toBe(true));
    expect(screen.getByLabelText("Header text").matches(":disabled")).toBe(true);
    resolve({ ok: true, status: 200, json: async () => ({ config: saved }) });
    await waitFor(() => expect(screen.getByLabelText("Button label").matches(":disabled")).toBe(false));
    expect(screen.getByRole("status").textContent).toMatch(/Saved/);
  });

  test("a network error shows a message and re-enables Save", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    form({ canCustomize: true, initial: saved });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Could not reach/);
    await waitFor(() => expect((screen.getByRole("button", { name: "Save" }) as HTMLButtonElement).disabled).toBe(false));
  });
});

describe("page (plan read on the server)", () => {
  const params = { params: Promise.resolve({ id: PID }) };

  test("Pro: the form is enabled with the saved values", async () => {
    render(await CustomizePage(params));
    expect((screen.getByLabelText("Button label") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText("Button label") as HTMLInputElement).value).toBe("Help");
    expect(getPlan).toHaveBeenCalledWith("u1");
  });

  test("Free: locked, and the defaults show even though a saved config exists", async () => {
    getPlan.mockResolvedValue("free");
    render(await CustomizePage(params));
    expect(screen.getByLabelText("Button label").matches(":disabled")).toBe(true); // disabled via its fieldset
    expect((screen.getByLabelText("Button label") as HTMLInputElement).value).toBe(DEFAULT_WIDGET_CONFIG.label);
    expect(screen.getByText("Customizing is a Pro feature.")).toBeTruthy();
  });

  test("Pro without a saved row shows the defaults", async () => {
    configResult = { data: null, error: null };
    render(await CustomizePage(params));
    expect((screen.getByLabelText("Button label") as HTMLInputElement).value).toBe(DEFAULT_WIDGET_CONFIG.label);
  });

  test("signed out redirects, unknown project is not found, a read error shows the error state", async () => {
    authMock.mockResolvedValueOnce({ userId: null });
    await expect(CustomizePage(params)).rejects.toThrow("REDIRECT:/sign-in");
    loadOwnedProject.mockResolvedValueOnce(null);
    await expect(CustomizePage(params)).rejects.toThrow("NEXT_NOT_FOUND");
    configResult = { data: null, error: { message: "boom" } };
    render(await CustomizePage(params));
    expect(screen.getByRole("alert").textContent).toMatch(/couldn't load your widget settings/i);
  });
});

describe("preview and subnav", () => {
  test("the badge is hidden when showBadge is false", () => {
    render(<WidgetPreview config={{ ...DEFAULT_WIDGET_CONFIG, showBadge: false }} />);
    expect(screen.queryByTestId("preview-badge")).toBeNull();
  });

  test("the subnav has a Customize tab", () => {
    render(<ProjectSubnav projectId="p1" />);
    const link = screen.getByRole("link", { name: "Customize" });
    expect(link.getAttribute("href")).toBe("/dashboard/projects/p1/customize");
    expect(link.getAttribute("aria-current")).toBe("page");
  });
});
