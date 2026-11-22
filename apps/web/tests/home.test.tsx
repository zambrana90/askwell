import { cleanup, render, screen, within } from "@testing-library/react";
import { APP_NAME } from "@askwell/shared";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ signedIn: false }));
vi.mock("@clerk/nextjs", () => ({
  Show: ({ when, children }: { when: "signed-in" | "signed-out"; children: ReactNode }) =>
    (when === "signed-in") === state.signedIn ? children : null,
}));

import Home from "../app/page";

afterEach(() => {
  cleanup();
  state.signedIn = false;
});

test("home page renders APP_NAME", () => {
  render(<Home />);
  expect(screen.getByRole("heading", { level: 1, name: APP_NAME })).toBeTruthy();
});

test("shows all six sections in order", () => {
  render(<Home />);
  const titles = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
  expect(titles).toEqual(["How it works", "Live demo", "Pricing", "Install"]);
  expect(screen.getByRole("banner")).toBeTruthy(); // header
  expect(screen.getByRole("contentinfo")).toBeTruthy(); // footer
});

test("signed out: header offers Sign in", () => {
  render(<Home />);
  const nav = within(screen.getByRole("navigation", { name: "Account" }));
  expect(nav.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
  expect(nav.queryByRole("link", { name: "Dashboard" })).toBeNull();
});

test("signed in: header shows Dashboard", () => {
  state.signedIn = true;
  render(<Home />);
  const nav = within(screen.getByRole("navigation", { name: "Account" }));
  expect(nav.getByRole("link", { name: "Dashboard" }).getAttribute("href")).toBe("/dashboard");
  expect(nav.queryByRole("link", { name: "Sign in" })).toBeNull();
});
