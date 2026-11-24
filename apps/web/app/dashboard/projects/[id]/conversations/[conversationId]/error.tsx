"use client";

import { ErrorState } from "../../../../../../components/ui/error-state";

export default function ThreadError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState description="We couldn't load this conversation." onRetry={reset} />;
}
