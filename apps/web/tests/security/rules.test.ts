// @vitest-environment node
// Source checks that keep project.md §9 true as code is added.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = path.resolve(__dirname, "../../../..");

const files = [
  "apps/web/app",
  "apps/web/components",
  "apps/web/lib",
  "apps/widget/src",
  "packages/shared/src",
].flatMap((dir) =>
  readdirSync(path.join(ROOT, dir), { recursive: true, encoding: "utf8" })
    .map((file) => `${dir}/${file.split(path.sep).join("/")}`)
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.tsx?$/.test(file)),
);

const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");
const filesMatching = (pattern: RegExp) => files.filter((file) => pattern.test(read(file))).sort();

describe("§9 source rules", () => {
  test("the walker finds the sources", () => {
    expect(files).toEqual(expect.arrayContaining(["apps/web/lib/supabase/service.ts", "apps/widget/src/widget.ts"]));
  });

  // Adding a file here means checking that it proves ownership (or a signature, or uses the
  // public key only) before it writes. See project.md §9, "Tenant leak".
  test("only these files use the service client", () => {
    expect(filesMatching(/\bcreateServiceClient\b/)).toEqual([
      "apps/web/app/api/projects/[id]/knowledge/finalize/route.ts",
      "apps/web/app/api/projects/[id]/knowledge/upload-url/route.ts",
      "apps/web/app/api/projects/route.ts",
      "apps/web/lib/accounts.ts",
      "apps/web/lib/billing/plan.ts",
      "apps/web/lib/chat/process.ts",
      "apps/web/lib/chat/track.ts",
      "apps/web/lib/knowledge/process.ts",
      "apps/web/lib/knowledge/sources.ts",
      "apps/web/lib/supabase/service.ts",
      "apps/web/lib/widget/config.ts",
      "apps/web/lib/widget/save-config.ts",
    ]);
  });

  test("only the service client reads the Supabase secret key", () => {
    expect(filesMatching(/env(\.|\[["'`])SUPABASE_SECRET_KEY/)).toEqual(["apps/web/lib/supabase/service.ts"]);
    expect(read("apps/web/lib/supabase/service.ts")).toMatch(/^import "server-only";/);
  });

  test("no NEXT_PUBLIC_ variable beyond the public ones", () => {
    const names = new Set(files.flatMap((file) => read(file).match(/NEXT_PUBLIC_[A-Z0-9_]+/g) ?? []));
    expect([...names].sort()).toEqual([
      "NEXT_PUBLIC_APP_URL",
      "NEXT_PUBLIC_POSTHOG_HOST",
      "NEXT_PUBLIC_POSTHOG_KEY",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "NEXT_PUBLIC_SUPABASE_URL",
    ]);
  });

  test("the only raw HTML is the constant theme script", () => {
    expect(filesMatching(/dangerouslySetInnerHTML|\.(inner|outer)HTML\b|insertAdjacentHTML|document\.write\(/)).toEqual([
      "apps/web/app/dashboard/layout.tsx",
    ]);
    expect(read("apps/web/app/dashboard/layout.tsx").match(/dangerouslySetInnerHTML=\{[^\n]*/g)).toEqual([
      "dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />",
    ]);
  });

  test("postMessage is only sent from the two bridge files, never to any origin", () => {
    const senders = filesMatching(/\.postMessage\(/);
    expect(senders).toEqual(["apps/web/lib/embed/bridge.ts", "apps/widget/src/widget.ts"]);
    for (const file of senders) expect(read(file)).not.toMatch(/\.postMessage\([^;]*["'`]\*["'`]/);
  });

  test("every message listener checks event.origin", () => {
    const listeners = filesMatching(/addEventListener\(\s*["']message["']/);
    expect(listeners).toEqual(["apps/web/lib/embed/bridge.ts", "apps/widget/src/widget.ts"]);
    for (const file of listeners) expect(read(file)).toMatch(/event\.origin !== \w+/);
  });

  test("Storage files never get a public URL", () => {
    expect(filesMatching(/getPublicUrl/)).toEqual([]);
  });
});
