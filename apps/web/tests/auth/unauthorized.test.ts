import { apiError, type ApiError } from "@askwell/shared";
import { expect, test } from "vitest";
import { unauthorizedResponse } from "../../lib/auth/unauthorized";

test("401 body matches the shared ApiError type", async () => {
  const res = unauthorizedResponse();
  expect(res.status).toBe(401);
  const body: ApiError = await res.json();
  expect(body).toEqual(apiError("unauthorized", "Sign in to use this endpoint."));
});
