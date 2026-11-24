"use client";

import { ErrorState } from "../../../../../components/ui/error-state";

export default function CustomizeError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState description="We couldn't load your widget settings." onRetry={reset} />;
}
