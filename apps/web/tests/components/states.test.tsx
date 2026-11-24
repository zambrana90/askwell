import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import BillingError from "../../app/dashboard/billing/error";
import DashboardError from "../../app/dashboard/error";
import ProjectError from "../../app/dashboard/projects/[id]/error";
import ThreadError from "../../app/dashboard/projects/[id]/conversations/[conversationId]/error";
import ConversationsError from "../../app/dashboard/projects/[id]/conversations/error";
import CustomizeError from "../../app/dashboard/projects/[id]/customize/error";
import InstallError from "../../app/dashboard/projects/[id]/install/error";
import KnowledgeError from "../../app/dashboard/projects/[id]/knowledge/error";
import KnowledgeLoading from "../../app/dashboard/projects/[id]/knowledge/loading";
import EmbedLoading from "../../app/embed/loading";

afterEach(cleanup);

describe("error boundaries", () => {
  test.each([
    ["dashboard", DashboardError],
    ["billing", BillingError],
    ["project", ProjectError],
    ["knowledge", KnowledgeError],
    ["conversations", ConversationsError],
    ["thread", ThreadError],
    ["customize", CustomizeError],
    ["install", InstallError],
  ])("%s: Try again re-fetches with retry()", (_name, Boundary) => {
    const retry = vi.fn();
    render(<Boundary error={new Error("x")} retry={retry} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe("loading states", () => {
  test("knowledge announces its status", () => {
    render(<KnowledgeLoading />);
    expect(screen.getByRole("status").textContent).toBe("Loading knowledge…");
  });

  test("the embed panel shows a spinner", () => {
    render(<EmbedLoading />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeTruthy();
  });
});
