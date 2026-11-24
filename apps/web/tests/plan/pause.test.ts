import { describe, expect, test } from "vitest";
import { pausedIds, pausedProjectNote, pausedSourceNote } from "../../lib/plan/pause";

const it = (id: string, createdAt: string) => ({ id, createdAt });
const A = it("a", "2026-01-01T00:00:00+00:00");
const B = it("b", "2026-01-02T00:00:00+00:00");
const C = it("c", "2026-01-03T00:00:00+00:00");
const D = it("d", "2026-01-03T00:00:00+00:00"); // same time as C: id breaks the tie

describe("pausedIds", () => {
  test("boundary: everything after the oldest `limit` is paused", () => {
    expect([...pausedIds([A, B, C], 1)].sort()).toEqual(["b", "c"]);
    expect([...pausedIds([A, B, C], 2)]).toEqual(["c"]);
    expect([...pausedIds([A, B, C], 3)]).toEqual([]);
  });

  test("order of the input does not matter (the list may be newest first)", () => {
    expect([...pausedIds([C, B, A], 2)]).toEqual(["c"]);
    expect([...pausedIds([B, C, A], 1)].sort()).toEqual(["b", "c"]);
  });

  test("ties on created_at are broken by id", () => {
    expect([...pausedIds([D, C, B, A], 3)]).toEqual(["d"]);
    expect([...pausedIds([C, D, B, A], 4)]).toEqual([]);
    expect([...pausedIds([D, C], 1)]).toEqual(["d"]);
  });

  test("microsecond differences inside one millisecond still order", () => {
    const x = it("z", "2026-01-01T00:00:00.123456+00:00");
    const y = it("a", "2026-01-01T00:00:00.123789+00:00");
    expect([...pausedIds([y, x], 1)]).toEqual(["a"]); // x is older, so y is paused even though its id sorts first
  });

  test("limit >= count: nothing paused; limit 0 or negative: everything paused", () => {
    expect(pausedIds([A, B], 2).size).toBe(0);
    expect(pausedIds([A, B], 99).size).toBe(0);
    expect(pausedIds([], 1).size).toBe(0);
    expect([...pausedIds([A, B], 0)].sort()).toEqual(["a", "b"]);
    expect([...pausedIds([A, B], -2)].sort()).toEqual(["a", "b"]);
  });

  test("does not mutate its input", () => {
    const list = [C, A, B];
    pausedIds(list, 1);
    expect(list).toEqual([C, A, B]);
  });
});

describe("notes", () => {
  test("Free is offered an upgrade; Pro is not", () => {
    expect(pausedProjectNote("Free", 1)).toBe(
      "Your Free plan includes 1 active project. Upgrade or delete projects to turn this one back on.",
    );
    expect(pausedProjectNote("Pro", 5)).toBe("Your Pro plan includes 5 active projects. Delete projects to turn this one back on.");
    expect(pausedSourceNote("Free", 3)).toBe(
      "Your Free plan uses 3 sources per project for answers. Upgrade or delete sources to use this one again.",
    );
    expect(pausedSourceNote("Pro", 25)).not.toMatch(/Upgrade/);
  });
});
