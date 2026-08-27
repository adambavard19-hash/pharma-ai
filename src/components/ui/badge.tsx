import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";

type Tone =
  | "neutral"
  | "brand"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info";

const TONES: Record<Tone, string> = {
  neutral:
    "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-300 ring-ink-200 dark:ring-ink-700",
  brand:
    "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300 ring-brand-200 dark:ring-brand-800",
  accent:
    "bg-accent-50 text-accent-800 dark:bg-accent-900/40 dark:text-accent-200 ring-accent-200 dark:ring-accent-800",
  success:
    "bg-success-50 text-success-700 dark:bg-success-700/20 dark:text-success-500 ring-success-100 dark:ring-success-700/40",
  warning:
    "bg-warning-50 text-warning-700 dark:bg-warning-700/20 dark:text-warning-500 ring-warning-100 dark:ring-warning-700/40",
  danger:
    "bg-danger-50 text-danger-700 dark:bg-danger-700/20 dark:text-danger-500 ring-danger-100 dark:ring-danger-700/40",
  info:
    "bg-info-50 text-info-700 dark:bg-info-700/20 dark:text-info-500 ring-info-100 dark:ring-info-700/40",
};

export function Badge({
  tone = "neutral",
  className,
  icon,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; icon?: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
        "text-[11.5px] leading-4 font-medium ring-1 ring-inset whitespace-nowrap",
        TONES[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}

/** Pastille d'état colorée, sans texte. */
export function Dot({ tone = "neutral", className }: { tone?: Tone; className?: string }) {
  const colors: Record<Tone, string> = {
    neutral: "bg-ink-400",
    brand: "bg-brand-500",
    accent: "bg-accent-500",
    success: "bg-success-500",
    warning: "bg-warning-500",
    danger: "bg-danger-500",
    info: "bg-info-500",
  };
  return <span className={cn("size-1.5 rounded-full", colors[tone], className)} />;
}
