"use client";

import { ErrorState } from "../../../../../components/ui/error-state";

export default function ConversationsError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState description="We couldn't load your conversations." onRetry={reset} />;
}
