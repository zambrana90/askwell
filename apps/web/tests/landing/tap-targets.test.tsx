import { cleanup, render, screen, within } from "@testing-library/react";
import { APP_NAME } from "@askwell/shared";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("@clerk/nextjs", () => ({ Show: ({ when, children }: { when: string; children: React.ReactNode }) => (when === "signed-out" ? children : null) }));

import { Footer } from "../../components/landing/footer";
import { LandingHeader } from "../../components/landing/header";

afterEach(cleanup);

// jsdom has no layout, so this checks the class that sets the 40 px minimum; sizes are checked in a browser.
test("header and footer links are at least 40 px tall", () => {
  render(
    <>
      <LandingHeader />
      <Footer />
    </>,
  );
  const header = within(screen.getByRole("banner"));
  const footer = within(screen.getByRole("contentinfo"));
  for (const link of [header.getByRole("link", { name: APP_NAME }), header.getByRole("link", { name: "Sign in" }), footer.getByRole("link", { name: "Sign in" })]) {
    expect(link.className).toContain("min-h-10");
  }
});
