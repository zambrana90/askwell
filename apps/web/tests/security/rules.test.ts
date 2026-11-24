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
 * The function an identifier names where it is used: the nearest enclosing scope that declares
 * the name wins. Anything but a local function (a parameter, an import) is undefined.
 */
function resolveFunction(use: ts.Identifier): ts.FunctionLikeDeclaration | undefined {
  const named = (name: ts.Node | undefined) => !!name && ts.isIdentifier(name) && name.text === use.text;
  for (let scope: ts.Node = use.parent; scope; scope = scope.parent) {
    if (ts.isFunctionLike(scope) && scope.parameters.some((p) => named(p.name))) return undefined;
    if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue;
    for (const statement of scope.statements) {
      if (ts.isFunctionDeclaration(statement) && named(statement.name)) return statement;
      if (!ts.isVariableStatement(statement)) continue;
      const declaration = statement.declarationList.declarations.find((d) => named(d.name));
      if (!declaration) continue;
      const value = declaration.initializer;
      return value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) ? value : undefined;
    }
  }
  return undefined;
}

/** Whether the condition is true for every foreign origin: `event.origin !== x`, alone or in `||`. */
function rejectsForeignOrigin(condition: ts.Expression, event: string): boolean {
  if (ts.isParenthesizedExpression(condition)) return rejectsForeignOrigin(condition.expression, event);
  if (!ts.isBinaryExpression(condition)) return false;
  const { left, right, operatorToken } = condition;
  if (operatorToken.kind === ts.SyntaxKind.BarBarToken) {
    return rejectsForeignOrigin(left, event) || rejectsForeignOrigin(right, event);
  }
  return (
    operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken &&
    left.getText() === `${event}.origin` &&
    ts.isIdentifier(right)
  );
}

/**
 * Each `addEventListener("message", ...)` in a file, and whether its own callback starts by
 * returning on a foreign `event.origin`. A callback defined in another file counts as unguarded.
 */
function messageListeners(file: string, code: string): { file: string; line: number; guarded: boolean }[] {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
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
          ? resolveFunction(callback)
          : undefined;
    const event = fn?.parameters[0]?.name.getText();
    const first = fn?.body && ts.isBlock(fn.body) ? fn.body.statements[0] : undefined;
    const guarded =
      !!event &&
      !!first &&
      ts.isIfStatement(first) &&
      ts.isReturnStatement(first.thenStatement) &&
      rejectsForeignOrigin(first.expression, event);
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

  const guards = (source: string) => messageListeners("x.ts", source).map((l) => l.guarded);

  test("the listener check judges each listener on its own", () => {
    expect(
      guards(`
        const handler = (e: MessageEvent) => { if (e.origin !== host) return; use(e.data); };
        window.addEventListener("message", handler);
        window.addEventListener("message", (event) => { if (!frame || (event.origin !== host)) return; });
        window.addEventListener("message", (event) => { use(event.data); });
        window.addEventListener("message", (event) => { use(event.data); if (event.origin !== host) return; });
        window.addEventListener("message", imported);
      `),
    ).toEqual([true, true, false, false, false]);
  });

  test("the listener check rejects a guard that lets some foreign messages through", () => {
    expect(
      guards(`
        window.addEventListener("message", (event) => { if (event.origin !== host && event.data === "x") return; });
        window.addEventListener("message", (event) => { if (a || (event.origin !== host && b)) return; });
        window.addEventListener("message", (event) => { if (!(event.origin !== host)) return; });
        window.addEventListener("message", (event) => { if (event.origin !== event.origin) return; });
      `),
    ).toEqual([false, false, false, false]);
  });

  test("the listener check resolves a callback name in its own scope", () => {
    const guarded = "(e: MessageEvent) => { if (e.origin !== host) return; }";
    const open = "(e: MessageEvent) => { use(e.data); }";
    const nested = (outer: string, inner: string) => `
      const handler = ${outer};
      function setup() { const handler = ${inner}; }
      window.addEventListener("message", handler);
    `;
    expect(guards(nested(open, guarded))).toEqual([false]);
    expect(guards(nested(guarded, open))).toEqual([true]);
    expect(guards(`const handler = ${guarded}; function on(handler: () => void) { window.addEventListener("message", handler); }`)).toEqual([false]);
  });

  test("Storage files never get a public URL", () => {
    expect(filesMatching(/getPublicUrl/)).toEqual([]);
  });
});
