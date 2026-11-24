import { Skeleton } from "../../../../../components/ui/spinner";

export default function Loading() {
  return (
    <>
      <p role="status" className="sr-only">
        Loading conversations…
      </p>
      <div aria-busy="true" className="flex flex-col gap-3">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </>
  );
}
