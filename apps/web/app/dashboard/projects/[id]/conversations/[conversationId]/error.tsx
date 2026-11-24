"use client";

import { ErrorState } from "../../../../../../components/ui/error-state";

export default function ThreadError({ retry }: { error: Error; retry: () => void }) {
  return <ErrorState description="We couldn't load this conversation." onRetry={retry} />;
}
