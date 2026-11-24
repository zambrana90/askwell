"use client";

import { ErrorState } from "../../../../../components/ui/error-state";

export default function KnowledgeError({ retry }: { error: Error; retry: () => void }) {
  return <ErrorState description="We couldn't load your knowledge sources." onRetry={retry} />;
}
