import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { APPEARANCE } from "./appearance";

/**
 * The one ClerkProvider config for the app. It wraps only the pages that need Clerk
 * (landing, sign-in, sign-up, dashboard), never /embed: the widget panel runs in a
 * cross-site iframe on customer sites and needs no auth (project.md §6.5, §9).
 */
export function AppClerkProvider({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider
      appearance={APPEARANCE}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
      afterSignOutUrl="/sign-in"
    >
      {children}
    </ClerkProvider>
  );
}
