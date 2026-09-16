import Link from "next/link";
import type { ComponentProps } from "react";

type LandingButtonVariant = "primary" | "outline";
type LandingButtonSize = "sm" | "md";

type LandingButtonProps = ComponentProps<typeof Link> & {
  variant?: LandingButtonVariant;
  size?: LandingButtonSize;
};

const baseClasses =
  "inline-flex items-center justify-center rounded-lg font-semibold transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-landing-primary";

const variantClasses: Record<LandingButtonVariant, string> = {
  primary: "bg-landing-primary text-white shadow-sm hover:opacity-90 hover:shadow-md",
  outline:
    "border border-landing-border bg-landing-card text-landing-foreground hover:bg-landing-background hover:border-landing-foreground/20",
};

const sizeClasses: Record<LandingButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm",
  md: "px-6 py-3 text-[15px]",
};

export function LandingButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: LandingButtonProps) {
  return (
    <Link
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className ?? ""}`}
      {...props}
    />
  );
}
