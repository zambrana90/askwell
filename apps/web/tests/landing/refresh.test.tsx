import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({ Show: () => null }));

import { Footer } from "../../components/landing/footer";
import { LandingHeader } from "../../components/landing/header";
import { Hero } from "../../components/landing/hero";
import { Install } from "../../components/landing/install";
import { Pricing } from "../../components/landing/pricing";
import { Section } from "../../components/landing/section";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("Try the demo jumps to the demo section", () => {
  render(<Hero />);
  expect(screen.getByRole("link", { name: "Try the demo" }).getAttribute("href")).toBe("#demo");
});

test("each section has an eyebrow label that is not a heading", () => {
  render(<Section id="demo" title="Live demo" />);
  expect(screen.getByText("Try it").tagName).toBe("P");
  expect(screen.getAllByRole("heading")).toHaveLength(1);
});

test("only Pro is tagged Most popular", () => {
  const { container } = render(<Pricing />);
  expect(screen.getAllByText("Most popular")).toHaveLength(1);
  expect(within(container.querySelector('[data-plan="pro"]') as HTMLElement).getByText("Most popular")).toBeTruthy();
});

test("the header gets its glass after scrolling", () => {
  render(<LandingHeader />);
  const header = screen.getByRole("banner");
  expect(header.dataset.scrolled).toBe("false");
  vi.stubGlobal("scrollY", 100);
  act(() => void window.dispatchEvent(new Event("scroll")));
  expect(header.dataset.scrolled).toBe("true");
});

test("footer links are all at least 40 px tall", () => {
  render(<Footer />);
  for (const link of screen.getAllByRole("link")) expect(link.className).toContain("min-h-10");
});

test("Copy writes the example snippet, says so, then resets", async () => {
  vi.useFakeTimers();
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const { container } = render(<Install />);
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Copy" })));
  expect(writeText).toHaveBeenCalledWith(container.querySelector("code")?.textContent);
  expect(screen.getByRole("status").textContent).toBe("Copied to your clipboard.");
  act(() => void vi.advanceTimersByTime(3000));
  expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
});

test("Copy says what to do when the clipboard is unavailable", async () => {
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
  render(<Install />);
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Copy" })));
  expect(screen.getByRole("status").textContent).toContain("Select the text and copy it");
});
