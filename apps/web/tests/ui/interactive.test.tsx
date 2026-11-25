import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/projects/p1" }));

import { LinkButton } from "../../components/landing/link-button";
import { DashboardNav } from "../../components/dashboard/nav";
import { ProjectSubnav } from "../../components/projects/project-subnav";
import { Button } from "../../components/ui/button";
import { BUTTON_VARIANTS, type ButtonVariant } from "../../components/ui/interactive";

afterEach(cleanup);

// jsdom applies no CSS, so these check the classes; the looks are checked in a browser.
const variants = Object.keys(BUTTON_VARIANTS) as ButtonVariant[];

const expectClickable = (element: HTMLElement) => {
  const classes = element.className.split(/\s+/);
  expect(classes).toContain("cursor-pointer");
  expect(classes).toContain("focus-visible:outline-2");
  expect(classes.some((c) => /(^|:)hover:/.test(c))).toBe(true);
};

describe.each(variants)("%s variant", (variant) => {
  test("Button and LinkButton share a pointer, a hover, a press state and a focus ring", () => {
    render(
      <>
        <Button variant={variant}>Press</Button>
        <LinkButton href="/x" variant={variant}>
          Go
        </LinkButton>
      </>,
    );
    for (const element of [screen.getByRole("button"), screen.getByRole("link")]) {
      expectClickable(element);
      expect(element.className).toContain("active:");
      expect(element.className).toContain(BUTTON_VARIANTS[variant]);
    }
  });

  test("a disabled button gets no hover or press look", () => {
    for (const c of BUTTON_VARIANTS[variant].split(" ")) {
      if (/(hover|active):/.test(c)) expect(c).toContain("not-disabled:");
    }
  });

  test("the hover is more than a faint fade", () => {
    expect(BUTTON_VARIANTS[variant]).not.toContain("opacity");
  });
});

test("every transition and lift is off with reduced motion", () => {
  render(
    <>
      {variants.map((variant) => (
        <Button key={variant} variant={variant}>
          {variant}
        </Button>
      ))}
    </>,
  );
  for (const button of screen.getAllByRole("button")) {
    for (const c of button.className.split(/\s+/)) {
      if (/(^|:)(transition|-?translate)/.test(c)) expect(c.startsWith("motion-safe:")).toBe(true);
    }
  }
});

test("dashboard links and the menu button are clickable", () => {
  render(
    <>
      <DashboardNav appName="App" items={[{ label: "Projects", href: "/dashboard" }]} userMenu={null} />
      <ProjectSubnav projectId="p1" />
    </>,
  );
  for (const element of [...screen.getAllByRole("link"), screen.getByRole("button", { name: "Menu" })]) {
    expectClickable(element);
  }
});
