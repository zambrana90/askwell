import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, queryAs } from "./supabase-pglite";
import type { Session } from "./supabase-pglite";

const PA = "00000000-0000-0000-0000-0000000000a1";
const PB = "00000000-0000-0000-0000-0000000000b1";
const asA: Session = { role: "authenticated", sub: "owner_a" };
const asB: Session = { role: "authenticated", sub: "owner_b" };
const anon: Session = { role: "anon" };
const service: Session = { role: "service_role" };
const ACTIVITY = (p: string) => `select * from public.owner_activity('${p}')`;

const conv = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let db: PGlite;
beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`
    insert into accounts (clerk_user_id) values ('owner_a'), ('owner_b');
    insert into projects (id, owner_id, name, public_key) values
      ('${PA}', 'owner_a', 'A', 'pkA'), ('${PB}', 'owner_b', 'B', 'pkB');
    -- three conversations for A, oldest first; c2 starts with a BOT message
    insert into conversations (id, project_id, visitor_id, created_at) values
      ('${conv(1)}', '${PA}', 'v1', '2026-01-01T10:00:00Z'),
      ('${conv(2)}', '${PA}', 'v2', '2026-01-02T10:00:00Z'),
      ('${conv(3)}', '${PA}', 'v3', '2026-01-03T10:00:00Z');
    insert into messages (conversation_id, role, body, created_at) values
      ('${conv(1)}', 'visitor', 'first question', '2026-01-01T10:00:00Z'),
      ('${conv(1)}', 'bot', 'answer', '2026-01-01T10:00:01Z'),
      ('${conv(1)}', 'visitor', 'second question', '2026-01-01T10:01:00Z'),
      ('${conv(2)}', 'bot', 'hello, ask me anything', '2026-01-02T10:00:00Z'),
      ('${conv(2)}', 'visitor', 'the first visitor message', '2026-01-02T10:00:05Z'),
      ('${conv(2)}', 'bot', 'reply', '2026-01-02T10:00:06Z'),
      ('${conv(3)}', 'visitor', '${"x".repeat(200)}', '2026-01-03T10:00:00Z');
    insert into conversations (id, project_id, visitor_id) values ('${conv(99)}', '${PB}', 'vb');
    insert into messages (conversation_id, role, body) values ('${conv(99)}', 'visitor', 'B secret');
  `);
});
afterAll(async () => {
  await db.close();
});

describe("owner_activity", () => {
  it("lists the project's conversations newest first", async () => {
    const rows = await queryAs(db, asA, ACTIVITY(PA));
    expect(rows.map((r) => r.id)).toEqual([conv(3), conv(2), conv(1)]);
    expect(rows[0]).toHaveProperty("visitor_id", "v3");
    expect(Object.keys(rows[0] as object)).toEqual(["id", "visitor_id", "created_at", "preview", "message_count"]);
  });

  it("previews the first visitor message (not a bot greeting) and cuts it to 120 characters", async () => {
    const rows = await queryAs(db, asA, ACTIVITY(PA));
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[conv(1)]?.preview).toBe("first question");
    expect(byId[conv(2)]?.preview).toBe("the first visitor message");
    expect(byId[conv(3)]?.preview).toBe("x".repeat(120));
  });

  it("a conversation with no visitor message has an empty preview, never null", async () => {
    await db.exec(`
      insert into conversations (id, project_id, visitor_id, created_at)
        values ('${conv(50)}', '${PA}', 'empty', '2026-01-04T10:00:00Z'),
               ('${conv(51)}', '${PA}', 'botonly', '2026-01-05T10:00:00Z');
      insert into messages (conversation_id, role, body, created_at)
        values ('${conv(51)}', 'bot', 'hi there', '2026-01-05T10:00:00Z');
    `);
    const rows = await queryAs(db, asA, ACTIVITY(PA));
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[conv(50)]).toMatchObject({ preview: "", message_count: 0 });
    expect(byId[conv(51)]).toMatchObject({ preview: "", message_count: 1 });
    await db.exec(`delete from conversations where id in ('${conv(50)}', '${conv(51)}')`);
  });

  it("counts every message, bot and visitor", async () => {
    const rows = await queryAs(db, asA, ACTIVITY(PA));
    const counts = Object.fromEntries(rows.map((r) => [r.id, r.message_count]));
    expect(counts).toEqual({ [conv(1)]: 3, [conv(2)]: 3, [conv(3)]: 1 });
    expect(typeof rows[0]?.message_count).toBe("number");
  });

  it("returns at most 100 conversations", async () => {
    await db.exec(`
      insert into conversations (project_id, visitor_id, created_at)
      select '${PA}', 'bulk' || g, '2026-02-01T00:00:00Z'::timestamptz + g * interval '1 minute'
      from generate_series(1, 110) g;
    `);
    const rows = await queryAs(db, asA, ACTIVITY(PA));
    expect(rows).toHaveLength(100);
    // newest first: the bulk rows are newer than the three seeded ones
    expect(rows[0]?.visitor_id).toBe("bulk110");
    await db.exec(`delete from conversations where visitor_id like 'bulk%'`);
  });

  it("another owner gets nothing for this project; the owner sees only their own", async () => {
    expect(await queryAs(db, asB, ACTIVITY(PA))).toEqual([]);
    expect(await queryAs(db, { role: "authenticated", sub: "nobody" }, ACTIVITY(PA))).toEqual([]);
    expect(await queryAs(db, { role: "authenticated" }, ACTIVITY(PA))).toEqual([]); // no JWT
    const b = await queryAs(db, asB, ACTIVITY(PB));
    expect(b).toHaveLength(1);
    expect(b[0]?.preview).toBe("B secret");
    expect(await queryAs(db, asA, ACTIVITY(PB))).toEqual([]);
  });

  it("anon cannot execute it", async () => {
    await expect(queryAs(db, anon, ACTIVITY(PA))).rejects.toThrow(/permission denied/i);
  });

  it("service_role can execute it", async () => {
    expect(await queryAs(db, service, ACTIVITY(PA))).toHaveLength(3);
  });

  it("is SECURITY INVOKER, stable, with an empty search_path", async () => {
    const [row] = (await db.query(
      `select prosecdef, provolatile, proconfig from pg_proc where proname = 'owner_activity'`,
    )).rows as { prosecdef: boolean; provolatile: string; proconfig: string[] }[];
    expect(row?.prosecdef).toBe(false);
    expect(row?.provolatile).toBe("s");
    expect(row?.proconfig).toContain('search_path=""');
  });
});
