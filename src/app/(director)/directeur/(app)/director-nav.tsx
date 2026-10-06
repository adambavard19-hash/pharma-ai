"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Award, ChevronDown, Euro, FileText, Home, UserPlus, Users, type LucideIcon } from "lucide-react";
import { DIRECTOR_NAV, activeDirectorNavItem, type DirectorNavKey } from "@/core/sales/director/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<DirectorNavKey, LucideIcon> = {
  "tableau-de-bord": Home,
  commerciaux: Users,
  candidatures: UserPlus,
  commissions: Euro,
  factures: FileText,
  challenges: Award,
};

/**
 * Le menu du directeur. Sur grand écran : six onglets, la page courante
 * soulignée. Sur téléphone : un seul bouton qui nomme la page courante et
 * déplie la liste ; changer de page la referme.
 */
export function DirectorNav() {
  const pathname = usePathname();
  const active = activeDirectorNavItem(pathname);
  // Le menu déplié est rattaché à la page où il a été ouvert : naviguer le referme, sans effet de bord.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const ActiveIcon = ICONS[active?.key ?? "tableau-de-bord"];

  return (
    <>
      <nav aria-label="Rubriques de l'espace" className="-mb-px hidden items-center gap-0.5 sm:flex">
        {DIRECTOR_NAV.map((item) => {
          const current = item.key === active?.key;
          const Icon = ICONS[item.key];
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13.5px] font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500",
                current ? "border-brand-600 text-brand-700 dark:text-brand-400" : "border-transparent text-text-secondary hover:text-text-primary",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <nav aria-label="Rubriques de l'espace" className="pb-2 sm:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="director-menu"
          onClick={() => setOpenedOn(open ? null : pathname)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-border-default bg-surface-card px-3 py-2.5 text-left text-[14px] font-medium text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <span className="flex min-w-0 items-center gap-2">
            <ActiveIcon className="size-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
            <span className="truncate">{active?.label ?? "Menu"}</span>
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-text-tertiary transition-transform", open && "rotate-180")} aria-hidden="true" />
        </button>
        {open && (
          <ul id="director-menu" className="mt-1.5 max-h-[calc(100dvh-9rem)] overflow-y-auto rounded-lg border border-border-subtle bg-surface-card shadow-md">
            {DIRECTOR_NAV.map((item) => {
              const current = item.key === active?.key;
              const Icon = ICONS[item.key];
              return (
                <li key={item.key} className="border-b border-border-subtle last:border-b-0">
                  <Link
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    className={cn("flex items-start gap-3 px-3 py-3 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-500", current ? "bg-brand-50 dark:bg-brand-950/50" : "hover:bg-surface-sunken")}
                  >
                    <Icon className={cn("mt-0.5 size-[18px] shrink-0", current ? "text-brand-600 dark:text-brand-400" : "text-text-tertiary")} aria-hidden="true" />
                    <span className="min-w-0">
                      <span className={cn("block text-[14px] font-medium", current ? "text-brand-800 dark:text-brand-200" : "text-text-primary")}>{item.label}</span>
                      <span className="block text-[12px] leading-4 text-text-secondary">{item.description}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </>
  );
}
