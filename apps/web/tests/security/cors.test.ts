// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

// The only routes another origin may call (project.md §9). Every other route, new ones
// included, must send no CORS header at all.
const PUBLIC_CORS = ["widget/chat/route.ts", "widget/config/route.ts"];

const WEB = path.resolve(__dirname, "../..");
const API = path.join(WEB, "app/api");

const routes = readdirSync(API, { recursive: true, encoding: "utf8" })
  .map((file) => file.split(path.sep).join("/"))
  .filter((file) => /(^|\/)route\.(ts|tsx|js)$/.test(file))
  .sort();

/** The file and every local module it imports, so a header set in a shared helper counts too. */
function sources(entry: string, seen = new Map<string, string>()): Map<string, string> {
  if (seen.has(entry)) return seen;
  const code = readFileSync(entry, "utf8");
  seen.set(entry, code);
  for (const [, specifier = ""] of code.matchAll(/(?:from\s+|import\s*\(?\s*)["']((?:\.|@\/)[^"']*)["']/g)) {
    const base = specifier.startsWith("@/")
      ? path.join(WEB, specifier.slice(2))
      : path.resolve(path.dirname(entry), specifier);
    const found = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]
      .map((suffix) => base + suffix)
      .find((file) => /\.(ts|tsx|js)$/.test(file) && existsSync(file));
    if (!found) throw new Error(`cannot resolve ${specifier} from ${entry}`);
    sources(found, seen);
  }
  return seen;
}

const filesWithCors = (entry: string) =>
  [...sources(entry)]
    .filter(([, code]) => /access-control-/i.test(code))
    .map(([file]) => path.relative(WEB, file));

describe("CORS", () => {
  test("the walker finds the routes", () => {
    expect(routes).toEqual(expect.arrayContaining([...PUBLIC_CORS, "projects/route.ts"]));
  });

  test.each(routes.filter((route) => !PUBLIC_CORS.includes(route)))("api/%s sends no CORS header", (route) => {
    expect(filesWithCors(path.join(API, route))).toEqual([]);
  });

  test.each(["proxy.ts", "next.config.ts"])("%s adds no CORS header", (file) => {
    expect(filesWithCors(path.join(WEB, file))).toEqual([]);
  });

  test.each(PUBLIC_CORS)("api/%s allows any origin without credentials", async (route) => {
    const mod: { OPTIONS: () => Response } = await import(/* @vite-ignore */ path.join(API, route));
    const res = mod.OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-credentials")).toBeNull();
    expect(filesWithCors(path.join(API, route)).length).toBeGreaterThan(0);
    for (const code of sources(path.join(API, route)).values()) {
      expect(code).not.toMatch(/access-control-allow-credentials/i);
    }
  });
});
