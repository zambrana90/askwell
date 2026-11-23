import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_WIDGET_CONFIG, PLAN_LIMITS } from "@askwell/shared";
import { createTestDb, queryAs, withRollback } from "./supabase-pglite";
import type { Session } from "./supabase-pglite";

const service: Session = { role: "service_role" };
const CALL = `select * from public.create_project($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`;

function args(owner: string, key: string, max: number, name = "My project") {
  const c = DEFAULT_WIDGET_CONFIG;
  return [owner, name, key, max, c.buttonColor, c.position, c.label, c.animation, c.headerText, c.showBadge];
}

let db: PGlite;
beforeAll(async () => {
  db = await createTestDb();
  await db.exec(`insert into accounts (clerk_user_id) values ('u1'), ('u2')`);
});
afterAll(async () => {
  await db.close();
});

describe("create_project", () => {
  it("creates the project and its config with the values passed", async () => {
    await withRollback(db, async (run) => {
      const [p] = await run(service, CALL, [
        "u1", "Docs bot", "pk_one", 1, "#ff0000", "top-left", "Help", "scale", "Hi", false,
      ]);
      expect(p).toMatchObject({ owner_id: "u1", name: "Docs bot", public_key: "pk_one", messages_used: 0 });
      const cfg = await run(service, "select * from widget_configs where project_id = $1", [p!.id]);
      expect(cfg).toEqual([
        {
          project_id: p!.id, button_color: "#ff0000", position: "top-left", label: "Help",
          animation: "scale", header_text: "Hi", show_badge: false,
        },
      ]);
    });
  });

  it("refuses the second project when max is 1", async () => {
    await withRollback(db, async (run) => {
      await run(service, CALL, args("u1", "pk_a", 1));
      await expect(run(service, CALL, args("u1", "pk_b", 1))).rejects.toThrow("plan_limit");
      const rows = await run(service, "select count(*)::int as n from projects where owner_id = 'u1'");
      expect(rows[0]!.n).toBe(1);
    });
  });

  it("refuses the sixth project when max is 5, using PLAN_LIMITS", async () => {
    expect(PLAN_LIMITS.pro.projects).toBe(5);
    await withRollback(db, async (run) => {
      for (let i = 1; i <= 5; i++) await run(service, CALL, args("u1", `pk_${i}`, 5));
      await expect(run(service, CALL, args("u1", "pk_6", 5))).rejects.toThrow("plan_limit");
    });
  });

  it("counts per owner", async () => {
    await withRollback(db, async (run) => {
      await run(service, CALL, args("u1", "pk_x", 1));
      await expect(run(service, CALL, args("u2", "pk_y", 1))).resolves.toHaveLength(1);
    });
  });

  it("fails for an unknown account and creates nothing", async () => {
    await withRollback(db, async (run) => {
      await expect(run(service, CALL, args("nobody", "pk_z", 5))).rejects.toThrow("account_not_found");
    });
  });

  it("rolls back the project when the config insert fails", async () => {
    await withRollback(db, async (run) => {
      const bad = args("u1", "pk_bad", 5);
      bad[5] = "middle"; // invalid position
      await expect(run(service, CALL, bad)).rejects.toThrow();
      const rows = await run(service, "select count(*)::int as n from projects");
      expect(rows[0]!.n).toBe(0);
    });
  });

  it("anon and authenticated get permission denied", async () => {
    await expect(queryAs(db, { role: "anon" }, CALL, args("u1", "pk_q", 5))).rejects.toThrow(/permission denied/);
    await expect(
      queryAs(db, { role: "authenticated", sub: "u1" }, CALL, args("u1", "pk_q", 5)),
    ).rejects.toThrow(/permission denied/);
  });

  it("is security invoker with an empty search_path, executable by service_role only", async () => {
    const [f] = await db.query<{ secdef: boolean; config: string[]; svc: boolean; anon: boolean; auth: boolean; pub: boolean }>(`
      select p.prosecdef as secdef, p.proconfig as config,
        has_function_privilege('service_role', p.oid, 'execute') as svc,
        has_function_privilege('anon', p.oid, 'execute') as anon,
        has_function_privilege('authenticated', p.oid, 'execute') as auth,
        exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0) as pub
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_project'`).then((r) => r.rows);
    expect(f).toMatchObject({ secdef: false, svc: true, anon: false, auth: false, pub: false });
    expect(f!.config).toEqual(['search_path=""']);
  });
});
