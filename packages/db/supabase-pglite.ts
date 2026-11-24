import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";

/**
 * Test helper: an in-memory Postgres (PGlite) that looks enough like a Supabase
 * project to test migrations, RLS policies and grants. Never a local Supabase stack.
 */

export type DbRole = "anon" | "authenticated" | "service_role";

/** Who runs a query. No `role` = the superuser that owns the schema (seeding, inspecting). */
export type Session = { role?: DbRole; sub?: string };

type Queryable = Pick<PGlite, "query" | "exec">;

export const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "supabase",
  "migrations",
);

/** What Supabase has before our migrations run: roles, schemas, auth.jwt(), default grants. */
const SUPABASE_STUB = `
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;

  create schema extensions;
  create schema auth;
  grant usage on schema public, extensions, auth to anon, authenticated, service_role;

  -- Minimal Storage: just enough for migrations that create buckets.
  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text not null unique,
    public boolean default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );

  -- Same as Supabase: the JWT claims of the current request.
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;

  -- Supabase grants new public objects to the API roles by default. Migrations must undo it.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/** Start PGlite with pgvector and the Supabase stub, then apply every migration in order. */
export async function createTestDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { vector } });
  await db.exec(SUPABASE_STUB);
  for (const file of migrationFiles()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
  }
  return db;
}

/** A PGlite with the Supabase stub only (no migrations), for applying SQL by hand. */
export async function createStubDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { vector } });
  await db.exec(SUPABASE_STUB);
  return db;
}

type Row = Record<string, unknown>;
export type RunAs = (session: Session, sql: string, params?: unknown[]) => Promise<Row[]>;

async function setSession(tx: Queryable, session: Session): Promise<void> {
  await tx.exec("reset role");
  await tx.query("select set_config('request.jwt.claims', $1, true)", [
    session.sub === undefined ? "" : JSON.stringify({ sub: session.sub, role: session.role }),
  ]);
  if (session.role) await tx.exec(`set local role ${session.role}`);
}

/**
 * Run several statements as different roles/users in ONE transaction that is always
 * rolled back, so tests never leak state into each other. Errors propagate.
 */
export async function withRollback<T>(db: PGlite, fn: (run: RunAs) => Promise<T>): Promise<T> {
  let result!: T;
  await db.transaction(async (tx) => {
    const run: RunAs = async (session, sql, params) => {
      await setSession(tx, session);
      // A savepoint keeps the transaction usable after a statement fails (e.g. permission denied).
      await tx.exec("savepoint stmt");
      try {
        const res = await tx.query<Row>(sql, params);
        await tx.exec("release savepoint stmt");
        return res.rows;
      } catch (err) {
        await tx.exec("rollback to savepoint stmt");
        throw err;
      }
    };
    result = await fn(run);
    await tx.rollback();
  });
  return result;
}

/** One statement as a role (with JWT claims `{ sub }`), rolled back afterwards. */
export function queryAs(
  db: PGlite,
  session: Session,
  sql: string,
  params?: unknown[],
): Promise<Row[]> {
  return withRollback(db, (run) => run(session, sql, params));
}
