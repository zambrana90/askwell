import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { PhoneFrame } from "../../components/landing/phone-frame";
import { Section } from "../../components/landing/section";

afterEach(cleanup);

describe("PhoneFrame", () => {
  test("renders its children once, on the screen", () => {
    const { container } = render(<PhoneFrame><p>Inside</p></PhoneFrame>);
    expect(screen.getAllByText("Inside")).toHaveLength(1);
    expect(container.querySelector('[data-phone="screen"]')?.textContent).toBe("Inside");
  });

  test("decoration is hidden from assistive tech and has no text", () => {
    const { container } = render(<PhoneFrame><p>Inside</p></PhoneFrame>);
    const decoration = container.querySelectorAll('[aria-hidden="true"]');
    expect(decoration.length).toBeGreaterThan(0);
    for (const node of decoration) expect(node.textContent).toBe("");
    expect(container.textContent).toBe("Inside"); // no status bar, clock or brand
  });

  // jsdom has no layout, so this checks the classes; sizes are checked in a browser.
  test("the bezel starts at sm; below it there is a 480 px card", () => {
    const { container } = render(<PhoneFrame>x</PhoneFrame>);
    const body = container.querySelector('[data-phone="body"]')!.className.split(" ");
    expect(body.filter((c) => c !== "relative").every((c) => c.startsWith("sm:"))).toBe(true);
    for (const node of container.querySelectorAll('[aria-hidden="true"]')) {
      if (node.parentElement!.closest('[aria-hidden="true"]')) continue;
      expect(node.className.split(" ")).toContain("hidden");
    }
    const screenClasses = container.querySelector('[data-phone="screen"]')!.className;
    expect(screenClasses).toContain("h-[480px]");
    expect(screenClasses).toContain("md:h-[720px]");
    expect(screenClasses).toContain("md:w-[360px]");
  });
});

describe("Section align", () => {
  const parts = () => [screen.getByText("Eyebrow"), screen.getByRole("heading"), screen.getByText("Intro")];

  test("left by default", () => {
    render(<Section id="x" title="Title" eyebrow="Eyebrow" intro="Intro" />);
    for (const part of parts()) expect(part.className).not.toMatch(/text-center|mx-auto/);
  });

  test("center centers the eyebrow, title and intro", () => {
    render(<Section id="x" title="Title" eyebrow="Eyebrow" intro="Intro" align="center" />);
    for (const part of parts()) expect(part.className).toContain("text-center");
    expect(screen.getByText("Intro").className).toContain("mx-auto");
  });
});
