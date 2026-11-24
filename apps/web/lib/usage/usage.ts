import { PLAN_LIMITS, type Plan } from "@askwell/shared";

export type Usage = { used: number; limit: number; atLimit: boolean };

/**
 * Messages used this month, correct across the monthly reset. `messages_used` is only reset
 * by the next accepted message (`consume_message`), so a period that started before the
 * current UTC month counts as 0.
 */
export function currentUsage(
  project: { messagesUsed: number; periodStart: string },
  limit: number,
  now: Date,
): Usage {
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const startedAt = Date.parse(project.periodStart);
  const stale = Number.isNaN(startedAt) || startedAt < monthStart;
  const used = stale ? 0 : Math.max(0, project.messagesUsed);
  return { used, limit, atLimit: used >= limit };
}

/** What the owner sees at the monthly limit. */
export function atLimitMessage(plan: Plan): string {
  const base = "The widget shows visitors a 'chat unavailable' message until next month.";
  if (plan === "pro") return base;
  return `${base} Upgrade for ${PLAN_LIMITS.pro.messagesPerMonth.toLocaleString("en-US")} per month.`;
}
