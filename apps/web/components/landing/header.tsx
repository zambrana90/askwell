"use client";

// Client component so `Show` resolves after hydration and the landing page stays static.
// The nav reserves its size so the header doesn't jump while Clerk loads.
import { useEffect, useState } from "react";
import { Show } from "@clerk/nextjs";
import Link from "next/link";
import { APP_NAME } from "@askwell/shared";
import { LinkButton } from "./link-button";
import { BRAND_LINK } from "../ui/interactive";

/** True once the page has moved from the top, which is when the header needs its glass. */
function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update(); // the page may load already scrolled (reload, #anchor)
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return scrolled;
}

export function LandingHeader() {
  const scrolled = useScrolled();
  return (
    <header className="landing-header sticky top-0 z-30" data-scrolled={scrolled}>
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link href="/" className={`inline-flex min-h-10 items-center font-semibold tracking-tight ${BRAND_LINK}`}>
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
      </div>
    </header>
  );
}
