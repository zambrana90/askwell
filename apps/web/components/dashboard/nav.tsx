"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

export type NavItem = { label: string; href: string };

type DashboardNavProps = {
  appName: string;
  items: readonly NavItem[];
  userMenu: ReactNode;
  themeToggle?: ReactNode;
};

export function DashboardNav({ appName, items, userMenu, themeToggle }: DashboardNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = (extra: string) =>
    items.map((item) => (
      <Link
        key={item.href}
        href={item.href}
        aria-current={pathname === item.href ? "page" : undefined}
        onClick={() => setOpen(false)}
        className={`inline-flex min-h-10 items-center rounded-glass px-3 py-2 text-sm text-ink-muted hover:bg-glass-edge hover:text-ink aria-[current=page]:text-ink ${extra}`}
      >
        {item.label}
      </Link>
    ));

  return (
    <header className="sticky top-0 z-10 border-b border-glass-edge bg-glass backdrop-blur-glass">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <Link href="/dashboard" className="inline-flex min-h-10 items-center font-semibold">
          {appName}
        </Link>
        <nav aria-label="Main" className="hidden flex-1 items-center gap-1 md:flex">
          {links("")}
        </nav>
        <div className="ml-auto flex items-center gap-3 md:ml-0">
          {themeToggle}
          {userMenu}
          <button
            type="button"
            aria-label="Menu"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex size-10 items-center justify-center rounded-glass hover:bg-glass-edge md:hidden"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} />
            </svg>
          </button>
        </div>
      </div>
      {open ? (
        <nav id="mobile-nav" aria-label="Mobile" className="flex flex-col gap-1 border-t border-glass-edge px-4 py-2 md:hidden">
          {links("")}
        </nav>
      ) : null}
    </header>
  );
}
