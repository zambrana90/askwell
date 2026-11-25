import Link from "next/link";
import type { ComponentProps } from "react";

const VARIANTS = {
  primary: "bg-accent text-accent-ink hover:opacity-90",
  secondary: "border border-glass-edge bg-glass text-ink backdrop-blur-glass hover:bg-glass-edge",
  ghost: "text-ink hover:bg-glass-edge",
} as const;

const SIZES = {
  medium: "min-h-10 px-4 text-sm",
  large: "min-h-12 px-6 text-base",
} as const;

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: keyof typeof VARIANTS; size?: keyof typeof SIZES };

/** A link that looks like the dashboard Button, for navigation. */
export function LinkButton({ variant = "primary", size = "medium", className = "", ...props }: LinkButtonProps) {
  return (
    <Link
      className={`inline-flex items-center justify-center rounded-glass font-medium transition ${SIZES[size]} ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
