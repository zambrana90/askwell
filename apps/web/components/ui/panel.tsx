import type { ComponentProps } from "react";

// Glass surface: translucent, blurred, thin border.
export function Panel({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      className={`rounded-glass border border-glass-edge bg-glass shadow-glass backdrop-blur-glass ${className}`}
      {...props}
    />
  );
}
