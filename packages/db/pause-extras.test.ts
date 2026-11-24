import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, queryAs, withRollback } from "./supabase-pglite";
import type { Session } from "./supabase-pglite";

const service: Session = { role: "service_role" };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ACTIVE = `select public.project_is_active($1, $2) as active`;
const MATCH = `select * from public.match_chunks_active($1, $2::extensions.vector, $3, $4)`;

function vec(axis: number): string {
  const v = new Array<number>(1536).fill(0);
  v[axis] = 1;
  return `[${v.join(",")}]`;
}

let db: PGlite;
beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`insert into accounts (clerk_user_id) values ('owner'), ('other');`);
});
afterAll(async () => {
  await db.close();
});

describe("project_is_active", () => {
  // Owner's projects, oldest first: P1 (Jan 1), P2 (Jan 2), P3 and P4 tied on Jan 3 (ids 3 < 4), P5 (Jan 4).
  // The other owner has five older projects that must not count.
  async function seed(run: (s: Session, sql: string, p?: unknown[]) => Promise<unknown[]>) {
    const add = (n: number, owner: string, at: string) =>
      run(service, `insert into projects (id, owner_id, name, public_key, created_at) values ($1, $2, $3, $4, $5)`, [
        id(n), owner, `p${n}`, `pk${n}`, at,
      ]);
    await add(5, "owner", "2026-01-04T00:00:00Z");
    await add(4, "owner", "2026-01-03T00:00:00Z");
    await add(3, "owner", "2026-01-03T00:00:00Z");
    await add(2, "owner", "2026-01-02T00:00:00Z");
    await add(1, "owner", "2026-01-01T00:00:00Z");
    for (let n = 11; n <= 15; n++) await add(n, "other", "2025-12-01T00:00:00Z");
  }
  const active = async (run: (s: Session, sql: string, p?: unknown[]) => Promise<Record<string, unknown>[]>, n: number, max: number) =>
    (await run(service, ACTIVE, [id(n), max]))[0]?.active;

  it("the oldest N are active, the rest paused (boundary)", async () => {
    await withRollback(db, async (run) => {
      await seed(run as never);
      for (const [n, expected] of [[1, true], [2, true], [3, false], [4, false], [5, false]] as const) {
        expect(await active(run as never, n, 2), `project ${n}, max 2`).toBe(expected);
      }
      for (const n of [1, 2, 3, 4, 5]) expect(await active(run as never, n, 5), `project ${n}, max 5`).toBe(true);
    });
  });

  it("ties on created_at are broken by id", async () => {
    await withRollback(db, async (run) => {
      await seed(run as never);
      // max 3: P1, P2 and then P3 (id 3) beats P4 (id 4), although both were created at the same time.
      expect(await active(run as never, 3, 3)).toBe(true);
      expect(await active(run as never, 4, 3)).toBe(false);
      expect(await active(run as never, 4, 4)).toBe(true);
    });
  });

  it("other owners' projects don't count", async () => {
    await withRollback(db, async (run) => {
      await seed(run as never);
      // The other owner has 5 older projects; they must not push the owner's P1 out of the top 1.
      expect(await active(run as never, 1, 1)).toBe(true);
      expect(await active(run as never, 2, 1)).toBe(false);
      expect(await active(run as never, 11, 1)).toBe(true);
      expect(await active(run as never, 12, 1)).toBe(false);
    });
  });

  it("a limit below 1 and an unknown project are never active", async () => {
    await withRollback(db, async (run) => {
      await seed(run as never);
      expect(await active(run as never, 1, 0)).toBe(false);
      expect(await active(run as never, 1, -3)).toBe(false);
      expect(await active(run as never, 99, 5)).toBe(false);
    });
  });
});

describe("match_chunks_active", () => {
  const P1 = id(1);
  const P2 = id(2);
  async function seed(run: (s: Session, sql: string, p?: unknown[]) => Promise<unknown[]>) {
    await run(service, `insert into projects (id, owner_id, name, public_key) values ($1,'owner','One','pk1'), ($2,'owner','Two','pk2')`, [P1, P2]);
    const src = async (project: string, n: number, status: string) => {
      const [s] = (await run(
        service,
        `insert into knowledge_sources (project_id, title, type, status, created_at) values ($1, $2, 'text', $3, $4) returning id`,
        [project, `s${n}`, status, `2026-01-0${n}T00:00:00Z`],
      )) as { id: string }[];
      return s!.id;
    };
    const chunk = (project: string, source: string, content: string, v: string) =>
      run(service, `insert into knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, $3, $4)`, [project, source, content, v]);
    const s1 = await src(P1, 1, "ready");
    const s2 = await src(P1, 2, "failed"); // counts when ranking, never searched
    const s3 = await src(P1, 3, "ready");
    const s4 = await src(P1, 4, "ready"); // the 4th source: paused when the max is 3
    const other = await src(P2, 1, "ready");
    await chunk(P1, s1, "from-1", vec(0));
    await chunk(P1, s2, "from-2-failed", vec(0));
    await chunk(P1, s3, "from-3", vec(0));
    await chunk(P1, s4, "from-4", vec(0));
    await chunk(P2, other, "other-project", vec(0));
    return { s1, s3, s4 };
  }

  it("excludes chunks of sources past the max, counting every status when ranking", async () => {
    await withRollback(db, async (run) => {
      await seed(run as never);
      const rows = await run(service, MATCH, [P1, vec(0), 10, 3]);
      // oldest 3 = s1, s2 (failed, not searched), s3; s4 is paused
      expect(rows.map((r) => r.content).sort()).toEqual(["from-1", "from-3"]);
      expect((await run(service, MATCH, [P1, vec(0), 10, 4])).map((r) => r.content).sort()).toEqual(["from-1", "from-3", "from-4"]);
      expect(await run(service, MATCH, [P1, vec(0), 10, 0])).toEqual([]);
    });
  });

  it("is cross-project safe", async () => {
    await withRollback(db, async (run) => {
      await seed(run as never);
      const rows = await run(service, MATCH, [P1, vec(0), 10, 99]);
      expect(rows.map((r) => r.content)).not.toContain("other-project");
      expect((await run(service, MATCH, [P2, vec(0), 10, 3])).map((r) => r.content)).toEqual(["other-project"]);
    });
  });

  it("returns the same columns and order as match_chunks, and respects p_match_count", async () => {
    await withRollback(db, async (run) => {
      await seed(run as never);
      await run(service, `insert into knowledge_chunks (project_id, source_id, content, embedding)
        select $1, id, 'near', $2 from knowledge_sources where project_id = $1 and title = 's1'`, [P1, vec(1)]);
      const rows = await run(service, MATCH, [P1, vec(0), 10, 3]);
      expect(Object.keys(rows[0]!)).toEqual(["id", "source_id", "content", "similarity"]);
      expect(rows.at(-1)?.content).toBe("near"); // furthest last
      expect(rows[0]?.similarity as number).toBeCloseTo(1);
      expect(await run(service, MATCH, [P1, vec(0), 1, 3])).toHaveLength(1);
      const plain = await run(service, `select * from public.match_chunks($1, $2::extensions.vector, 10)`, [P1, vec(0)]);
      expect(plain.length).toBeGreaterThan(rows.length - 1); // match_chunks is unchanged and sees all ready sources
    });
  });
});

describe("grants", () => {
  const calls: [string, unknown[]][] = [
    [ACTIVE, [id(1), 1]],
    [MATCH, [id(1), vec(0), 5, 3]],
  ];
  it.each(calls)("anon and authenticated cannot execute: %s", async (sql, params) => {
    await expect(queryAs(db, { role: "anon" }, sql, params)).rejects.toThrow(/permission denied/);
    await expect(queryAs(db, { role: "authenticated", sub: "owner" }, sql, params)).rejects.toThrow(/permission denied/);
  });

  it("service_role can execute both", async () => {
    await expect(queryAs(db, service, ACTIVE, [id(1), 1])).resolves.toBeDefined();
    await expect(queryAs(db, service, MATCH, [id(1), vec(0), 5, 3])).resolves.toEqual([]);
  });

  it("both are SECURITY INVOKER, stable, with an empty search_path", async () => {
    const { rows } = await db.query<{ proname: string; secdef: boolean; vol: string; config: string[] }>(`
      select proname, prosecdef as secdef, provolatile as vol, proconfig as config from pg_proc
      where proname in ('project_is_active', 'match_chunks_active') order by proname`);
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.secdef, r.proname).toBe(false);
      expect(r.vol, r.proname).toBe("s");
      expect(r.config, r.proname).toContain('search_path=""');
    }
  });
});
