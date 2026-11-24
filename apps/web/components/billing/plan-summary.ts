import { PLAN_LIMITS, PLAN_PRICES_USD_MONTHLY } from "@askwell/shared";
import type { Plan } from "@askwell/shared";

export const PLAN_NAME: Record<Plan, string> = { free: "Free", pro: "Pro" };

/** "Free" or "$19 / month". */
export function priceLabel(plan: Plan): string {
  const price = PLAN_PRICES_USD_MONTHLY[plan];
  return price === 0 ? "Free" : `$${price} / month`;
}

/** What a plan includes, in plain words, from PLAN_LIMITS (the single source of truth). */
export function planIncludes(plan: Plan): string[] {
  const l = PLAN_LIMITS[plan];
  const items = [
    `${l.projects} project${l.projects === 1 ? "" : "s"}`,
    `${l.messagesPerMonth.toLocaleString("en-US")} chat messages per project per month`,
    `${l.knowledgeSources} knowledge sources per project`,
  ];
  const customizable = Object.values(l.customize).every(Boolean);
  items.push(customizable ? "Full widget customization, including hiding the badge" : "Default widget look");
  return items;
}
