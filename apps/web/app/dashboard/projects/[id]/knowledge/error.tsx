"use client";

import { ErrorState } from "../../../../../components/ui/error-state";

export default function KnowledgeError({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState description="We couldn't load your knowledge sources." onRetry={reset} />;
}
