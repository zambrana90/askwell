import { dark } from "@clerk/ui/themes";
import type { ComponentProps } from "react";
import type { ClerkProvider } from "@clerk/nextjs";

type Appearance = NonNullable<ComponentProps<typeof ClerkProvider>["appearance"]>;

/**
 * Clerk in our black and white. Colors are the CSS tokens from globals.css, so each component
 * follows the theme of the element it is in: light or dark on the dashboard, dark on auth pages.
 */
const variables: Appearance["variables"] = {
  colorPrimary: "var(--brand)",
  colorPrimaryForeground: "var(--brand-ink)",
  colorBackground: "var(--canvas)",
  colorForeground: "var(--ink)",
  colorMutedForeground: "var(--ink-muted)",
  colorNeutral: "var(--ink)",
  colorInput: "var(--canvas)",
  colorInputForeground: "var(--ink)",
  colorRing: "var(--ink-muted)",
  colorModalBackdrop: "rgb(0 0 0 / 0.6)",
  borderRadius: "var(--radius-glass)",
  fontFamily: "inherit",
};

/** Our glass surface (components/ui/panel.tsx) on Clerk's cards. */
const glass = {
  // Longhands: Clerk sets its own border width, which beats the `border` shorthand.
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "var(--glass-edge)",
  boxShadow: "var(--glass-shadow)",
  backdropFilter: "blur(var(--blur-glass))",
};

/**
 * Clerk mounts drawers, modals and popovers on <body>, outside the page's theme scope.
 * `theme-auto` on their root gives them the dashboard's tokens (and dark mode) again.
 */
const portals = {
  drawerRoot: "theme-auto",
  modalBackdrop: "theme-auto",
  userButtonPopoverRootBox: "theme-auto",
};

/** Clerk's default avatar is a purple gradient image; show avatars in black and white. */
const monochrome = { avatarImage: { filter: "grayscale(1)" } };

/** The default for every Clerk component, set on the provider. */
export const APPEARANCE: Appearance = {
  variables,
  elements: { ...portals, ...monochrome, cardBox: glass, pricingTableCard: { ...glass, background: "var(--glass)" } },
};

/** Sign-in and sign-up: Clerk's dark base theme under our variables, as a glass card. */
export const AUTH_APPEARANCE: Appearance = {
  theme: dark,
  variables,
  elements: {
    ...monochrome,
    cardBox: { ...glass, background: "var(--glass)" },
    card: { background: "transparent" },
    footer: { background: "transparent" },
  },
};
