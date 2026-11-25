import { cleanup, render, screen } from "@testing-library/react";
import { APP_NAME } from "@askwell/shared";
import type { ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

const seen = vi.hoisted(() => ({ provider: vi.fn(), signIn: vi.fn(), signUp: vi.fn() }));
vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: (props: { children: ReactNode }) => (seen.provider(props), props.children),
  SignIn: (props: unknown) => (seen.signIn(props), <div data-testid="sign-in" />),
  SignUp: (props: unknown) => (seen.signUp(props), <div data-testid="sign-up" />),
}));

import SignInPage from "../../app/sign-in/[[...sign-in]]/page";
import SignUpPage from "../../app/sign-up/[[...sign-up]]/page";
import { AppClerkProvider } from "../../components/auth/app-clerk-provider";
import { APPEARANCE, AUTH_APPEARANCE } from "../../components/auth/appearance";

afterEach(cleanup);

test("the provider themes every Clerk component and keeps its redirects", () => {
  render(<AppClerkProvider>x</AppClerkProvider>);
  expect(seen.provider).toHaveBeenCalledWith(
    expect.objectContaining({
      appearance: APPEARANCE,
      signInUrl: "/sign-in",
      signUpUrl: "/sign-up",
      signInFallbackRedirectUrl: "/dashboard",
      signUpFallbackRedirectUrl: "/dashboard",
      afterSignOutUrl: "/sign-in",
    }),
  );
});

describe.each([
  ["sign-in", SignInPage, seen.signIn],
  ["sign-up", SignUpPage, seen.signUp],
] as const)("%s page", (name, Page, clerk) => {
  test("is dark, links back home and passes the dark appearance", () => {
    const { container } = render(<Page />);
    expect(container.querySelector(".theme-dark")?.contains(screen.getByTestId(name))).toBe(true);
    expect(screen.getByRole("link", { name: APP_NAME }).getAttribute("href")).toBe("/");
    expect(clerk).toHaveBeenCalledWith(expect.objectContaining({ appearance: AUTH_APPEARANCE }));
  });
});

test("colors come from our tokens, never literal brand colors", () => {
  expect(APPEARANCE.variables?.colorPrimary).toBe("var(--brand)");
  expect(APPEARANCE.variables?.colorPrimaryForeground).toBe("var(--brand-ink)");
  expect(JSON.stringify(APPEARANCE)).not.toContain("#");
});

test("drawers, modals and popovers get the dashboard theme, as they mount outside it", () => {
  for (const element of ["drawerRoot", "modalBackdrop", "userButtonPopoverRootBox"] as const) {
    expect(APPEARANCE.elements).toHaveProperty(element, "theme-auto");
  }
});
