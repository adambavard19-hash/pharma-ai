import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "brand" | "success" | "warning" | "danger" | "info";

const TONE_RING: Record<Tone, string> = {
  default: "",
  brand: "border-brand-200 bg-brand-50/60 dark:border-brand-800/60 dark:bg-brand-950/30",
  success: "",
  warning: "border-warning-100 bg-warning-50/70 dark:border-warning-700/40 dark:bg-warning-700/10",
  danger: "border-danger-100 bg-danger-50/70 dark:border-danger-700/40 dark:bg-danger-700/10",
  info: "",
};

const TONE_VALUE: Record<Tone, string> = {
  default: "text-text-primary",
  brand: "text-brand-800 dark:text-brand-200",
  success: "text-success-700 dark:text-success-500",
  warning: "text-warning-700 dark:text-warning-500",
  danger: "text-danger-700 dark:text-danger-500",
  info: "text-info-700 dark:text-info-500",
};

/**
 * Un indicateur. Avec `href`, toute la tuile mène à la liste correspondante :
 * un chiffre se vérifie toujours d'un clic.
 */
export function KpiTile({ label, value, hint, href, tone = "default", icon, className }: { label: string; value: ReactNode; hint?: ReactNode; href?: string; tone?: Tone; icon?: ReactNode; className?: string }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12.5px] leading-5 font-medium text-text-secondary">{label}</p>
        {icon && <span className="text-text-tertiary" aria-hidden="true">{icon}</span>}
        {href && !icon && <ArrowUpRight className="size-4 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />}
      </div>
      <p className={cn("mt-2 text-[26px] leading-8 font-semibold tracking-[-0.02em] tabular-nums", TONE_VALUE[tone])}>{value}</p>
      {hint && <p className="mt-1 text-[12px] leading-4 text-text-tertiary">{hint}</p>}
    </>
  );
  const classes = cn("group block rounded-2xl border border-border-subtle bg-surface-card p-4 transition-all", TONE_RING[tone], className);
  return href ? (
    <Link href={href} className={cn(classes, "hover:-translate-y-px hover:border-brand-300 hover:shadow-sm motion-reduce:transform-none")}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

/**
 * Une carte « à traiter » : un nombre, ce qu'il désigne, et l'endroit où le
 * traiter. À zéro, elle s'efface sans disparaître.
 */
export function AttentionCard({ count, title, description, href, tone = "warning", icon }: { count: number; title: string; description?: string; href: string; tone?: "warning" | "danger" | "info" | "brand"; icon?: ReactNode }) {
  const active = count > 0;
  const colors = {
    warning: "bg-warning-50 text-warning-700 dark:bg-warning-700/20 dark:text-warning-500",
    danger: "bg-danger-50 text-danger-700 dark:bg-danger-700/20 dark:text-danger-500",
    info: "bg-info-50 text-info-700 dark:bg-info-700/20 dark:text-info-500",
    brand: "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300",
  }[tone];
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3.5 rounded-2xl border bg-surface-card p-4 transition-all",
        active ? "border-border-subtle hover:-translate-y-px hover:border-brand-300 hover:shadow-sm motion-reduce:transform-none" : "border-dashed border-border-subtle opacity-70 hover:opacity-100",
      )}
    >
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl text-[18px] font-semibold tabular-nums", active ? colors : "bg-surface-sunken text-text-tertiary")}>{count}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[14px] leading-5 font-semibold text-text-primary">
          {icon && <span className="text-text-tertiary" aria-hidden="true">{icon}</span>}
          {title}
        </span>
        {description && <span className="mt-0.5 block text-[12.5px] leading-5 text-text-secondary">{description}</span>}
      </span>
      <ArrowUpRight className="size-4 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
    </Link>
  );
}
