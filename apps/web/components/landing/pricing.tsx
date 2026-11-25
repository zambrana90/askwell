import { PLANS, PLAN_LIMITS, PLAN_PRICES_USD_MONTHLY, type Plan } from "@askwell/shared";
import { Panel } from "../ui/panel";
import { LinkButton } from "./link-button";
import { Section } from "./section";

const NAMES: Record<Plan, string> = { free: "Free", pro: "Pro" };
const number = (value: number) => value.toLocaleString("en-US");

function features(plan: Plan): string[] {
  const limits = PLAN_LIMITS[plan];
  const customizable = limits.customize.color && limits.customize.position && limits.customize.label;
  return [
    `${number(limits.projects)} ${limits.projects === 1 ? "project" : "projects"}`,
    `${number(limits.messagesPerMonth)} messages a month per project`,
    `${number(limits.knowledgeSources)} knowledge sources per project`,
    customizable ? "Custom color, position, label and animation" : "Default widget look",
    limits.customize.badgeHideable ? "Hide the “Powered by” badge" : "“Powered by” badge shown",
  ];
}

/** The plan with the brighter edge and the tag. */
const FEATURED: Plan = "pro";

export function Pricing() {
  return (
    <Section id="pricing" title="Pricing">
      <div className="grid gap-4 md:grid-cols-2">
        {PLANS.map((plan) => (
          <Panel
            key={plan}
            className={`landing-card flex flex-col p-6 md:p-8 ${plan === FEATURED ? "landing-card-featured" : ""}`}
            data-plan={plan}
          >
            <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">{NAMES[plan]}</h3>
              {plan === FEATURED ? (
                <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-ink">Most popular</span>
              ) : null}
            </div>
            <p className="mt-4">
              <span className="text-5xl font-semibold tracking-tight">${PLAN_PRICES_USD_MONTHLY[plan]}</span>
              <span className="text-ink-muted"> / month</span>
            </p>
            <ul className="mt-6 flex flex-col gap-3 border-t border-glass-edge pt-6 text-sm text-ink-muted">
              {features(plan).map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0 text-ink" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 8.5l3 3 7-7" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
      <div className="mt-8 flex justify-center">
        <LinkButton href="/sign-up" variant="secondary" size="large">
          Start free
        </LinkButton>
      </div>
    </Section>
  );
}
