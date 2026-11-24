import { Skeleton } from "../../../../../components/ui/spinner";

export default function Loading() {
  return (
    <>
      <p role="status" className="sr-only">
        Loading knowledge…
      </p>
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </>
  );
}
