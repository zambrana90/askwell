"use client";

import { ErrorState } from "../../../components/ui/error-state";

export default function BillingError({ retry }: { error: Error; retry: () => void }) {
  return <ErrorState description="We couldn't load your billing details." onRetry={retry} />;
}
