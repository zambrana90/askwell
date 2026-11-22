export const PLANS = ["free", "pro"] as const;
export type Plan = (typeof PLANS)[number];

export type PlanLimits = {
  /** Max projects per account. */
  projects: number;
  /** Max accepted chat messages per project per month. */
  messagesPerMonth: number;
  /** Max knowledge sources (files + pasted texts) per project. */
  knowledgeSources: number;
  /** What the owner may customize on the widget. */
  customize: {
    color: boolean;
    position: boolean;
    label: boolean;
    animation: boolean;
    headerText: boolean;
    /** Whether the "Powered by" badge may be hidden. */
    badgeHideable: boolean;
  };
};

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    projects: 1,
    messagesPerMonth: 100,
    knowledgeSources: 3,
    customize: {
      color: false,
      position: false,
      label: false,
      animation: false,
      headerText: false,
      badgeHideable: false,
    },
  },
  pro: {
    projects: 5,
    messagesPerMonth: 2000,
    knowledgeSources: 25,
    customize: {
      color: true,
      position: true,
      label: true,
      animation: true,
      headerText: true,
      badgeHideable: true,
    },
  },
};

export const PLAN_PRICES_USD_MONTHLY: Record<Plan, number> = {
  free: 0,
  pro: 19,
};
