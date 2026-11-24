"use client";

import { ErrorState } from "../../../../../components/ui/error-state";

export default function CustomizeError({ retry }: { error: Error; retry: () => void }) {
  return <ErrorState description="We couldn't load your widget settings." onRetry={retry} />;
}
