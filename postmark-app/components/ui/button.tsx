import { Slot } from "@radix-ui/react-slot";
import { forwardRef, ButtonHTMLAttributes, AnchorHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  asChild?: boolean;
};

const base =
  "inline-flex items-center justify-center rounded-lg font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 disabled:cursor-not-allowed";

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-primary text-surface shadow-sm hover:bg-primary-strong focus-visible:outline-primary",
  secondary:
    "border border-border bg-surface text-foreground hover:border-border-strong hover:bg-surface-strong focus-visible:outline-primary",
  ghost: "text-foreground hover:bg-surface-strong focus-visible:outline-primary",
};

const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref as any}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

type AnchorButtonProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
};

export const AnchorButton = forwardRef<HTMLAnchorElement, AnchorButtonProps>(
  ({ className, variant = "secondary", size = "md", ...props }, ref) => {
    return (
      <a
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      />
    );
  }
);

AnchorButton.displayName = "AnchorButton";




