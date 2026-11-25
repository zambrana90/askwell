import Link from "next/link";
import type { ReactNode } from "react";
import { APP_NAME } from "@askwell/shared";

/** The frame around sign-in and sign-up: dark like the landing page, with a way back to it. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="theme-dark relative isolate flex min-h-screen flex-col items-center justify-center gap-6 overflow-x-clip bg-canvas px-4 py-10 text-ink">
      <div aria-hidden="true" className="landing-backdrop pointer-events-none absolute inset-0 -z-10" />
      <Link href="/" className="inline-flex min-h-10 items-center text-2xl font-semibold tracking-tight">
        {APP_NAME}
      </Link>
      <main className="flex w-full justify-center">{children}</main>
    </div>
  );
}
