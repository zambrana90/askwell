import { Spinner } from "../../components/ui/spinner";

// No text and no Clerk: this shows inside the widget's iframe while the config loads.
export default function Loading() {
  return (
    <div className="theme-auto flex h-dvh items-center justify-center bg-canvas text-ink">
      <Spinner className="size-6" />
    </div>
  );
}
