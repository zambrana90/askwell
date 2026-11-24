/**
 * After a downgrade, extras are paused, not deleted (project.md §5): only the owner's oldest
 * projects up to the plan's limit stay active, and in each project only the oldest sources up
 * to the plan's source limit are used for answers. "Oldest" = created_at, then id.
 * This is the same rule as the SQL functions `project_is_active` and `match_chunks_active`.
 */
type Item = { id: string; createdAt: string };

/** Oldest first: created_at, then id. Microsecond digits break ties inside the same millisecond. */
function byAge(a: Item, b: Item): number {
  const ta = Date.parse(a.createdAt);
  const tb = Date.parse(b.createdAt);
  if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return ta - tb;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The ids that are paused: everything after the oldest `limit` items. Any input order. */
export function pausedIds(items: readonly Item[], limit: number): Set<string> {
  const keep = Math.max(0, Math.floor(limit));
  return new Set([...items].sort(byAge).slice(keep).map((i) => i.id));
}

export type PlanName = "Free" | "Pro";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Note under a paused project. Only Free is offered an upgrade. */
export function pausedProjectNote(plan: PlanName, limit: number): string {
  const base = `Your ${plan} plan includes ${plural(limit, "active project")}.`;
  return plan === "Free"
    ? `${base} Upgrade or delete projects to turn this one back on.`
    : `${base} Delete projects to turn this one back on.`;
}

/** Note under a paused source. Only Free is offered an upgrade. */
export function pausedSourceNote(plan: PlanName, limit: number): string {
  const base = `Your ${plan} plan uses ${plural(limit, "source")} per project for answers.`;
  return plan === "Free"
    ? `${base} Upgrade or delete sources to use this one again.`
    : `${base} Delete sources to use this one again.`;
}
