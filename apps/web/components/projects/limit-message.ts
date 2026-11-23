import { PLAN_LIMITS } from "@askwell/shared";
import type { Plan } from "@askwell/shared";

const plural = (n: number) => `${n} project${n === 1 ? "" : "s"}`;

/** What the owner sees when they are at (or over) their plan's project limit. */
export function limitMessage(plan: Plan): string {
  if (plan === "pro") return `Your Pro plan includes ${plural(PLAN_LIMITS.pro.projects)}.`;
  return `Your Free plan includes ${plural(PLAN_LIMITS.free.projects)}. Upgrade to Pro for up to ${PLAN_LIMITS.pro.projects}.`;
}
