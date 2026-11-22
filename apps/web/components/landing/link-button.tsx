import Link from "next/link";
import type { ComponentProps } from "react";

const VARIANTS = {
  primary: "bg-accent text-accent-ink hover:opacity-90",
  secondary: "border border-glass-edge bg-glass text-ink backdrop-blur-glass hover:bg-glass-edge",
  ghost: "text-ink hover:bg-glass-edge",
} as const;

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: keyof typeof VARIANTS };

/** A link that looks like the dashboard Button, for navigation. */
export function LinkButton({ variant = "primary", className = "", ...props }: LinkButtonProps) {
  return (
    <Link
      className={`inline-flex min-h-10 items-center justify-center rounded-glass px-4 text-sm font-medium transition ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
