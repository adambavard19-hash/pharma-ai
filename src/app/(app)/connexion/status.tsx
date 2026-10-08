import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Circle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Les pièces visuelles de « Connecter ma pharmacie » : un état se lit à sa
 * couleur et à son icône avant de se lire à son texte. Vert = ça marche,
 * orange = à faire ou à surveiller, gris = pas encore. Jamais du rouge pour
 * ce qui n'est pas dangereux.
 */

export type Tone = "success" | "warning" | "danger" | "neutral";

export const TONE_STYLES: Record<Tone, { box: string; dot: string; text: string; Icon: LucideIcon }> = {
  success: { box: "border-success-200 bg-success-50/70 dark:border-success-800 dark:bg-success-950/30", dot: "bg-success-600", text: "text-success-700 dark:text-success-400", Icon: CheckCircle2 },
  warning: { box: "border-warning-300 bg-warning-50/70 dark:border-warning-800 dark:bg-warning-950/30", dot: "bg-warning-500", text: "text-warning-800 dark:text-warning-400", Icon: AlertTriangle },
  danger: { box: "border-danger-200 bg-danger-50/70 dark:border-danger-800 dark:bg-danger-950/30", dot: "bg-danger-600", text: "text-danger-700 dark:text-danger-400", Icon: AlertTriangle },
  neutral: { box: "border-border-subtle bg-surface-card", dot: "bg-ink-300 dark:bg-ink-600", text: "text-text-secondary", Icon: Circle },
};

/** La phrase à lire en dix secondes : ce qui se passe, et le seul geste utile. */
export function HeadlineBar({ tone, title, detail, action }: { tone: Tone; title: string; detail: string | null; action?: ReactNode }) {
  const look = TONE_STYLES[tone];
  return (
    <section aria-live="polite" className={cn("flex flex-wrap items-center gap-4 rounded-2xl border px-5 py-4", look.box)}>
      <look.Icon className={cn("size-8 shrink-0", look.text)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <h2 className="text-[20px] leading-7 font-semibold tracking-[-0.01em] text-text-primary">{title}</h2>
        {detail && <p className="text-[14px] leading-5 text-text-secondary">{detail}</p>}
      </div>
      {action}
    </section>
  );
}

/** Un des trois états de la connexion : une icône, un mot en couleur, une ligne de détail, un geste. */
export function StatusTile({ icon: Icon, label, tone, title, detail, children, action }: { icon: LucideIcon; label: string; tone: Tone; title: string; detail: string; children?: ReactNode; action?: ReactNode }) {
  const look = TONE_STYLES[tone];
  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border-subtle bg-surface-card p-5 sm:flex-row sm:items-start">
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl border", look.box)}>
        <Icon className={cn("size-5", look.text)} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-[12px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">{label}</p>
        <p className="flex items-center gap-2 text-[18px] leading-6 font-semibold text-text-primary">
          <span className={cn("size-2.5 shrink-0 rounded-full", look.dot)} aria-hidden="true" />
          {title}
        </p>
        <p className="text-[14px] leading-5 text-text-secondary">{detail}</p>
        {children}
      </div>
      {action && <div className="shrink-0 sm:self-center">{action}</div>}
    </article>
  );
}
