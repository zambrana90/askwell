import { describe, expect, test } from "vitest";
import {
  buildEmbedUrl,
  EMBED_PATH,
  parseEmbedMessage,
  parseLoaderMessage,
  parsePanelMessage,
  VISITOR_ID_STORAGE_KEY,
  WIDGET_SCRIPT_PATH,
  type EmbedMessage,
} from "./embed";

const valid: EmbedMessage[] = [
  { type: "askwell:close" },
  { type: "askwell:resize", height: 480 },
  { type: "askwell:unread", count: 0 },
  { type: "askwell:unread", count: 3 },
  { type: "askwell:visibility", open: true },
  { type: "askwell:visibility", open: false },
];

describe("constants", () => {
  test("paths and storage key", () => {
    expect(EMBED_PATH).toBe("/embed");
    expect(WIDGET_SCRIPT_PATH).toBe("/widget.js");
    expect(VISITOR_ID_STORAGE_KEY.length).toBeGreaterThan(0);
  });
});

describe("parseEmbedMessage", () => {
  test.each(valid)("round-trips %j", (msg) => {
    expect(parseEmbedMessage(JSON.parse(JSON.stringify(msg)))).toEqual(msg);
  });

  const junk: [string, unknown][] = [
    ["null", null],
    ["undefined", undefined],
    ["a string", "askwell:close"],
    ["a number", 5],
    ["an array", [{ type: "askwell:close" }]],
    ["empty object", {}],
    ["unknown type", { type: "askwell:nope" }],
    ["no namespace", { type: "close" }],
    ["type not a string", { type: 1 }],
    ["close with extra field", { type: "askwell:close", extra: 1 }],
    ["resize missing height", { type: "askwell:resize" }],
    ["resize string height", { type: "askwell:resize", height: "480" }],
    ["resize NaN", { type: "askwell:resize", height: NaN }],
    ["resize Infinity", { type: "askwell:resize", height: Infinity }],
    ["resize zero", { type: "askwell:resize", height: 0 }],
    ["resize negative", { type: "askwell:resize", height: -1 }],
    ["resize extra field", { type: "askwell:resize", height: 1, x: 1 }],
    ["unread missing count", { type: "askwell:unread" }],
    ["unread string count", { type: "askwell:unread", count: "2" }],
    ["unread fraction", { type: "askwell:unread", count: 1.5 }],
    ["unread negative", { type: "askwell:unread", count: -1 }],
    ["unread extra field", { type: "askwell:unread", count: 1, x: 1 }],
    ["visibility missing open", { type: "askwell:visibility" }],
    ["visibility string open", { type: "askwell:visibility", open: "true" }],
    ["visibility number open", { type: "askwell:visibility", open: 1 }],
    ["visibility extra field", { type: "askwell:visibility", open: true, x: 1 }],
  ];

  test.each(junk)("returns null for %s", (_name, data) => {
    expect(parseEmbedMessage(data)).toBeNull();
  });

  test("does not throw on hostile objects", () => {
    const hostile = {
      get type(): string {
        return "askwell:close";
      },
    };
    expect(() => parseEmbedMessage(hostile)).not.toThrow();
    expect(parseEmbedMessage(Object.create(null))).toBeNull();
  });
});

describe("per-direction parsers", () => {
  test("panel parser accepts panel messages only", () => {
    expect(parsePanelMessage({ type: "askwell:close" })).toEqual({
      type: "askwell:close",
    });
    expect(parsePanelMessage({ type: "askwell:visibility", open: true })).toBeNull();
  });

  test("loader parser accepts loader messages only", () => {
    expect(parseLoaderMessage({ type: "askwell:visibility", open: true })).toEqual({
      type: "askwell:visibility",
      open: true,
    });
    expect(parseLoaderMessage({ type: "askwell:close" })).toBeNull();
    expect(parseLoaderMessage(null)).toBeNull();
  });
});

describe("buildEmbedUrl", () => {
  test("builds the url", () => {
    expect(buildEmbedUrl("https://app.example.com", "pk_abc", "https://site.com")).toBe(
      "https://app.example.com/embed?key=pk_abc&origin=https%3A%2F%2Fsite.com",
    );
  });

  test("encodes values", () => {
    const url = buildEmbedUrl("https://app.example.com", "a b&c=d#e", "http://x.com:3000");
    expect(url).toBe(
      "https://app.example.com/embed?key=a%20b%26c%3Dd%23e&origin=http%3A%2F%2Fx.com%3A3000",
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("key")).toBe("a b&c=d#e");
    expect(parsed.searchParams.get("origin")).toBe("http://x.com:3000");
  });

  test("ignores a trailing slash on the app origin", () => {
    expect(buildEmbedUrl("https://app.example.com/", "k", "https://s.com")).toMatch(
      /^https:\/\/app\.example\.com\/embed\?/,
    );
  });
});
