"use client";

import { ErrorState } from "../../components/ui/error-state";

export default function DashboardError({ retry }: { error: Error; retry: () => void }) {
  return <ErrorState onRetry={retry} />;
}
