import { describe, expect, test } from "vitest";
import {
  API_ERROR_CODES,
  API_ERROR_STATUS,
  DEFAULT_WIDGET_CONFIG,
  MAX_FILE_BYTES,
  MAX_MESSAGE_LENGTH,
  PLAN_LIMITS,
  PLAN_PRICES_USD_MONTHLY,
  apiError,
  applyPlanToConfig,
  createProjectRequestSchema,
  finalizeKnowledgeRequestSchema,
  idParamsSchema,
  pasteKnowledgeRequestSchema,
  renameProjectRequestSchema,
  updateConfigRequestSchema,
  uploadUrlRequestSchema,
  widgetChatRequestSchema,
  widgetConfigQuerySchema,
  widgetConfigSchema,
  type WidgetConfig,
} from "./index";

const uuid = "123e4567-e89b-42d3-a456-426614174000";
const ok = (r: { success: boolean }) => r.success;

describe("plans", () => {
  test("PLAN_LIMITS matches project.md §5", () => {
    expect(PLAN_LIMITS.free).toMatchObject({
      projects: 1,
      messagesPerMonth: 100,
      knowledgeSources: 3,
    });
    expect(PLAN_LIMITS.pro).toMatchObject({
      projects: 5,
      messagesPerMonth: 2000,
      knowledgeSources: 25,
    });
    expect(Object.values(PLAN_LIMITS.free.customize).every((v) => v === false)).toBe(true);
    expect(Object.values(PLAN_LIMITS.pro.customize).every((v) => v === true)).toBe(true);
  });

  test("prices", () => {
    expect(PLAN_PRICES_USD_MONTHLY).toEqual({ free: 0, pro: 19 });
  });
});

describe("applyPlanToConfig", () => {
  const custom: WidgetConfig = {
    buttonColor: "#ff0000",
    position: "top-left",
    label: "Help",
    animation: "scale",
    headerText: "Hi there",
    showBadge: false,
  };

  test("free gets defaults + badge", () => {
    expect(applyPlanToConfig(custom, "free")).toEqual(DEFAULT_WIDGET_CONFIG);
    expect(applyPlanToConfig(custom, "free").showBadge).toBe(true);
  });

  test("pro gets the saved config", () => {
    expect(applyPlanToConfig(custom, "pro")).toEqual(custom);
  });

  test("defaults are valid", () => {
    expect(ok(widgetConfigSchema.safeParse(DEFAULT_WIDGET_CONFIG))).toBe(true);
  });
});

describe("errors", () => {
  test("helper builds the body; every code has a status", () => {
    expect(apiError("not_found", "No such project")).toEqual({
      error: { code: "not_found", message: "No such project" },
    });
    for (const code of API_ERROR_CODES) expect(API_ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    expect(API_ERROR_STATUS.payment_required).toBe(402);
  });
});

describe("schemas", () => {
  test("widget config query", () => {
    expect(ok(widgetConfigQuerySchema.safeParse({ key: "pk_abc" }))).toBe(true);
    expect(ok(widgetConfigQuerySchema.safeParse({ key: "abc" }))).toBe(false);
    expect(ok(widgetConfigQuerySchema.safeParse({}))).toBe(false);
  });

  test("widget chat", () => {
    const valid = { key: "pk_abc", visitorId: "v1", message: "hello" };
    expect(ok(widgetChatRequestSchema.safeParse(valid))).toBe(true);
    expect(ok(widgetChatRequestSchema.safeParse({ ...valid, conversationId: uuid }))).toBe(true);
    expect(
      ok(widgetChatRequestSchema.safeParse({ ...valid, message: "x".repeat(MAX_MESSAGE_LENGTH + 1) })),
    ).toBe(false);
    expect(ok(widgetChatRequestSchema.safeParse({ ...valid, message: "   " }))).toBe(false);
    expect(ok(widgetChatRequestSchema.safeParse({ ...valid, conversationId: "nope" }))).toBe(false);
  });

  test("create and rename project", () => {
    for (const s of [createProjectRequestSchema, renameProjectRequestSchema]) {
      expect(ok(s.safeParse({ name: "My site" }))).toBe(true);
      expect(ok(s.safeParse({ name: "" }))).toBe(false);
      expect(ok(s.safeParse({ name: "x".repeat(81) }))).toBe(false);
    }
  });

  test("id params", () => {
    expect(ok(idParamsSchema.safeParse({ id: uuid }))).toBe(true);
    expect(ok(idParamsSchema.safeParse({ id: "1" }))).toBe(false);
  });

  test("paste knowledge", () => {
    expect(ok(pasteKnowledgeRequestSchema.safeParse({ title: "FAQ", text: "Hours: 9-5" }))).toBe(true);
    expect(ok(pasteKnowledgeRequestSchema.safeParse({ title: "", text: "x" }))).toBe(false);
    expect(
      ok(pasteKnowledgeRequestSchema.safeParse({ title: "FAQ", text: "x".repeat(100_001) })),
    ).toBe(false);
  });

  test("upload-url", () => {
    const valid = { fileName: "guide.pdf", size: 1024, mime: "application/pdf" };
    expect(ok(uploadUrlRequestSchema.safeParse(valid))).toBe(true);
    expect(ok(uploadUrlRequestSchema.safeParse({ fileName: "a.md", size: 5, mime: "text/markdown" }))).toBe(true);
    expect(ok(uploadUrlRequestSchema.safeParse({ ...valid, size: MAX_FILE_BYTES + 1 }))).toBe(false);
    expect(ok(uploadUrlRequestSchema.safeParse({ ...valid, size: 0 }))).toBe(false);
    expect(ok(uploadUrlRequestSchema.safeParse({ ...valid, mime: "image/png" }))).toBe(false);
    expect(ok(uploadUrlRequestSchema.safeParse({ ...valid, fileName: "guide.exe" }))).toBe(false);
    expect(ok(uploadUrlRequestSchema.safeParse({ ...valid, fileName: "GUIDE.PDF" }))).toBe(true);
    for (const [fileName, mime] of [
      ["pdf", "application/pdf"],
      ["md", "text/markdown"],
      ["txt", "text/plain"],
    ] as const) {
      expect(ok(uploadUrlRequestSchema.safeParse({ size: 1, fileName, mime }))).toBe(false);
    }
    expect(ok(uploadUrlRequestSchema.safeParse({ ...valid, fileName: "guide.txt" }))).toBe(false);
  });

  test("finalize", () => {
    expect(ok(finalizeKnowledgeRequestSchema.safeParse({ sourceId: uuid }))).toBe(true);
    expect(ok(finalizeKnowledgeRequestSchema.safeParse({ sourceId: "x" }))).toBe(false);
  });

  test("config PATCH is partial but not empty", () => {
    expect(ok(updateConfigRequestSchema.safeParse({ position: "top-right" }))).toBe(true);
    expect(ok(updateConfigRequestSchema.safeParse({ buttonColor: "#123abc", showBadge: false }))).toBe(true);
    expect(ok(updateConfigRequestSchema.safeParse({}))).toBe(false);
    expect(ok(updateConfigRequestSchema.safeParse({ position: "middle" }))).toBe(false);
    expect(ok(updateConfigRequestSchema.safeParse({ buttonColor: "red" }))).toBe(false);
    expect(ok(updateConfigRequestSchema.safeParse({ animation: "spin" }))).toBe(false);
  });
});
