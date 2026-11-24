import { Skeleton } from "../../../../../components/ui/spinner";

export default function Loading() {
  return (
    <>
      <p role="status" className="sr-only">
        Loading widget settings…
      </p>
      <div aria-busy="true" className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    </>
  );
}
