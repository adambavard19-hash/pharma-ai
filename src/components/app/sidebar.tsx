"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LifeBuoy, X } from "lucide-react";
import { NAVIGATION, groupNavigation, isNavItemActive, type NavItem } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { PharmaWordmark } from "./logo";
import { useMobileNav } from "./mobile-nav";

export function Sidebar({
  permissions,
  pharmacyName,
  hiddenHrefs = [],
  supportUnread = 0,
}: {
  permissions: string[];
  pharmacyName: string;
  /** Réponses de l'équipe PharmaBoost pas encore lues : le chiffre du lien « Contact support ». */
  supportUnread?: number;
  /** Entrées retirées par la configuration (mode sans patient : Patients, Suivis). */
  hiddenHrefs?: string[];
}) {
  const { open: mobileOpen, closeNav } = useMobileNav();
  const pathname = usePathname();
  const granted = new Set(permissions);

  const items = NAVIGATION.filter((item) => granted.has(item.permission) && !hiddenHrefs.includes(item.href));
  const primary = items.find((item) => item.primary);
  const groups = groupNavigation(items);

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink-950/45 lg:hidden"
          onClick={closeNav}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[256px] flex-col border-r border-border-subtle bg-surface-sidebar",
          "transition-transform duration-250 lg:translate-x-0",
          // `invisible` et non `hidden` : la transition reste fluide, mais le
          // tiroir fermé sort du parcours de tabulation et de l'arbre
          // d'accessibilité. Sans cela, sur mobile, la première tabulation
          // emmène dans un menu qu'on ne voit pas.
          mobileOpen ? "translate-x-0" : "-translate-x-full invisible lg:visible",
        )}
        aria-label="Navigation principale"
      >
        <div className="flex items-center justify-between px-4 py-4">
          <Link href="/" className="min-w-0 rounded-md">
            <PharmaWordmark subtitle={pharmacyName} />
          </Link>
          <button
            type="button"
            onClick={closeNav}
            className="rounded-md p-1.5 text-text-tertiary lg:hidden"
            aria-label="Fermer la navigation"
          >
            <X className="size-4" />
          </button>
        </div>

        {primary && (
          <div className="px-3 pb-3">
            <Link
              href={primary.href}
              onClick={closeNav}
              aria-current={isNavItemActive(primary, pathname) ? "page" : undefined}
              className={cn(
                "flex h-11 items-center gap-2.5 rounded-md px-3.5 text-sm font-medium text-white shadow-xs transition-[filter]",
                "bg-brand-gradient hover:brightness-[0.93] active:brightness-[0.88]",
                "aria-[current=page]:ring-2 aria-[current=page]:ring-brand-300 aria-[current=page]:ring-offset-2 aria-[current=page]:ring-offset-surface-sidebar dark:aria-[current=page]:ring-brand-700",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
              )}
            >
              <primary.icon className="size-4" aria-hidden="true" />
              {primary.label}
            </Link>
          </div>
        )}

        <nav aria-label="Menu" className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((group, index) => (
            <div key={group.key} className={cn(index > 0 && "mt-3 border-t border-border-subtle pt-3")}>
              <p className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-[0.08em] text-text-tertiary uppercase">{group.label}</p>
              <ul className="space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <NavLink item={item} onNavigate={closeNav} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Toujours visible, hors du menu qui défile : l'aide est à un clic, quel que soit l'écran. */}
        <div className="border-t border-border-subtle px-3 pt-3">
          <Link
            href="/support"
            onClick={closeNav}
            aria-current={pathname === "/support" || pathname.startsWith("/support/") ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md border px-2.5 py-2 text-sm transition-colors",
              pathname === "/support" || pathname.startsWith("/support/") ? "border-brand-200 bg-brand-100 font-medium text-brand-800 dark:border-brand-800 dark:bg-brand-950 dark:text-brand-300" : "border-border-default bg-surface-card text-text-primary hover:bg-surface-sunken",
            )}
          >
            <LifeBuoy className="size-4 text-brand-700 dark:text-brand-400" aria-hidden="true" />
            <span className="flex-1">Contact support</span>
            {supportUnread > 0 && (
              <span className="min-w-5 rounded-full bg-brand-600 px-1.5 text-center text-[11px] leading-5 font-semibold text-white tabular" aria-label={`${supportUnread} réponse${supportUnread > 1 ? "s" : ""} non lue${supportUnread > 1 ? "s" : ""}`}>
                {supportUnread}
              </span>
            )}
          </Link>
        </div>

        <div className="px-4 py-3">
          <p className="text-xs leading-4 text-text-tertiary">
            PharmaBoost assiste le pharmacien.
            <br />
            La décision reste professionnelle.
          </p>
        </div>
      </aside>
    </>
  );
}

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const pathname = usePathname();
  const isActive = isNavItemActive(item, pathname);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-2.5 py-1.5 text-sm transition-colors",
        isActive
          ? "bg-brand-100 font-medium text-brand-800 dark:bg-brand-950 dark:text-brand-300"
          : "text-text-primary hover:bg-surface-sunken",
      )}
    >
      <span className={cn(isActive ? "text-brand-800 dark:text-brand-400" : "text-text-secondary")}>
        <Icon className="size-4" />
      </span>
      {item.label}
    </Link>
  );
}
