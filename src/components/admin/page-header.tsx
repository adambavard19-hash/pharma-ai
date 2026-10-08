import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * L'en-tête d'une page de la console : l'espace (fil d'Ariane), le titre,
 * une phrase d'explication et les actions de la page, à droite.
 */
export function AdminPageHeader({
  space,
  parent,
  title,
  description,
  actions,
  badge,
  className,
}: {
  /** La rubrique de navigation (« Finances »), pour le fil d'Ariane d'une page enfant. Seule, elle n'affiche rien : la navigation la montre déjà. */
  space?: { label: string; href?: string };
  /** Une page parente (« Abonnements ») entre l'espace et le titre. */
  parent?: { label: string; href: string };
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="min-w-0 space-y-1.5">
        {/* La rubrique est déjà dans la navigation : le fil d'Ariane ne sert que pour revenir à une page parente. */}
        {parent && (
          <nav aria-label="Fil d'Ariane" className="flex flex-wrap items-center gap-1 text-[12.5px] text-text-tertiary">
            {space && (space.href ? <Link href={space.href} className="hover:text-text-primary">{space.label}</Link> : <span>{space.label}</span>)}
            {space && parent && <ChevronRight className="size-3.5" aria-hidden="true" />}
            {parent && <Link href={parent.href} className="hover:text-text-primary">{parent.label}</Link>}
          </nav>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.02em] text-text-primary text-balance">{title}</h1>
          {badge}
        </div>
        {description && <p className="max-w-3xl text-[14px] leading-6 text-text-secondary">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Un bloc de page : titre, phrase, action, puis contenu, dans une carte. */
export function AdminSection({ title, description, action, children, className, padded = true, id }: { title?: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; padded?: boolean; id?: string }) {
  return (
    <section id={id} className={cn("overflow-hidden rounded-2xl border border-border-subtle bg-surface-card", className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] leading-6 font-semibold text-text-primary">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] leading-5 text-text-secondary">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={padded ? "p-5" : undefined}>{children}</div>
    </section>
  );
}

/** Paires libellé / valeur, alignées. */
export function FactList({ items, className }: { items: { label: string; value: ReactNode; hint?: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[12px] font-medium text-text-tertiary">{item.label}</dt>
          <dd className="mt-0.5 text-[14px] leading-5 break-words text-text-primary">{item.value ?? <span className="text-text-tertiary">—</span>}</dd>
          {item.hint && <dd className="mt-0.5 text-[12px] text-text-tertiary">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
