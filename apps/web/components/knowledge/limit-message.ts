import { PLAN_LIMITS } from "@askwell/shared";
import type { Plan } from "@askwell/shared";

const plural = (n: number) => `${n} source${n === 1 ? "" : "s"}`;

/** What the owner sees when a project is at its plan's knowledge-source limit. */
export function knowledgeLimitMessage(plan: Plan): string {
  if (plan === "pro") return `Your Pro plan includes ${plural(PLAN_LIMITS.pro.knowledgeSources)} per project.`;
  return `Your Free plan includes ${plural(PLAN_LIMITS.free.knowledgeSources)} per project. Upgrade to Pro for up to ${PLAN_LIMITS.pro.knowledgeSources}.`;
}
