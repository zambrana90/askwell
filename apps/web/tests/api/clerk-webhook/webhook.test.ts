import { NextRequest } from "next/server";
import { Webhook } from "svix";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const trackUpgraded = vi.fn();
vi.mock("../../../lib/analytics/events", () => ({
  trackUpgraded: (id: string) => trackUpgraded(id),
  trackSignedUp: () => undefined,
}));

// A small accounts table behind the service client, with the filters the code uses.
const accounts = new Map<string, string>();
let dbError: { message: string } | null = null;
const writes = vi.fn();
vi.mock("../../../lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      upsert: (row: { clerk_user_id: string; plan: string }) => ({
        select: async () => {
          writes();
          if (dbError) return { data: null, error: dbError };
          if (accounts.has(row.clerk_user_id)) return { data: [], error: null };
          accounts.set(row.clerk_user_id, row.plan);
          return { data: [row], error: null };
        },
      }),
      update: ({ plan }: { plan: string }) => {
        let id = "";
        const query = {
          eq: (_c: string, value: string) => ((id = value), query),
          neq: () => query,
          select: async () => {
            writes();
            if (!accounts.has(id) || accounts.get(id) === plan) return { data: [], error: null };
            accounts.set(id, plan);
            return { data: [{ clerk_user_id: id }], error: null };
          },
        };
        return query;
      },
    }),
  }),
}));

import { POST } from "../../../app/api/clerk/webhook/route";

const SECRET = `whsec_${Buffer.from("a test signing secret of 32 bytes").toString("base64")}`;

const item = (type: string, over: { slug?: string; payer?: Record<string, string> } = {}) => ({
  type,
  object: "event",
  data: {
    id: "csi_1",
    object: "commerce_subscription_item",
    status: type.split(".")[1],
    plan: { slug: over.slug ?? "pro" },
    payer: over.payer ?? { user_id: "user_1" },
  },
});

function request(payload: unknown, { secret = SECRET, signed = true, body }: { secret?: string; signed?: boolean; body?: string } = {}) {
  const json = JSON.stringify(payload);
  const id = "msg_1";
  const now = new Date();
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signed) {
    headers["svix-id"] = id;
    headers["svix-timestamp"] = String(Math.floor(now.getTime() / 1000));
    headers["svix-signature"] = new Webhook(secret).sign(id, now, json);
  }
  return new NextRequest("http://localhost/api/clerk/webhook", { method: "POST", headers, body: body ?? json });
}

beforeEach(() => {
  accounts.clear();
  accounts.set("user_1", "free");
  dbError = null;
  writes.mockClear();
  trackUpgraded.mockReset();
  vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", SECRET);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("POST /api/clerk/webhook", () => {
  test.each([
    ["unsigned", () => request(item("subscriptionItem.active"), { signed: false })],
    ["signed with another secret", () => request(item("subscriptionItem.active"), { secret: `whsec_${Buffer.from("some other secret, also 32 bytes!").toString("base64")}` })],
    ["a changed body", () => request(item("subscriptionItem.active"), { body: JSON.stringify(item("subscriptionItem.active", { payer: { user_id: "user_evil" } })) })],
  ])("400 and nothing written when %s", async (_name, make) => {
    const res = await POST(make());
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("validation_error");
    expect(writes).not.toHaveBeenCalled();
    expect(accounts.get("user_1")).toBe("free");
  });

  test("400 when the signing secret is not configured", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SIGNING_SECRET", "");
    expect((await POST(request(item("subscriptionItem.active")))).status).toBe(400);
    expect(writes).not.toHaveBeenCalled();
  });

  test("an active Pro item gives pro and sends upgraded once", async () => {
    expect((await POST(request(item("subscriptionItem.active")))).status).toBe(200);
    expect(accounts.get("user_1")).toBe("pro");
    expect(trackUpgraded.mock.calls).toEqual([["user_1"]]);
  });

  test("a replay changes nothing and doesn't send upgraded again", async () => {
    await POST(request(item("subscriptionItem.active")));
    expect((await POST(request(item("subscriptionItem.active")))).status).toBe(200);
    expect(accounts.get("user_1")).toBe("pro");
    expect(trackUpgraded).toHaveBeenCalledTimes(1);
  });

  test("an ended Pro item gives free, also when replayed", async () => {
    accounts.set("user_1", "pro");
    await POST(request(item("subscriptionItem.ended")));
    expect((await POST(request(item("subscriptionItem.ended")))).status).toBe(200);
    expect(accounts.get("user_1")).toBe("free");
    expect(trackUpgraded).not.toHaveBeenCalled();
  });

  test.each(["subscriptionItem.canceled", "subscriptionItem.pastDue", "subscriptionItem.upcoming", "subscription.active", "user.created"])(
    "%s leaves the plan unchanged",
    async (type) => {
      accounts.set("user_1", "pro");
      expect((await POST(request(item(type)))).status).toBe(200);
      expect(accounts.get("user_1")).toBe("pro");
      expect(writes).not.toHaveBeenCalled();
    },
  );

  test.each([
    ["another plan becoming active", item("subscriptionItem.active", { slug: "free_user" })],
    ["another plan ending", item("subscriptionItem.ended", { slug: "free_user" })],
    ["an organization payer", item("subscriptionItem.active", { payer: { organization_id: "org_1" } })],
  ])("200 and ignored: %s", async (_name, payload) => {
    expect((await POST(request(payload))).status).toBe(200);
    expect(writes).not.toHaveBeenCalled();
    expect(trackUpgraded).not.toHaveBeenCalled();
  });

  test("creates a missing accounts row", async () => {
    await POST(request(item("subscriptionItem.active", { payer: { user_id: "user_new" } })));
    expect(accounts.get("user_new")).toBe("pro");
    expect(trackUpgraded.mock.calls).toEqual([["user_new"]]);
  });

  test("500 on a database error, so Clerk retries", async () => {
    dbError = { message: "boom" };
    const res = await POST(request(item("subscriptionItem.active")));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("internal");
    expect(trackUpgraded).not.toHaveBeenCalled();
  });
});
