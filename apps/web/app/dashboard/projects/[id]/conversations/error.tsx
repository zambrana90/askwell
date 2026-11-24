"use client";

import { ErrorState } from "../../../../../components/ui/error-state";

export default function ConversationsError({ retry }: { error: Error; retry: () => void }) {
  return <ErrorState description="We couldn't load your conversations." onRetry={retry} />;
}
