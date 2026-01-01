import { cn } from "@/lib/cn";
import { HTMLAttributes } from "react";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "success" | "info";
  soft?: boolean;
};

export function Badge({
  className,
  tone = "neutral",
  soft = true,
  ...props
}: BadgeProps) {
  const palette: Record<
    NonNullable<BadgeProps["tone"]>,
    { fg: string; bg: string; ring: string }
  > = {
    neutral: {
      fg: "text-foreground",
      bg: soft ? "bg-surface-strong" : "bg-foreground/10",
      ring: "border-border",
    },
    success: {
      fg: "text-success-strong",
      bg: soft ? "bg-success/15" : "bg-success/25",
      ring: "border-success/30",
    },
    info: {
      fg: "text-info-strong",
      bg: soft ? "bg-info/15" : "bg-info/25",
      ring: "border-info/30",
    },
  };

  const { fg, bg, ring } = palette[tone];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        bg,
        fg,
        ring,
        className
      )}
      {...props}
    />
  );
}










