"use client";

import { ErrorState } from "../../components/ui/error-state";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState onRetry={reset} />;
}
