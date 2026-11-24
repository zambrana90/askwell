import { beforeEach, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const upsert = vi.fn<(row: unknown, options: { ignoreDuplicates: boolean }) => { select: typeof select }>();
const select = vi.fn<(columns: string) => Promise<unknown>>();
const from = vi.fn(() => ({ upsert }));
const trackSignedUp = vi.fn();
vi.mock("../../lib/analytics/events", () => ({ trackSignedUp: (id: string) => trackSignedUp(id) }));
vi.mock("../../lib/supabase/service", () => ({ createServiceClient: () => ({ from }) }));

import { ensureAccount } from "../../lib/accounts";

beforeEach(() => {
  upsert.mockReset().mockReturnValue({ select });
  select.mockReset().mockResolvedValue({ data: [], error: null });
  trackSignedUp.mockReset();
  from.mockClear();
});

test("inserts a free account for a new user, never overwriting an existing row", async () => {
  await ensureAccount("user_123");
  expect(from).toHaveBeenCalledWith("accounts");
  expect(upsert).toHaveBeenCalledWith(
    { clerk_user_id: "user_123", plan: "free" },
    { onConflict: "clerk_user_id", ignoreDuplicates: true },
  );
});

test("an existing pro row is left alone: the call asks the database to ignore duplicates", async () => {
  await ensureAccount("user_pro");
  expect(upsert.mock.calls[0]?.[1].ignoreDuplicates).toBe(true);
});

test("a database error surfaces", async () => {
  select.mockResolvedValue({ data: null, error: { message: "boom" } });
  await expect(ensureAccount("user_123")).rejects.toThrow("ensureAccount failed: boom");
});

test("signed_up once, when the row is created", async () => {
  select.mockResolvedValue({ data: [{ clerk_user_id: "user_new" }], error: null });
  await ensureAccount("user_new");
  expect(trackSignedUp.mock.calls).toEqual([["user_new"]]);
});

test("no signed_up for an existing account or a failed insert", async () => {
  await ensureAccount("user_old");
  select.mockResolvedValue({ data: null, error: { message: "boom" } });
  await expect(ensureAccount("user_x")).rejects.toThrow();
  expect(trackSignedUp).not.toHaveBeenCalled();
});
