import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  KNOWLEDGE_SOURCE_STATUSES,
  KNOWLEDGE_SOURCE_TYPES,
  MESSAGE_ROLES,
  PLANS,
  WIDGET_ANIMATIONS,
  WIDGET_POSITIONS,
} from "@askwell/shared";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  MIGRATIONS_DIR,
  createStubDb,
  createTestDb,
  migrationFiles,
  queryAs,
  withRollback,
} from "./supabase-pglite";
import type { Session } from "./supabase-pglite";

const A = "user_A";
const B = "user_B";
const asA: Session = { role: "authenticated", sub: A };
const asB: Session = { role: "authenticated", sub: B };
const anon: Session = { role: "anon" };
const service: Session = { role: "service_role" };

const TABLES = [
  "accounts",
  "projects",
  "widget_configs",
  "knowledge_sources",
  "knowledge_chunks",
  "conversations",
  "messages",
] as const;

const vec = `[${Array.from({ length: 1536 }, () => 0.1).join(",")}]`;

// Fixed ids so the tests can point at them.
const PA = "00000000-0000-0000-0000-0000000000a1";
const PB = "00000000-0000-0000-0000-0000000000b1";
const SA = "00000000-0000-0000-0000-0000000000a2";
const SB = "00000000-0000-0000-0000-0000000000b2";
const CA = "00000000-0000-0000-0000-0000000000a3";
const CB = "00000000-0000-0000-0000-0000000000b3";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  // Seed as the schema owner (bypasses RLS). Two owners, one project each.
  await db.exec(`
    insert into accounts (clerk_user_id) values ('${A}'), ('${B}');
    insert into projects (id, owner_id, name, public_key) values
      ('${PA}', '${A}', 'Project A', 'pk_a'),
      ('${PB}', '${B}', 'Project B', 'pk_b');
    insert into widget_configs values
      ('${PA}', '#000000', 'bottom-right', 'Chat with us', 'fade', 'Ask us anything', true),
      ('${PB}', '#000000', 'bottom-right', 'Chat with us', 'fade', 'Ask us anything', true);
    insert into knowledge_sources (id, project_id, title, type, status) values
      ('${SA}', '${PA}', 'Doc A', 'text', 'ready'),
      ('${SB}', '${PB}', 'Doc B', 'text', 'ready');
    insert into knowledge_chunks (project_id, source_id, content, embedding) values
      ('${PA}', '${SA}', 'chunk a', '${vec}'),
      ('${PB}', '${SB}', 'chunk b', '${vec}');
    insert into conversations (id, project_id, visitor_id) values
      ('${CA}', '${PA}', 'v1'),
      ('${CB}', '${PB}', 'v2');
    insert into messages (conversation_id, role, body) values
      ('${CA}', 'visitor', 'hi a'), ('${CA}', 'bot', 'hello a'),
      ('${CB}', 'visitor', 'hi b');
  `);
});

afterAll(async () => {
  await db.close();
});

const count = async (session: Session, table: string, where = "true") => {
  const rows = await queryAs(db, session, `select count(*)::int as n from public.${table} where ${where}`);
  return rows[0]?.n;
};

describe("migration", () => {
  it("applies from empty and enables RLS on every public table", async () => {
    const rows = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' order by 1`,
    );
    expect(rows.rows.map((r) => r.relname).sort()).toEqual([...TABLES].sort());
    expect(rows.rows.every((r) => r.relrowsecurity)).toBe(true);
  });

  it("uses SECURITY DEFINER only on the two RLS helpers, and every function sets search_path", async () => {
    const sql = migrationFiles()
      .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
      .join("\n");
    const definers = sql.match(/security definer/gi) ?? [];
    expect(definers).toHaveLength(2);

    const fns = await db.query<{ proname: string; secdef: boolean; config: string[] | null }>(
      `select p.proname, p.prosecdef as secdef, p.proconfig as config
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'`,
    );
    expect(fns.rows.filter((f) => f.secdef).map((f) => f.proname).sort()).toEqual([
      "owned_conversation_ids",
      "owned_project_ids",
    ]);
    for (const f of fns.rows) {
      // match_chunks also pins hnsw.iterative_scan so the shared HNSW index can't hide a small project's chunks.
      const extra = f.proname === "match_chunks" ? ["hnsw.iterative_scan=strict_order"] : [];
      expect(f.config).toEqual(['search_path=""', ...extra]);
    }
  });

  it("starts period_start at the first of the current month (UTC)", async () => {
    const rows = await db.query<{ ok: boolean }>(
      `select period_start = date_trunc('month', now() at time zone 'utc') at time zone 'utc' as ok
       from projects where id = '${PA}'`,
    );
    expect(rows.rows[0]?.ok).toBe(true);
  });
});

describe("owner isolation (SELECT)", () => {
  const expectations: Record<(typeof TABLES)[number], { a: number; b: number; total: number }> = {
    accounts: { a: 1, b: 1, total: 2 },
    projects: { a: 1, b: 1, total: 2 },
    widget_configs: { a: 1, b: 1, total: 2 },
    knowledge_sources: { a: 1, b: 1, total: 2 },
    knowledge_chunks: { a: 1, b: 1, total: 2 },
    conversations: { a: 1, b: 1, total: 2 },
    messages: { a: 2, b: 1, total: 3 },
  };

  for (const table of TABLES) {
    it(`${table}: each owner sees only their own rows`, async () => {
      const e = expectations[table];
      expect(await count({ role: undefined }, table)).toBe(e.total);
      expect(await count(asA, table)).toBe(e.a);
      expect(await count(asB, table)).toBe(e.b);
      expect(await count({ role: "authenticated", sub: "someone_else" }, table)).toBe(0);
      expect(await count({ role: "authenticated" }, table)).toBe(0); // no JWT at all
    });
  }

  it("owner A never sees B's rows by id", async () => {
    expect(await count(asA, "projects", `id = '${PB}'`)).toBe(0);
    expect(await count(asA, "knowledge_sources", `id = '${SB}'`)).toBe(0);
    expect(await count(asA, "conversations", `id = '${CB}'`)).toBe(0);
    expect(await count(asA, "messages", `conversation_id = '${CB}'`)).toBe(0);
  });

  it("service_role bypasses RLS and sees everything", async () => {
    for (const t of TABLES) expect(await count(service, t)).toBeGreaterThanOrEqual(2);
  });
});

describe("anon gets nothing", () => {
  const pk: Record<(typeof TABLES)[number], string> = {
    accounts: "clerk_user_id",
    projects: "id",
    widget_configs: "project_id",
    knowledge_sources: "id",
    knowledge_chunks: "id",
    conversations: "id",
    messages: "id",
  };
  for (const table of TABLES) {
    it(`${table}: permission denied for select, insert, update, delete, truncate`, async () => {
      for (const sql of [
        `select * from public.${table}`,
        `insert into public.${table} default values`,
        `update public.${table} set ${pk[table]} = ${pk[table]}`,
        `delete from public.${table}`,
        `truncate public.${table}`,
      ]) {
        await expect(queryAs(db, anon, sql), sql).rejects.toThrow(/permission denied/i);
      }
    });
  }

  it("cannot execute the helpers", async () => {
    await expect(queryAs(db, anon, "select * from public.owned_project_ids()")).rejects.toThrow(
      /permission denied/i,
    );
    await expect(queryAs(db, anon, "select * from public.owned_conversation_ids()")).rejects.toThrow(
      /permission denied/i,
    );
  });
});

describe("authenticated writes", () => {
  it("cannot INSERT into any table", async () => {
    const inserts: Record<string, string> = {
      accounts: `insert into public.accounts (clerk_user_id) values ('${A}x')`,
      projects: `insert into public.projects (owner_id, name, public_key) values ('${A}', 'n', 'pk_new')`,
      widget_configs: `insert into public.widget_configs values (gen_random_uuid(), '#000000', 'bottom-right', 'l', 'fade', 'h', true)`,
      knowledge_sources: `insert into public.knowledge_sources (project_id, title, type, status) values ('${PA}', 't', 'text', 'ready')`,
      knowledge_chunks: `insert into public.knowledge_chunks (project_id, source_id, content, embedding) values ('${PA}', '${SA}', 'c', '${vec}')`,
      conversations: `insert into public.conversations (project_id, visitor_id) values ('${PA}', 'v')`,
      messages: `insert into public.messages (conversation_id, role, body) values ('${CA}', 'visitor', 'x')`,
    };
    for (const table of TABLES) {
      await expect(queryAs(db, asA, inserts[table] as string), table).rejects.toThrow(/permission denied/i);
    }
  });

  it("cannot UPDATE any table except projects.name", async () => {
    const updates: Record<string, string> = {
      accounts: `update public.accounts set plan = 'pro' where clerk_user_id = '${A}'`,
      widget_configs: `update public.widget_configs set label = 'x' where project_id = '${PA}'`,
      knowledge_sources: `update public.knowledge_sources set title = 'x' where id = '${SA}'`,
      knowledge_chunks: `update public.knowledge_chunks set content = 'x' where project_id = '${PA}'`,
      conversations: `update public.conversations set visitor_id = 'x' where id = '${CA}'`,
      messages: `update public.messages set body = 'x' where conversation_id = '${CA}'`,
    };
    for (const [table, sql] of Object.entries(updates)) {
      await expect(queryAs(db, asA, sql), table).rejects.toThrow(/permission denied/i);
    }
  });

  it("can rename their own project", async () => {
    await withRollback(db, async (run) => {
      const rows = await run(asA, `update public.projects set name = 'Renamed' where id = '${PA}' returning name`);
      expect(rows).toEqual([{ name: "Renamed" }]);
    });
  });

  it("cannot update other columns of their own project", async () => {
    for (const set of [
      "messages_used = 0",
      "owner_id = 'user_B'",
      "public_key = 'pk_hacked'",
      "period_start = now()",
      "created_at = now()",
      "id = gen_random_uuid()",
    ]) {
      await expect(
        queryAs(db, asA, `update public.projects set ${set} where id = '${PA}'`),
        set,
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it("cannot rename someone else's project (no row matches)", async () => {
    await withRollback(db, async (run) => {
      const rows = await run(asA, `update public.projects set name = 'Hijacked' where id = '${PB}' returning id`);
      expect(rows).toEqual([]);
      const name = await run({}, `select name from public.projects where id = '${PB}'`);
      expect(name).toEqual([{ name: "Project B" }]);
    });
  });

  it("cannot delete from any table except projects", async () => {
    for (const table of TABLES.filter((t) => t !== "projects")) {
      await expect(queryAs(db, asA, `delete from public.${table}`), table).rejects.toThrow(/permission denied/i);
    }
  });

  it("cannot delete someone else's project", async () => {
    await withRollback(db, async (run) => {
      const rows = await run(asA, `delete from public.projects where id = '${PB}' returning id`);
      expect(rows).toEqual([]);
      expect(await run({}, `select id from public.projects where id = '${PB}'`)).toHaveLength(1);
    });
  });

  it("can delete their own project, and the cascade removes its children", async () => {
    await withRollback(db, async (run) => {
      const del = await run(asA, `delete from public.projects where id = '${PA}' returning id`);
      expect(del).toHaveLength(1);
      const left = async (sql: string) => (await run({}, sql))[0]?.n;
      expect(await left(`select count(*)::int n from public.widget_configs where project_id = '${PA}'`)).toBe(0);
      expect(await left(`select count(*)::int n from public.knowledge_sources where project_id = '${PA}'`)).toBe(0);
      expect(await left(`select count(*)::int n from public.knowledge_chunks where project_id = '${PA}'`)).toBe(0);
      expect(await left(`select count(*)::int n from public.conversations where project_id = '${PA}'`)).toBe(0);
      expect(await left(`select count(*)::int n from public.messages where conversation_id = '${CA}'`)).toBe(0);
      // B is untouched.
      expect(await left(`select count(*)::int n from public.messages where conversation_id = '${CB}'`)).toBe(1);
    });
  });

  it("rejects a chunk whose project differs from its source's project", async () => {
    await withRollback(db, async (run) => {
      await expect(
        run(
          service,
          "insert into public.knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, 'x', $3)",
          [PB, SA, vec],
        ),
      ).rejects.toThrow(/foreign key/i);
      // Same project is fine.
      await run(
        service,
        "insert into public.knowledge_chunks (project_id, source_id, content, embedding) values ($1, $2, 'x', $3)",
        [PA, SA, vec],
      );
    });
  });

  it("deleting a source removes its chunks", async () => {
    await withRollback(db, async (run) => {
      await run(service, `delete from public.knowledge_sources where id = '${SA}'`);
      const rows = await run({}, `select count(*)::int n from public.knowledge_chunks where source_id = '${SA}'`);
      expect(rows[0]?.n).toBe(0);
    });
  });

  it("cannot TRUNCATE anything (authenticated or service_role)", async () => {
    for (const session of [asA, service]) {
      for (const table of TABLES) {
        await expect(queryAs(db, session, `truncate public.${table}`), table).rejects.toThrow(/permission denied/i);
      }
    }
  });
});

describe("helpers", () => {
  it("return only the caller's ids", async () => {
    expect(await queryAs(db, asA, "select * from public.owned_project_ids() as id")).toEqual([{ id: PA }]);
    expect(await queryAs(db, asB, "select * from public.owned_conversation_ids() as id")).toEqual([{ id: CB }]);
    expect(await queryAs(db, { role: "authenticated" }, "select * from public.owned_project_ids()")).toEqual([]);
  });
});

describe("future objects are not exposed", () => {
  it("a new table or function is not granted to anon/authenticated by default", async () => {
    const fresh = await createTestDb();
    try {
      await fresh.exec(`
        create table public.later (id int);
        create function public.later_fn() returns int language sql as 'select 1';
      `);
      await withRollback(fresh, async (run) => {
        for (const role of ["anon", "authenticated"] as const) {
          await expect(run({ role }, "select * from public.later")).rejects.toThrow(/permission denied/i);
          await expect(run({ role }, "select public.later_fn()")).rejects.toThrow(/permission denied/i);
        }
        expect(await run(service, "select * from public.later")).toEqual([]);
      });
    } finally {
      await fresh.close();
    }
  });
});

describe("CHECK constraints", () => {
  const insertAccount = (plan: string) =>
    db.query("insert into public.accounts (clerk_user_id, plan) values ($1, $2)", [`chk_${plan}`, plan]);

  it("accept every value in packages/shared", async () => {
    await withRollback(db, async (run) => {
      for (const plan of PLANS) {
        await run({}, "insert into public.accounts (clerk_user_id, plan) values ($1, $2)", [`ok_${plan}`, plan]);
      }
      for (const position of WIDGET_POSITIONS) {
        for (const animation of WIDGET_ANIMATIONS) {
          const id = (
            await run(
              {},
              "insert into public.projects (owner_id, name, public_key) values ($1, 'n', $2) returning id",
              [A, `pk_${position}_${animation}`],
            )
          )[0]?.id;
          await run({}, "insert into public.widget_configs values ($1, '#fff', $2, 'l', $3, 'h', true)", [
            id,
            position,
            animation,
          ]);
        }
      }
      for (const type of KNOWLEDGE_SOURCE_TYPES) {
        for (const status of KNOWLEDGE_SOURCE_STATUSES) {
          await run({}, "insert into public.knowledge_sources (project_id, title, type, status) values ($1, 't', $2, $3)", [
            PA,
            type,
            status,
          ]);
        }
      }
      for (const role of MESSAGE_ROLES) {
        await run({}, "insert into public.messages (conversation_id, role, body) values ($1, $2, 'x')", [CA, role]);
      }
    });
  });

  it("reject values that are not in packages/shared", async () => {
    await expect(insertAccount("enterprise")).rejects.toThrow(/check/i);
    await expect(
      db.query("insert into public.knowledge_sources (project_id, title, type, status) values ($1, 't', 'docx', 'ready')", [PA]),
    ).rejects.toThrow(/check/i);
    await expect(
      db.query("insert into public.knowledge_sources (project_id, title, type, status) values ($1, 't', 'text', 'done')", [PA]),
    ).rejects.toThrow(/check/i);
    await expect(
      db.query("insert into public.messages (conversation_id, role, body) values ($1, 'system', 'x')", [CA]),
    ).rejects.toThrow(/check/i);
    await expect(
      db.query("update public.widget_configs set position = 'middle' where project_id = $1", [PA]),
    ).rejects.toThrow(/check/i);
    await expect(
      db.query("update public.widget_configs set animation = 'spin' where project_id = $1", [PA]),
    ).rejects.toThrow(/check/i);
  });
});

describe("stub sanity", () => {
  it("createStubDb has the roles but no tables", async () => {
    const stub = await createStubDb();
    try {
      const r = await stub.query<{ n: number }>("select count(*)::int n from pg_tables where schemaname = 'public'");
      expect(r.rows[0]?.n).toBe(0);
    } finally {
      await stub.close();
    }
  });
});
