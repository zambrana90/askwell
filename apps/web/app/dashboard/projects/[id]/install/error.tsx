"use client";

import { ErrorState } from "../../../../../components/ui/error-state";

export default function InstallError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState description="We couldn't load the install steps." onRetry={reset} />;
}
