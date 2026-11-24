import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, queryAs, withRollback } from "./supabase-pglite";
import type { Session } from "./supabase-pglite";

const service: Session = { role: "service_role" };
const P1 = "00000000-0000-0000-0000-000000000001";
const P2 = "00000000-0000-0000-0000-000000000002";

const RESERVE = `select * from public.reserve_knowledge_source($1, $2, $3, $4)`;
const CONSUME = `select public.consume_message($1, $2) as ok`;
const TURN = `select public.save_chat_turn($1, $2, $3, $4, $5) as id`;
const MATCH = `select * from public.match_chunks($1, $2::extensions.vector, $3)`;

/** A 1536-dim vector with one non-zero axis, as a pgvector literal. */
function vec(axis: number, other = 0): string {
  const v = new Array<number>(1536).fill(0);
  v[axis] = 1;
  if (other) v[axis + 1] = other;
  return `[${v.join(",")}]`;
}

let db: PGlite;
beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into accounts (clerk_user_id) values ('u1');
    insert into projects (id, owner_id, name, public_key) values
      ('${P1}', 'u1', 'One', 'pk1'), ('${P2}', 'u1', 'Two', 'pk2');
  `);
});
afterAll(async () => {
  await db.close();
});

describe("knowledge bucket", () => {
  it("is private with the size and type limits", async () => {
    const { rows } = await db.query(`select * from storage.buckets where id = 'knowledge'`);
    expect(rows[0]).toMatchObject({
      public: false,
      file_size_limit: 10485760,
      allowed_mime_types: ["application/pdf", "text/markdown", "text/plain"],
    });
  });
});

describe("reserve_knowledge_source", () => {
  it("refuses at p_max_sources, counting every status", async () => {
    await withRollback(db, async (run) => {
      await run(service, RESERVE, [P1, "a", "text", 2]);
      await run(service, RESERVE, [P1, "b", "pdf", 2]);
      await expect(run(service, RESERVE, [P1, "c", "md", 2])).rejects.toThrow("plan_limit");
      // another project is unaffected
      const [ok] = await run(service, RESERVE, [P2, "x", "txt", 2]);
      expect(ok).toBeDefined();
    });
  });

  it("raises P0001 for the limit", async () => {
    await withRollback(db, async (run) => {
      await expect(run(service, RESERVE, [P1, "a", "text", 0])).rejects.toMatchObject({ code: "P0001" });
    });
  });

  it("text → processing with no storage key; files → uploading with <project>/<id>.<type>", async () => {
    await withRollback(db, async (run) => {
      const [t] = await run(service, RESERVE, [P1, "Pasted", "text", 10]);
      expect(t).toMatchObject({ type: "text", status: "processing", storage_key: null, project_id: P1 });
      for (const type of ["pdf", "md", "txt"]) {
        const [f] = await run(service, RESERVE, [P1, "File", type, 10]);
        expect(f).toMatchObject({ type, status: "uploading", project_id: P1 });
        expect(f!.storage_key).toBe(`${P1}/${f!.id}.${type}`);
      }
    });
  });

  it("rejects an unknown project", async () => {
    await withRollback(db, async (run) => {
      await expect(
        run(service, RESERVE, ["00000000-0000-0000-0000-0000000000ff", "a", "text", 3]),
      ).rejects.toThrow("project_not_found");
    });
  });
});

describe("consume_message", () => {
  it("counts up to the limit, then returns false", async () => {
    await withRollback(db, async (run) => {
      expect((await run(service, CONSUME, [P1, 2]))[0]!.ok).toBe(true);
      expect((await run(service, CONSUME, [P1, 2]))[0]!.ok).toBe(true);
      expect((await run(service, CONSUME, [P1, 2]))[0]!.ok).toBe(false);
      const [p] = await run(service, `select messages_used from projects where id = $1`, [P1]);
      expect(p!.messages_used).toBe(2);
    });
  });

  it("resets on a new UTC month", async () => {
    await withRollback(db, async (run) => {
      await run(service, `update projects set messages_used = 50, period_start = '2020-01-01Z' where id = $1`, [P1]);
      expect((await run(service, CONSUME, [P1, 50]))[0]!.ok).toBe(true);
      const [p] = await run(service, `select messages_used, period_start >= date_trunc('month', now() at time zone 'utc') at time zone 'utc' as cur from projects where id = $1`, [P1]);
      expect(p).toMatchObject({ messages_used: 1, cur: true });
    });
  });

  it("returns false for an unknown project", async () => {
    await withRollback(db, async (run) => {
      expect((await run(service, CONSUME, ["00000000-0000-0000-0000-0000000000ff", 5]))[0]!.ok).toBe(false);
    });
  });
});

describe("save_chat_turn", () => {
  it("creates the conversation, then appends to it, bot after visitor", async () => {
    await withRollback(db, async (run) => {
      const [a] = await run(service, TURN, [P1, null, "v1", "hi", "hello"]);
      const id = a!.id as string;
      const [b] = await run(service, TURN, [P1, id, "v1", "more", "sure"]);
      expect(b!.id).toBe(id);
      const convs = await run(service, `select * from conversations`);
      expect(convs).toHaveLength(1);
      expect(convs[0]).toMatchObject({ project_id: P1, visitor_id: "v1" });
      const msgs = await run(service, `select role, body, created_at from messages order by created_at`);
      expect(msgs.map((m) => m.body)).toEqual(["hi", "hello", "more", "sure"]);
      expect(msgs.map((m) => m.role)).toEqual(["visitor", "bot", "visitor", "bot"]);
      const t = msgs.map((m) => (m.created_at as Date).getTime());
      expect(t[1]).toBeGreaterThan(t[0]!);
      expect(t[3]).toBeGreaterThan(t[2]!);
    });
  });

  it("refuses another project's or another visitor's conversation", async () => {
    await withRollback(db, async (run) => {
      const [a] = await run(service, TURN, [P1, null, "v1", "hi", "hello"]);
      const id = a!.id as string;
      await expect(run(service, TURN, [P2, id, "v1", "x", "y"])).rejects.toThrow("not_found");
      await expect(run(service, TURN, [P1, id, "v2", "x", "y"])).rejects.toThrow("not_found");
      await expect(
        run(service, TURN, [P1, "00000000-0000-0000-0000-0000000000ff", "v1", "x", "y"]),
      ).rejects.toThrow("not_found");
      const [n] = await run(service, `select count(*)::int as n from messages`);
      expect(n!.n).toBe(2);
    });
  });
});

describe("match_chunks", () => {
  async function seed(run: (s: Session, sql: string, p?: unknown[]) => Promise<unknown[]>) {
    const src = async (project: string, status: string) => {
      const [s] = (await run(
        service,
        `insert into knowledge_sources (project_id, title, type, status) values ($1, 't', 'text', $2) returning id`,
        [project, status],
      )) as { id: string }[];
      return s!.id;
    };
    const chunk = (project: string, source: string, content: string, v: string) =>
      run(service, `insert into knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, $3, $4)`, [project, source, content, v]);
    const ready = await src(P1, "ready");
    const processing = await src(P1, "processing");
    const failed = await src(P1, "failed");
    const other = await src(P2, "ready");
    await chunk(P1, ready, "exact", vec(0));
    await chunk(P1, ready, "close", vec(0, 1));
    await chunk(P1, ready, "far", vec(10));
    await chunk(P1, processing, "not-ready", vec(0));
    await chunk(P1, failed, "failed", vec(0));
    await chunk(P2, other, "other-project", vec(0));
    return ready;
  }

  it("orders by similarity, ignores other projects and non-ready sources", async () => {
    await withRollback(db, async (run) => {
      const ready = await seed(run as never);
      const rows = await run(service, MATCH, [P1, vec(0), 10]);
      expect(rows.map((r) => r.content)).toEqual(["exact", "close", "far"]);
      expect(rows[0]).toMatchObject({ source_id: ready });
      const sims = rows.map((r) => r.similarity as number);
      expect(sims[0]).toBeCloseTo(1);
      expect(sims[1]).toBeCloseTo(1 / Math.SQRT2, 3);
      expect(sims[2]).toBeCloseTo(0);
    });
  });

  it("respects p_match_count", async () => {
    await withRollback(db, async (run) => {
      await seed(run as never);
      expect(await run(service, MATCH, [P1, vec(0), 2])).toHaveLength(2);
    });
  });
});

describe("grants", () => {
  const calls: [string, unknown[]][] = [
    [RESERVE, [P1, "a", "text", 5]],
    [CONSUME, [P1, 5]],
    [TURN, [P1, null, "v1", "a", "b"]],
    [MATCH, [P1, vec(0), 5]],
  ];
  it.each(calls)("anon and authenticated cannot execute: %s", async (sql, params) => {
    await expect(queryAs(db, { role: "anon" }, sql, params)).rejects.toThrow(/permission denied/);
    await expect(queryAs(db, { role: "authenticated", sub: "u1" }, sql, params)).rejects.toThrow(/permission denied/);
  });

  it("every function is SECURITY INVOKER with an empty search_path", async () => {
    const { rows } = await db.query<{ proname: string; secdef: boolean; config: string[] }>(`
      select proname, prosecdef as secdef, proconfig as config from pg_proc
      where proname in ('reserve_knowledge_source','consume_message','save_chat_turn','match_chunks')`);
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.secdef).toBe(false);
      expect(r.config).toContain('search_path=""');
    }
  });
});
