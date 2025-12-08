import { cn } from "@/lib/cn";
import { forwardRef, InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none transition",
          "placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary",
          className
        )}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";



