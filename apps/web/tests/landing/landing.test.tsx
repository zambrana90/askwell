import { cleanup, render, screen, within } from "@testing-library/react";
import { PLAN_LIMITS, PLAN_PRICES_USD_MONTHLY } from "@askwell/shared";
import { afterEach, expect, test } from "vitest";
import { Hero } from "../../components/landing/hero";
import { Pricing } from "../../components/landing/pricing";

afterEach(cleanup);

test.each(["free", "pro"] as const)("%s pricing card shows the values from packages/shared", (plan) => {
  const { container } = render(<Pricing />);
  const card = within(container.querySelector(`[data-plan="${plan}"]`) as HTMLElement);
  const limits = PLAN_LIMITS[plan];
  expect(card.getByText(`$${PLAN_PRICES_USD_MONTHLY[plan]}`)).toBeTruthy();
  expect(card.getByText(new RegExp(`^${limits.messagesPerMonth.toLocaleString("en-US")} messages`))).toBeTruthy();
  expect(card.getByText(new RegExp(`^${limits.knowledgeSources} knowledge sources`))).toBeTruthy();
  expect(card.getByText(new RegExp(`^${limits.projects} projects?$`))).toBeTruthy();
});

test("Pro is $19 a month and Free is $0", () => {
  expect(PLAN_PRICES_USD_MONTHLY).toEqual({ free: 0, pro: 19 });
});

test("Start free links to /sign-up", () => {
  render(<Hero />);
  expect(screen.getByRole("link", { name: "Start free" }).getAttribute("href")).toBe("/sign-up");
});
