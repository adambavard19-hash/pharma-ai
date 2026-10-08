"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAV, activeNavItem } from "@/core/admin/nav";
import { cn } from "@/lib/utils";

/**
 * La navigation principale de la console : cinq rubriques, toujours visibles, un clic chacune.
 * Accueil · Officines · Commercial · Finances · Gestion.
 */
export function AdminNav() {
  const pathname = usePathname();
  const active = activeNavItem(pathname);
  return (
    <nav className="-mb-px flex flex-nowrap items-center overflow-x-auto sm:gap-1" aria-label="Rubriques de la console">
      {ADMIN_NAV.map((space) => {
        const isActive = active.space.key === space.key;
        return (
          <Link
            key={space.key}
            href={space.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "border-b-2 px-2 py-3 text-[12.5px] font-semibold whitespace-nowrap transition-colors sm:px-3.5 sm:text-[14.5px]",
              isActive ? "border-brand-600 text-text-primary" : "border-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            {space.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Les onglets de la rubrique ouverte, puis — quand un onglet réunit plusieurs vues — ses vues en pastilles.
 * Rien ne se déplie : tout ce qu'on peut faire dans la rubrique se voit d'un coup d'œil.
 */
export function AdminSectionNav({ badges = {} }: { badges?: Record<string, number> }) {
  const pathname = usePathname();
  const active = activeNavItem(pathname);
  const { space, group } = active;
  if (space.groups.length === 0) return null;

  return (
    <div className="space-y-3" aria-label={`Dans ${space.label}`}>
      <div className="flex max-w-full overflow-x-auto">
        <div role="tablist" aria-label={`Onglets de ${space.label}`} className="inline-flex gap-0.5 rounded-xl bg-surface-sunken p-1">
          {space.groups.map((entry) => {
            const isActive = group?.key === entry.key;
            const badge = badges[entry.key] ?? 0;
            return (
              <Link
                key={entry.key}
                href={entry.items[0].href}
                role="tab"
                aria-selected={isActive}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13.5px] font-medium whitespace-nowrap transition-colors",
                  isActive ? "bg-surface-card text-text-primary shadow-xs" : "text-text-secondary hover:bg-surface-card/60 hover:text-text-primary",
                )}
              >
                {entry.label}
                {badge > 0 && <span className="rounded-full bg-warning-500 px-1.5 py-0.5 text-[10.5px] leading-none font-semibold text-ink-950 tabular-nums">{badge}</span>}
              </Link>
            );
          })}
        </div>
      </div>

      {group && group.items.length > 1 && !group.ownViewSwitcher && (
        <ul className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px]" aria-label={`Vues de ${group.label}`}>
          {group.items.map((item) => {
            const isActive = active.item?.href === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  title={item.description}
                  className={cn("rounded-full px-3 py-1 font-medium transition-colors", isActive ? "bg-brand-50 text-brand-800 dark:bg-brand-950 dark:text-brand-200" : "text-text-secondary hover:bg-surface-sunken hover:text-text-primary")}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
