import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Une étape : une icône, un titre numéroté, une pastille d'état facultative, puis son contenu.
 * Toutes les étapes de « Mes comptoirs » ont la même forme : on les lit de la même façon.
 */
export function SetupCard({ icon: Icon, title, badge, children, className }: { icon: LucideIcon; title: string; badge?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("space-y-4 rounded-2xl border border-border-subtle bg-surface-card p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Icon className="size-5 shrink-0 text-text-secondary" aria-hidden="true" />
        <h2 className="text-[18px] leading-6 font-semibold tracking-[-0.01em] text-text-primary">{title}</h2>
        {badge}
      </div>
      {children}
    </section>
  );
}

/** Le grand bouton d'une étape : pleine largeur, en pilule — le seul geste qu'on attend de la personne. */
export const BIG_BUTTON = "w-full rounded-full";
