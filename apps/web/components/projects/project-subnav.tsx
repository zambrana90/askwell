"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** A tab is current on its own page and on pages below it (a conversation thread). */
function isCurrent(pathname: string, href: string, base: string): boolean {
  return href === base ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function ProjectSubnav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/projects/${projectId}`;
  const items = [
    { label: "Overview", href: base },
    { label: "Knowledge", href: `${base}/knowledge` },
    { label: "Conversations", href: `${base}/conversations` },
    { label: "Install", href: `${base}/install` },
  ];
  return (
    <nav aria-label="Project" className="mb-6 flex gap-1 overflow-x-auto border-b border-glass-edge">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isCurrent(pathname, item.href, base) ? "page" : undefined}
          className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-ink-muted hover:text-ink aria-[current=page]:border-accent aria-[current=page]:text-ink"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
