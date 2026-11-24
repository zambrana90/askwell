import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { BillingView } from "../../../components/billing/billing-view";
import { ErrorState } from "../../../components/ui/error-state";
import { getPlan } from "../../../lib/projects/projects";

export const metadata = { title: "Billing" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  // The plan is read here, on the server, from `accounts` (RLS-scoped). Never from the client.
  let plan;
  try {
    plan = await getPlan(userId);
  } catch (error) {
    console.error("Could not load the plan", error);
    return <ErrorState description="We couldn't load your billing details. Please reload the page." />;
  }
  const { checkout } = await searchParams;
  return <BillingView plan={plan} checkoutDone={checkout === "done"} />;
}
