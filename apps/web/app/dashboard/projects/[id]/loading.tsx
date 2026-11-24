import { Skeleton } from "../../../../components/ui/spinner";

export default function Loading() {
  return (
    <>
      <p role="status" className="sr-only">
        Loading project…
      </p>
      <div aria-busy="true" className="flex flex-col gap-4">
        <Skeleton className="h-48 w-full" />
      </div>
    </>
  );
}
