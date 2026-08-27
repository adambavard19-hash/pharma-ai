import { cn } from "@/lib/utils";
import type { HTMLAttributes, ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";

type Tone = "info" | "success" | "warning" | "danger" | "neutral";

const ALERT_TONES: Record<Tone, { wrapper: string; icon: string; Icon: LucideIcon }> = {
  info: {
    wrapper: "bg-info-50 border-info-100 dark:bg-info-700/10 dark:border-info-700/30",
    icon: "text-info-600 dark:text-info-500",
    Icon: Info,
  },
  success: {
    wrapper:
      "bg-success-50 border-success-100 dark:bg-success-700/10 dark:border-success-700/30",
    icon: "text-success-600 dark:text-success-500",
    Icon: CheckCircle2,
  },
  warning: {
    wrapper:
      "bg-warning-50 border-warning-100 dark:bg-warning-700/10 dark:border-warning-700/30",
    icon: "text-warning-700 dark:text-warning-500",
    Icon: AlertTriangle,
  },
  danger: {
    wrapper:
      "bg-danger-50 border-danger-100 dark:bg-danger-700/10 dark:border-danger-700/30",
    icon: "text-danger-600 dark:text-danger-500",
    Icon: ShieldAlert,
  },
  neutral: {
    wrapper: "bg-surface-sunken border-border-subtle",
    icon: "text-text-tertiary",
    Icon: Info,
  },
};

export function Alert({
  tone = "info",
  title,
  children,
  className,
  icon,
  action,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  tone?: Tone;
  title?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  const config = ALERT_TONES[tone];
  const Icon = config.Icon;

  return (
    <div
      className={cn("flex gap-3 rounded-lg border p-3.5", config.wrapper, className)}
      role={tone === "danger" || tone === "warning" ? "alert" : undefined}
      {...props}
    >
      <span className={cn("mt-0.5 shrink-0", config.icon)}>
        {icon ?? <Icon className="size-[18px]" aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        {title && (
          <p className="text-[13.5px] font-semibold text-text-primary">{title}</p>
        )}
        {children && (
          <div className="text-[13px] leading-5 text-text-secondary">{children}</div>
        )}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-14 text-center",
        className,
      )}
    >
      {icon && (
        <div className="flex size-12 items-center justify-center rounded-xl bg-surface-sunken text-text-tertiary">
          {icon}
        </div>
      )}
      <div className="max-w-sm space-y-1">
        <p className="text-[15px] font-semibold text-text-primary">{title}</p>
        {description && (
          <p className="text-[13px] leading-5 text-text-secondary">{description}</p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-ink-200/70 dark:bg-ink-800",
        className,
      )}
      aria-hidden="true"
      {...props}
    />
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn("h-3.5", index === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Barre de progression accessible (jauge de score, avancement d'import). */
export function Progress({
  value,
  max = 1,
  tone = "brand",
  className,
  label,
}: {
  value: number;
  max?: number;
  tone?: "brand" | "success" | "warning" | "danger" | "accent";
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const colors = {
    brand: "bg-brand-500",
    success: "bg-success-500",
    warning: "bg-warning-500",
    danger: "bg-danger-500",
    accent: "bg-accent-500",
  } as const;

  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", colors[tone])}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
