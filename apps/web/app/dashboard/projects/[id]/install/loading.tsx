import { Skeleton } from "../../../../../components/ui/spinner";

export default function Loading() {
  return (
    <>
      <p role="status" className="sr-only">
        Loading install steps…
      </p>
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </>
  );
}
