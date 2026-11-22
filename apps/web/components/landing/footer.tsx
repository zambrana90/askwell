import Link from "next/link";
import { APP_NAME } from "@askwell/shared";

export function Footer() {
  return (
    <footer className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 border-t border-glass-edge px-4 py-8 text-sm text-ink-muted">
      <p>
        {APP_NAME} © {new Date().getFullYear()}
      </p>
      <Link href="/sign-in" className="hover:text-ink">
        Sign in
      </Link>
    </footer>
  );
}
