import Link from "next/link";
import type { ComponentProps } from "react";
import { BUTTON_VARIANTS, CLICKABLE, type ButtonVariant } from "../ui/interactive";

const SIZES = {
  medium: "min-h-10 px-4 text-sm",
  large: "min-h-12 px-6 text-base",
} as const;

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: keyof typeof SIZES };

/** A link that looks like the dashboard Button, for navigation. */
export function LinkButton({ variant = "primary", size = "medium", className = "", ...props }: LinkButtonProps) {
  return (
    <Link
      className={`inline-flex items-center justify-center rounded-glass font-medium ${CLICKABLE} ${SIZES[size]} ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
