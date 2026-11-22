import { cleanup, render, screen } from "@testing-library/react";
import { APP_NAME } from "@askwell/shared";
import { afterEach, expect, test, vi } from "vitest";
import { DashboardNav } from "../../components/dashboard/nav";
import { NAV_ITEMS } from "../../app/dashboard/nav-items";
import Loading from "../../app/dashboard/loading";
import DashboardPage from "../../app/dashboard/page";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

afterEach(cleanup);

test("empty state renders with a disabled create button", () => {
  render(<DashboardPage />);
  expect(screen.getByText("No projects yet")).toBeTruthy();
  const button = screen.getByRole("button", { name: "Create project" }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
});

test("nav renders APP_NAME and the Projects link", () => {
  render(<DashboardNav appName={APP_NAME} items={NAV_ITEMS} userMenu={<span>user</span>} />);
  expect(screen.getByRole("link", { name: APP_NAME })).toBeTruthy();
  const projects = screen.getByRole("link", { name: "Projects" });
  expect(projects.getAttribute("href")).toBe("/dashboard");
  expect(projects.getAttribute("aria-current")).toBe("page");
});

test("loading fallback announces a status message", () => {
  render(<Loading />);
  expect(screen.getByRole("status").textContent).toBe("Loading projects…");
});
