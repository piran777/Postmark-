import * as React from "react";
import { cn } from "@/lib/cn";

type SwitchProps = {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange" | "checked">;

export function Switch({
  className,
  checked,
  defaultChecked,
  onCheckedChange,
  ...rest
}: SwitchProps) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <span className="relative inline-flex h-6 w-10 items-center rounded-full bg-surface-strong transition">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          defaultChecked={defaultChecked}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          {...rest}
        />
        <span
          className={cn(
            "pointer-events-none absolute left-0.5 h-5 w-5 rounded-full bg-surface shadow-sm transition",
            "peer-checked:translate-x-4 peer-checked:bg-primary"
          )}
        />
      </span>
      {rest["aria-label"] ? (
        <span className={cn("text-sm text-foreground/80", className)}>
          {rest["aria-label"]}
        </span>
      ) : null}
    </label>
  );
}


