"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "../ui/button";

/** Manual refresh: re-runs the server component. No realtime, no polling (project.md §6.7). */
export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button variant="secondary" loading={pending} onClick={() => startTransition(() => router.refresh())}>
      Refresh
    </Button>
  );
}
