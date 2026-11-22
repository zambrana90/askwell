import { beforeEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const upsert = vi.fn<(row: unknown, options: { ignoreDuplicates: boolean }) => Promise<unknown>>();
const from = vi.fn(() => ({ upsert }));
vi.mock("../../lib/supabase/service", () => ({ createServiceClient: () => ({ from }) }));

import { ensureAccount } from "../../lib/accounts";

beforeEach(() => {
  upsert.mockReset();
  from.mockClear();
});

test("inserts a free account for a new user, never overwriting an existing row", async () => {
  upsert.mockResolvedValue({ error: null });
  await ensureAccount("user_123");
  expect(from).toHaveBeenCalledWith("accounts");
  expect(upsert).toHaveBeenCalledWith(
    { clerk_user_id: "user_123", plan: "free" },
    { onConflict: "clerk_user_id", ignoreDuplicates: true },
  );
});

test("an existing pro row is left alone: the call asks the database to ignore duplicates", async () => {
  upsert.mockResolvedValue({ error: null });
  await ensureAccount("user_pro");
  expect(upsert.mock.calls[0]?.[1].ignoreDuplicates).toBe(true);
});

test("a database error surfaces", async () => {
  upsert.mockResolvedValue({ error: { message: "boom" } });
  await expect(ensureAccount("user_123")).rejects.toThrow("ensureAccount failed: boom");
});
