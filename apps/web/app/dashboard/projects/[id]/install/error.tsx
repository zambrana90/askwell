"use client";

import { ErrorState } from "../../../../../components/ui/error-state";

export default function InstallError({ retry }: { error: Error; retry: () => void }) {
  return <ErrorState description="We couldn't load the install steps." onRetry={retry} />;
}
