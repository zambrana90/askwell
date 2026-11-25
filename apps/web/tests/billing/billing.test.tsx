import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PLAN_LIMITS } from "@askwell/shared";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("server-only", () => ({}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }), redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));

const openUserProfile = vi.fn();
const pricingTable = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ openUserProfile }),
  PricingTable: (props: Record<string, unknown>) => {
    pricingTable(props);
    return <div data-testid="pricing-table" />;
  },
}));

const authMock = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => authMock() }));
const getPlan = vi.fn();
vi.mock("../../lib/projects/projects", () => ({ getPlan: (id: string) => getPlan(id) }));

import { APPEARANCE } from "../../components/auth/appearance";
import { BillingView, CHECKOUT_DONE_URL } from "../../components/billing/billing-view";
import { planIncludes, priceLabel } from "../../components/billing/plan-summary";
import BillingPage from "../../app/dashboard/billing/page";

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockReset();
  openUserProfile.mockReset();
  pricingTable.mockReset();
  authMock.mockReset().mockResolvedValue({ userId: "user_1" });
  getPlan.mockReset().mockResolvedValue("free");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("plan summary", () => {
  test("prices come from PLAN_PRICES_USD_MONTHLY", () => {
    expect(priceLabel("free")).toBe("Free");
    expect(priceLabel("pro")).toBe("$19 / month");
  });

  test("includes come from PLAN_LIMITS", () => {
    expect(planIncludes("free")).toContain(`${PLAN_LIMITS.free.knowledgeSources} knowledge sources per project`);
    expect(planIncludes("free")).toContain("Default widget look");
    expect(planIncludes("pro")).toContain("Full widget customization, including hiding the badge");
    expect(planIncludes("pro")).toContain("25 knowledge sources per project");
  });
});

describe("BillingView", () => {
  test("Free: shows the plan, what it includes and the pricing table, with a redirect back here", () => {
    render(<BillingView plan="free" />);
    expect(screen.getByTestId("current-plan").textContent).toBe("Free");
    expect(screen.getByTestId("pricing-table")).toBeTruthy();
    expect(pricingTable).toHaveBeenCalledWith(expect.objectContaining({ newSubscriptionRedirectUrl: CHECKOUT_DONE_URL }));
    // The checkout drawer gets the same look as the table.
    expect(pricingTable).toHaveBeenCalledWith(
      expect.objectContaining({ appearance: APPEARANCE, checkoutProps: { appearance: APPEARANCE } }),
    );
    expect(screen.queryByRole("button", { name: "Manage subscription" })).toBeNull();
    expect(screen.queryByText("Updating your plan…")).toBeNull();
  });

  test("Pro: shows Pro and a Manage subscription button that opens Clerk's account portal", () => {
    render(<BillingView plan="pro" />);
    expect(screen.getByTestId("current-plan").textContent).toBe("Pro");
    expect(screen.queryByTestId("pricing-table")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Manage subscription" }));
    expect(openUserProfile).toHaveBeenCalledTimes(1);
  });

  test("after checkout with the plan still Free: says 'Updating your plan…' and refreshes until it changes", () => {
    const { rerender } = render(<BillingView plan="free" checkoutDone pollMs={1000} maxWaitMs={30_000} />);
    expect(screen.getByText("Updating your plan…")).toBeTruthy();
    act(() => void vi.advanceTimersByTime(3000));
    expect(refresh).toHaveBeenCalledTimes(3);

    rerender(<BillingView plan="pro" checkoutDone pollMs={1000} maxWaitMs={30_000} />); // the webhook landed
    expect(screen.queryByText("Updating your plan…")).toBeNull();
    expect(screen.getByTestId("current-plan").textContent).toBe("Pro");
    act(() => void vi.advanceTimersByTime(5000));
    expect(refresh).toHaveBeenCalledTimes(3); // stopped
  });

  test("gives up after the max wait with a message, and stops refreshing", () => {
    render(<BillingView plan="free" checkoutDone pollMs={1000} maxWaitMs={5000} />);
    act(() => void vi.advanceTimersByTime(5000));
    expect(screen.queryByText("Updating your plan…")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("taking longer than usual");
    const calls = refresh.mock.calls.length;
    act(() => void vi.advanceTimersByTime(10_000));
    expect(refresh.mock.calls.length).toBe(calls);
  });

  test("does not poll when the page was not opened after a checkout", () => {
    render(<BillingView plan="free" pollMs={1000} />);
    act(() => void vi.advanceTimersByTime(5000));
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("billing page (server)", () => {
  const page = async (search: Record<string, string> = {}) =>
    BillingPage({ searchParams: Promise.resolve(search) });

  test("reads the plan on the server for the signed-in user and passes it down", async () => {
    getPlan.mockResolvedValue("pro");
    const el = await page();
    expect(getPlan).toHaveBeenCalledWith("user_1");
    expect(el.props).toMatchObject({ plan: "pro", checkoutDone: false });
  });

  test("?checkout=done is passed on", async () => {
    expect((await page({ checkout: "done" })).props.checkoutDone).toBe(true);
  });

  test("redirects to sign-in without a session", async () => {
    authMock.mockResolvedValue({ userId: null });
    await expect(page()).rejects.toThrow("redirect:/sign-in");
    expect(getPlan).not.toHaveBeenCalled();
  });

  test("shows an error state when the plan can't be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    getPlan.mockRejectedValue(new Error("db down"));
    const el = await page();
    expect(el.props.description).toMatch(/couldn't load your billing details/);
  });
});
