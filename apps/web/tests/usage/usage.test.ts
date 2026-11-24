import { describe, expect, test } from "vitest";
import { atLimitMessage, currentUsage } from "../../lib/usage/usage";

const NOW = new Date("2026-11-24T12:00:00Z");

describe("currentUsage", () => {
  test("same month: the stored count", () => {
    expect(currentUsage({ messagesUsed: 7, periodStart: "2026-11-01T00:00:00+00:00" }, 100, NOW)).toEqual({
      used: 7,
      limit: 100,
      atLimit: false,
    });
  });

  test("previous month: 0, even if the stored count is high", () => {
    expect(currentUsage({ messagesUsed: 99, periodStart: "2026-10-01T00:00:00+00:00" }, 100, NOW)).toEqual({
      used: 0,
      limit: 100,
      atLimit: false,
    });
  });

  test("a previous period that is at the limit is not at the limit now", () => {
    expect(currentUsage({ messagesUsed: 100, periodStart: "2026-10-01T00:00:00Z" }, 100, NOW).atLimit).toBe(false);
  });

  test("at the limit, and over it", () => {
    const at = currentUsage({ messagesUsed: 100, periodStart: "2026-11-01T00:00:00Z" }, 100, NOW);
    expect(at).toEqual({ used: 100, limit: 100, atLimit: true });
    expect(currentUsage({ messagesUsed: 120, periodStart: "2026-11-01T00:00:00Z" }, 100, NOW).atLimit).toBe(true);
  });

  test("month boundary is UTC: the first instant of the month counts, the last of the previous does not", () => {
    const first = new Date("2026-12-01T00:00:00Z");
    expect(currentUsage({ messagesUsed: 5, periodStart: "2026-12-01T00:00:00Z" }, 100, first).used).toBe(5);
    expect(currentUsage({ messagesUsed: 5, periodStart: "2026-11-30T23:59:59Z" }, 100, first).used).toBe(0);
  });

  test("an unparseable period start counts as 0", () => {
    expect(currentUsage({ messagesUsed: 5, periodStart: "nope" }, 100, NOW).used).toBe(0);
  });
});

describe("atLimitMessage", () => {
  test("Free mentions the Pro limit; Pro does not offer an upgrade", () => {
    expect(atLimitMessage("free")).toBe(
      "The widget shows visitors a 'chat unavailable' message until next month. Upgrade for 2,000 per month.",
    );
    expect(atLimitMessage("pro")).not.toMatch(/Upgrade/);
  });
});
