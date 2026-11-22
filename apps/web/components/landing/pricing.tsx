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

export function Pricing() {
  return (
    <Section id="pricing" title="Pricing">
      <div className="grid gap-4 md:grid-cols-2">
        {PLANS.map((plan) => (
          <Panel key={plan} className="flex flex-col p-6" data-plan={plan}>
            <h3 className="text-lg font-semibold">{NAMES[plan]}</h3>
            <p className="mt-2">
              <span className="text-4xl font-semibold">${PLAN_PRICES_USD_MONTHLY[plan]}</span>
              <span className="text-ink-muted"> / month</span>
            </p>
            <ul className="mt-5 flex flex-col gap-2 text-sm text-ink-muted">
              {features(plan).map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
      <div className="mt-6">
        <LinkButton href="/sign-up" variant="secondary">
          Start free
        </LinkButton>
      </div>
    </Section>
  );
}
