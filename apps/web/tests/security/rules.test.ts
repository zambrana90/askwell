// @vitest-environment node
// Source checks that keep project.md §9 true as code is added.
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
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

const RAW_HTML = /dangerouslySetInnerHTML|\.(inner|outer)HTML\b|insertAdjacentHTML|document\.write\(/;

/**
 * Each `addEventListener("message", ...)` in a file, and whether its own callback starts with
 * `if (... event.origin !== x ...) return`. A callback defined in another file counts as
 * unguarded.
 */
function messageListeners(file: string, code: string): { file: string; line: number; guarded: boolean }[] {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = new Map<string, ts.FunctionLikeDeclaration>();
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const value = node.initializer;
      if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) functions.set(node.name.text, value);
    }
    if (ts.isCallExpression(node)) {
      const [type] = node.arguments;
      const name = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : node.expression.getText();
      if (name === "addEventListener" && type && ts.isStringLiteralLike(type) && type.text === "message") calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return calls.map((call) => {
    const callback = call.arguments[1];
    const fn =
      callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
        ? callback
        : callback && ts.isIdentifier(callback)
          ? functions.get(callback.text)
          : undefined;
    const event = fn?.parameters[0]?.name.getText();
    const first = fn?.body && ts.isBlock(fn.body) ? fn.body.statements[0] : undefined;
    const guarded =
      !!first &&
      ts.isIfStatement(first) &&
      ts.isReturnStatement(first.thenStatement) &&
      // An `||` chain: a foreign origin always returns.
      first.expression.getText().split("||").some((part) => part.trim().startsWith(`${event}.origin !== `));
    return { file, line: source.getLineAndCharacterOfPosition(call.getStart()).line + 1, guarded };
  });
}

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
    const layout = "apps/web/app/dashboard/layout.tsx";
    expect(filesMatching(RAW_HTML)).toEqual([layout]);
    // Take out the one allowed expression: nothing else in that file may write HTML.
    const allowed = "dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}";
    expect(read(layout)).toContain(allowed);
    expect(read(layout).replace(allowed, "")).not.toMatch(RAW_HTML);
  });

  test("postMessage is only sent from the two bridge files, never to any origin", () => {
    const senders = filesMatching(/\.postMessage\(/);
    expect(senders).toEqual(["apps/web/lib/embed/bridge.ts", "apps/widget/src/widget.ts"]);
    for (const file of senders) expect(read(file)).not.toMatch(/\.postMessage\([^;]*["'`]\*["'`]/);
  });

  test("every message listener checks event.origin before anything else", () => {
    const listeners = files.flatMap((file) => messageListeners(file, read(file)));
    expect(listeners.map((l) => l.file).sort()).toEqual(["apps/web/lib/embed/bridge.ts", "apps/widget/src/widget.ts"]);
    expect(listeners.filter((l) => !l.guarded)).toEqual([]);
    expect(filesMatching(/\bonmessage\s*=/)).toEqual([]);
  });

  test("the listener check judges each listener on its own", () => {
    const source = `
      const handler = (e: MessageEvent) => { if (e.origin !== host) return; use(e.data); };
      window.addEventListener("message", handler);
      window.addEventListener("message", (event) => { use(event.data); });
      window.addEventListener("message", (event) => { use(event.data); if (event.origin !== host) return; });
      window.addEventListener("message", imported);
    `;
    expect(messageListeners("x.ts", source).map((l) => l.guarded)).toEqual([true, false, false, false]);
  });

  test("Storage files never get a public URL", () => {
    expect(filesMatching(/getPublicUrl/)).toEqual([]);
  });
});
