import Link from "next/link";
import { APP_NAME } from "@askwell/shared";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Live demo", href: "#demo" },
      { label: "Pricing", href: "#pricing" },
      { label: "Install", href: "#install" },
    ],
  },
  { title: "Your account", links: [{ label: "Sign in", href: "/sign-in" }] },
] as const;

export function Footer() {
  return (
    <footer className="border-t border-glass-edge text-sm text-ink-muted">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-x-6 gap-y-10 px-4 py-12 md:grid-cols-[2fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-1">
          <p className="font-semibold text-ink">{APP_NAME}</p>
          <p className="mt-2 max-w-xs">An AI support chat for your website.</p>
        </div>
        {COLUMNS.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <p className="text-xs font-medium uppercase tracking-[0.2em]">{column.title}</p>
            <ul className="mt-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="inline-flex min-h-10 items-center hover:text-ink">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="mx-auto max-w-5xl border-t border-glass-edge px-4 py-6">
        {APP_NAME} © {new Date().getFullYear()}
      </p>
    </footer>
  );
}
