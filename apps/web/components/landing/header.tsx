"use client";

// Client component so `Show` resolves after hydration and the landing page stays static.
// The nav reserves its size so the header doesn't jump while Clerk loads.
import { Show } from "@clerk/nextjs";
import Link from "next/link";
import { APP_NAME } from "@askwell/shared";
import { LinkButton } from "./link-button";

export function LandingHeader() {
  return (
    <header className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
      <Link href="/" className="inline-flex min-h-10 items-center font-semibold">
        {APP_NAME}
      </Link>
      <nav aria-label="Account" className="flex min-h-10 min-w-24 justify-end">
        <Show when="signed-out">
          <LinkButton href="/sign-in" variant="ghost">
            Sign in
          </LinkButton>
        </Show>
        <Show when="signed-in">
          <LinkButton href="/dashboard" variant="secondary">
            Dashboard
          </LinkButton>
        </Show>
      </nav>
    </header>
  );
}
