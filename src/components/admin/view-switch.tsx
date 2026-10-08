import Link from "next/link";
import { cn } from "@/lib/utils";

export type ViewSwitchItem = {
  key: string;
  label: string;
  href: string;
  /** Un nombre discret, à côté du libellé. */
  count?: number;
  /** Une pastille qui attire l'œil : ce qui attend (« 1 en retard »). */
  badge?: { text: string; tone: "brand" | "warning" | "danger" };
};

/**
 * Le sélecteur de vues d'un espace de travail : les quelques façons de regarder le même sujet (tableau ou liste, factures ou
 * impayés…), avec ce qui attend sur chacune. Une seule rangée, un seul geste, toujours au même endroit.
 */
export function ViewSwitch({ items, active, label }: { items: ViewSwitchItem[]; active: string; label: string }) {
  return (
    <nav aria-label={label} className="flex max-w-full overflow-x-auto">
      <ul className="inline-flex gap-0.5 rounded-xl bg-surface-sunken p-1">
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn("inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-[13.5px] font-medium whitespace-nowrap transition-colors", isActive ? "bg-surface-card text-text-primary shadow-xs" : "text-text-secondary hover:bg-surface-card/60 hover:text-text-primary")}
              >
                {item.label}
                {item.count !== undefined && <span className="text-[12px] text-text-tertiary tabular-nums">{item.count}</span>}
                {item.badge && (
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] leading-none font-semibold", item.badge.tone === "brand" ? "bg-brand-600 text-white" : item.badge.tone === "danger" ? "bg-danger-600 text-white" : "bg-warning-500 text-ink-950")}>{item.badge.text}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
