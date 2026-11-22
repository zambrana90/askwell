import { expect, test } from "vitest";
import { APP_NAME } from "./index";

test("APP_NAME is a non-empty string", () => {
  expect(typeof APP_NAME).toBe("string");
  expect(APP_NAME.length).toBeGreaterThan(0);
});
