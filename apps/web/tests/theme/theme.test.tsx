import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test } from "vitest";
import { ThemeToggle } from "../../components/dashboard/theme-toggle";
import { THEME_KEY, applyThemeChoice, parseThemeChoice, resolveTheme } from "../../lib/theme";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(cleanup);

test("resolveTheme: stored choice beats the system setting", () => {
  expect(resolveTheme("light", true)).toBe("light");
  expect(resolveTheme("dark", false)).toBe("dark");
});

test("resolveTheme: system or missing or invalid follows the system", () => {
  expect(resolveTheme("system", true)).toBe("dark");
  expect(resolveTheme(null, false)).toBe("light");
  expect(resolveTheme("purple", true)).toBe("dark");
});

test("parseThemeChoice falls back to system", () => {
  expect(parseThemeChoice("dark")).toBe("dark");
  expect(parseThemeChoice(42)).toBe("system");
});

test("applyThemeChoice sets and clears the attribute", () => {
  applyThemeChoice(document.documentElement, "dark");
  expect(document.documentElement.dataset.theme).toBe("dark");
  applyThemeChoice(document.documentElement, "system");
  expect(document.documentElement.dataset.theme).toBeUndefined();
});

test("toggle switches the attribute and stores the choice", () => {
  render(<ThemeToggle />);
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }));
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(localStorage.getItem(THEME_KEY)).toBe("dark");
  expect(screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked")).toBe("true");
  fireEvent.click(screen.getByRole("radio", { name: "Light" }));
  expect(document.documentElement.dataset.theme).toBe("light");
  fireEvent.click(screen.getByRole("radio", { name: "System" }));
  expect(document.documentElement.dataset.theme).toBeUndefined();
});

test("toggle shows the stored choice after a reload", () => {
  localStorage.setItem(THEME_KEY, "dark");
  render(<ThemeToggle />);
  expect(screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked")).toBe("true");
});

test("toggle applies the stored choice on mount (client-side navigation)", () => {
  localStorage.setItem(THEME_KEY, "dark");
  expect(document.documentElement.dataset.theme).toBeUndefined();
  render(<ThemeToggle />);
  expect(document.documentElement.dataset.theme).toBe("dark");
});

test("toggle is a roving-tabindex radio group with arrow-key navigation", () => {
  render(<ThemeToggle />);
  const radio = (name: string) => screen.getByRole("radio", { name });
  // Only the checked option (System by default) is a tab stop.
  expect(radio("System").getAttribute("tabindex")).toBe("0");
  expect(radio("Light").getAttribute("tabindex")).toBe("-1");
  // Arrow keys move selection and focus, and wrap around.
  fireEvent.keyDown(radio("System"), { key: "ArrowRight" });
  expect(radio("Light").getAttribute("aria-checked")).toBe("true");
  expect(document.activeElement).toBe(radio("Light"));
  expect(document.documentElement.dataset.theme).toBe("light");
  fireEvent.keyDown(radio("Light"), { key: "ArrowLeft" });
  expect(radio("System").getAttribute("aria-checked")).toBe("true");
  fireEvent.keyDown(radio("System"), { key: "ArrowLeft" });
  expect(radio("Dark").getAttribute("aria-checked")).toBe("true");
});
