import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createStubDb, MIGRATIONS_DIR, migrationFiles, withRollback } from "./supabase-pglite";
import type { RunAs, Session } from "./supabase-pglite";

const MIGRATION = "20261125120000_chunk_scan_budget.sql";
const service: Session = { role: "service_role" };
const BIG = "00000000-0000-0000-0000-000000000001";
const SMALL = "00000000-0000-0000-0000-000000000002";

/** A 1536-dim pgvector literal: `first` on axis 0, `second` on axis `axis`. */
function vec(first: number, axis = 1, second = 0): string {
  const v = new Array<number>(1536).fill(0);
  v[0] = first;
  v[axis] = second;
  return `[${v.join(",")}]`;
}
const QUERY = vec(1);

const CALLS = [
  { name: "match_chunks", sql: `select content from public.match_chunks($1, $2::extensions.vector, 5)` },
  { name: "match_chunks_active", sql: `select content from public.match_chunks_active($1, $2::extensions.vector, 5, 25)` },
];

const FUNCTIONS = `
  select p.proname, pg_get_function_arguments(p.oid) as args, pg_get_function_result(p.oid) as result,
         p.prosecdef, p.provolatile, pg_get_userbyid(p.proowner) as owner, p.proacl::text as acl,
         (select s from unnest(p.proconfig) s where s like 'search_path=%') as search_path
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname in ('match_chunks', 'match_chunks_active')
  order by 1`;

let db: PGlite;
let functionsBefore: unknown[];

const apply = (file: string) => db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));

beforeAll(async () => {
  db = await createStubDb();
  for (const file of migrationFiles().filter((f) => f < MIGRATION)) await apply(file);
  functionsBefore = (await db.query(FUNCTIONS)).rows;
  for (const file of migrationFiles().filter((f) => f >= MIGRATION)) await apply(file);

  await db.exec(`
    insert into accounts (clerk_user_id) values ('u1');
    insert into projects (id, owner_id, name, public_key) values
      ('${BIG}', 'u1', 'Big', 'pk1'), ('${SMALL}', 'u1', 'Small', 'pk2');
    insert into knowledge_sources (id, project_id, title, type, status) values
      ('${BIG}', '${BIG}', 'b', 'text', 'ready'), ('${SMALL}', '${SMALL}', 's', 'text', 'ready');
  `);
  const insert = (project: string, content: string, embedding: string) =>
    db.query(
      `insert into knowledge_chunks (project_id, source_id, content, embedding) values ($1, $1, $2, $3::extensions.vector)`,
      [project, content, embedding],
    );
  // Another project's chunks, all nearer to the query than any of the small project's.
  for (let i = 0; i < 300; i++) await insert(BIG, `big${i}`, vec(1, 1 + (i % 50), 0.05 + i / 2000));
  for (let i = 1; i <= 10; i++) await insert(SMALL, `small${i}`, vec(-0.1 * i, 100 + i, 1));
}, 120_000);
afterAll(async () => {
  await db.close();
});

/** Make the shared HNSW index the cheapest plan, with a tiny scan budget. */
async function forceHnsw(run: RunAs) {
  for (const setting of ["enable_seqscan = off", "enable_bitmapscan = off", "enable_sort = off", "hnsw.max_scan_tuples = 20"]) {
    await run(service, `set local ${setting}`);
  }
}

describe("chunk search scan budget", () => {
  it("the forced setup really hides the small project from an HNSW scan", async () => {
    await withRollback(db, async (run) => {
      await forceHnsw(run);
      await run(service, `set local hnsw.iterative_scan = 'strict_order'`);
      const rows = await run(
        service,
        `select content from public.knowledge_chunks where project_id = $1
         order by embedding operator(extensions.<=>) $2::extensions.vector limit 5`,
        [SMALL, QUERY],
      );
      expect(rows).toHaveLength(0);
    });
  });

  for (const { name, sql } of CALLS) {
    it(`${name}: returns the small project's exact top 5 even when HNSW is forced`, async () => {
      await withRollback(db, async (run) => {
        await forceHnsw(run);
        const rows = await run(service, sql, [SMALL, QUERY]);
        expect(rows.map((r) => r.content)).toEqual(["small1", "small2", "small3", "small4", "small5"]);
      });
    });
  }

  it("keeps signatures, return types, security mode, search_path, owner and grants", async () => {
    expect(functionsBefore).toHaveLength(2);
    expect((await db.query(FUNCTIONS)).rows).toEqual(functionsBefore);
  });
});
