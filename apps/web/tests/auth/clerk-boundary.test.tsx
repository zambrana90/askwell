import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => <div data-testid="clerk">{children}</div>,
  UserButton: () => <span>user</span>,
  Show: () => null,
}));
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: "user_1" }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), usePathname: () => "/dashboard" }));
vi.mock("../../lib/accounts", () => ({ ensureAccount: async () => undefined }));

import RootLayout from "../../app/layout";
import DashboardLayout from "../../app/dashboard/layout";
import SignInLayout from "../../app/sign-in/layout";
import SignUpLayout from "../../app/sign-up/layout";
import Home from "../../app/page";

const hasClerk = (html: string) => html.includes('data-testid="clerk"');

test("the root layout renders without ClerkProvider", () => {
  const html = renderToStaticMarkup(<RootLayout>child</RootLayout>);
  expect(html).toContain("child");
  expect(html).toContain('<html lang="en">');
  expect(hasClerk(html)).toBe(false);
});

test("landing, sign-in, sign-up and the dashboard each wrap themselves in ClerkProvider", async () => {
  expect(hasClerk(renderToStaticMarkup(<Home />))).toBe(true);
  expect(hasClerk(renderToStaticMarkup(<SignInLayout>x</SignInLayout>))).toBe(true);
  expect(hasClerk(renderToStaticMarkup(<SignUpLayout>x</SignUpLayout>))).toBe(true);
  expect(hasClerk(renderToStaticMarkup(await DashboardLayout({ children: "x" })))).toBe(true);
});

// Follow every relative import from the embed page and the root layout. None may reach Clerk.
function importGraph(entry: string): Map<string, string> {
  const seen = new Map<string, string>();
  const queue = [resolve(entry)];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    const src = readFileSync(file, "utf8");
    seen.set(file, src);
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g)) {
      const base = resolve(dirname(file), m[1]!);
      const next = [".ts", ".tsx", "/index.ts", "/index.tsx"].map((e) => base + e).find(existsSync);
      if (next) queue.push(next);
    }
  }
  return seen;
}

test.each(["../../app/embed/page.tsx", "../../app/layout.tsx"])(
  "%s has no Clerk anywhere in its import graph",
  (entry) => {
    const files = importGraph(join(__dirname, entry));
    expect(files.size).toBeGreaterThan(0);
    const offenders = [...files].filter(([, src]) => /@clerk\/|auth\/app-clerk-provider/.test(src)).map(([f]) => f);
    expect(offenders).toEqual([]);
  },
);
