"use client";

import { PricingTable, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Plan } from "@askwell/shared";
import { Button } from "../ui/button";
import { Panel } from "../ui/panel";
import { Spinner } from "../ui/spinner";
import { PLAN_NAME, planIncludes, priceLabel } from "./plan-summary";

/** Where Clerk sends the user after a checkout. The page then waits for the webhook. */
export const CHECKOUT_DONE_URL = "/dashboard/billing?checkout=done";
export const POLL_INTERVAL_MS = 2000;
export const POLL_MAX_MS = 30_000;

type Props = {
  /** Read on the server from `accounts`. The webhook is what changes it. */
  plan: Plan;
  /** True when the page was opened right after a checkout. */
  checkoutDone?: boolean;
  pollMs?: number;
  maxWaitMs?: number;
};

export function BillingView({ plan, checkoutDone = false, pollMs = POLL_INTERVAL_MS, maxWaitMs = POLL_MAX_MS }: Props) {
  const router = useRouter();
  const { openUserProfile } = useClerk();
  const [timedOut, setTimedOut] = useState(false);

  // Just checked out but the webhook hasn't moved the plan yet: refresh until it does.
  const waiting = checkoutDone && plan === "free" && !timedOut;

  useEffect(() => {
    if (!waiting) return;
    const poll = setInterval(() => router.refresh(), pollMs);
    const stop = setTimeout(() => setTimedOut(true), maxWaitMs);
    return () => {
      clearInterval(poll);
      clearTimeout(stop);
    };
  }, [waiting, pollMs, maxWaitMs, router]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Billing</h1>

      {waiting ? (
        <Panel role="status" className="flex items-center gap-3 p-4 text-sm">
          <Spinner />
          <span>Updating your plan…</span>
        </Panel>
      ) : null}
      {checkoutDone && plan === "free" && timedOut ? (
        <Panel role="alert" className="p-4 text-sm">
          Your payment is taking longer than usual to show up. Reload this page in a minute. If your plan is still Free
          after that, contact support.
        </Panel>
      ) : null}

      <Panel className="p-5" aria-labelledby="current-plan-heading">
        <h2 id="current-plan-heading" className="text-sm font-medium text-ink-muted">
          Current plan
        </h2>
        <p className="mt-1 text-xl font-semibold" data-testid="current-plan">
          {PLAN_NAME[plan]}
        </p>
        <p className="text-sm text-ink-muted">{priceLabel(plan)}</p>
        <ul className="mt-4 flex list-disc flex-col gap-1 pl-5 text-sm">
          {planIncludes(plan).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {plan === "pro" ? (
          <Button variant="secondary" className="mt-5 w-full sm:w-auto" onClick={() => openUserProfile()}>
            Manage subscription
          </Button>
        ) : null}
      </Panel>

      {plan === "free" ? (
        <section aria-labelledby="upgrade-heading" className="flex flex-col gap-3">
          <h2 id="upgrade-heading" className="text-lg font-semibold">
            Upgrade
          </h2>
          <PricingTable newSubscriptionRedirectUrl={CHECKOUT_DONE_URL} />
        </section>
      ) : null}
    </div>
  );
}
