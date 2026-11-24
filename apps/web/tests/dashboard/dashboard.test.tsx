import { cleanup, render, screen } from "@testing-library/react";
import { APP_NAME } from "@askwell/shared";
import { afterEach, expect, test, vi } from "vitest";
import { DashboardNav } from "../../components/dashboard/nav";
import { NAV_ITEMS } from "../../app/dashboard/nav-items";
import Loading from "../../app/dashboard/loading";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));

afterEach(cleanup);

test("nav renders APP_NAME and the Projects link", () => {
  render(<DashboardNav appName={APP_NAME} items={NAV_ITEMS} userMenu={<span>user</span>} />);
  expect(screen.getByRole("link", { name: APP_NAME })).toBeTruthy();
  const projects = screen.getByRole("link", { name: "Projects" });
  expect(projects.getAttribute("href")).toBe("/dashboard");
  expect(projects.getAttribute("aria-current")).toBe("page");
});

test("nav has a Billing item that points to /dashboard/billing", () => {
  expect(NAV_ITEMS.map((i) => i.label)).toEqual(["Projects", "Billing"]);
  render(<DashboardNav appName={APP_NAME} items={NAV_ITEMS} userMenu={<span>user</span>} />);
  expect(screen.getByRole("link", { name: "Billing" }).getAttribute("href")).toBe("/dashboard/billing");
});

test("loading fallback announces a status message", () => {
  render(<Loading />);
  expect(screen.getByRole("status").textContent).toBe("Loading projects…");
});
