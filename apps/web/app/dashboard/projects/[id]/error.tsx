"use client";

import { ErrorState } from "../../../../components/ui/error-state";

export default function ProjectError({ retry }: { error: Error; retry: () => void }) {
  return <ErrorState description="We couldn't load this page of your project." onRetry={retry} />;
}
