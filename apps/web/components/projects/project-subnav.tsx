"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CLICKABLE_INSET } from "../ui/interactive";

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
    { label: "Customize", href: `${base}/customize` },
    { label: "Install", href: `${base}/install` },
  ];
  return (
    <nav aria-label="Project" className="mb-6 flex flex-wrap gap-1 border-b border-glass-edge">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isCurrent(pathname, item.href, base) ? "page" : undefined}
          className={`inline-flex min-h-10 items-center whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-ink-muted ${CLICKABLE_INSET} hover:border-ink/40 hover:bg-ink/10 hover:text-ink active:bg-ink/20 aria-[current=page]:border-accent aria-[current=page]:text-ink aria-[current=page]:hover:border-accent`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
