"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ProjectSubnav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/dashboard/projects/${projectId}`;
  const items = [
    { label: "Overview", href: base },
    { label: "Knowledge", href: `${base}/knowledge` },
    { label: "Install", href: `${base}/install` },
  ];
  return (
    <nav aria-label="Project" className="mb-6 flex gap-1 overflow-x-auto border-b border-glass-edge">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href ? "page" : undefined}
          className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-ink-muted hover:text-ink aria-[current=page]:border-accent aria-[current=page]:text-ink"
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
