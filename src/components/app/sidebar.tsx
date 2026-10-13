"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LifeBuoy, X } from "lucide-react";
import { NAVIGATION, groupNavigation, isNavItemActive, type NavItem } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { Robot } from "@/components/robot";
import { useCounterLook } from "@/components/robot/counter-look-context";
import { AlertBadge, useRobotAlerts } from "@/components/robot/robot-alerts";
import { useRobotInBrowser } from "@/components/robot/robot-presence";
import { openIsland } from "@/components/island/platform-island";
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
  const counterLook = useCounterLook();
  const robotAlerts = useRobotAlerts();
  // Sur le PC où le logiciel PharmaBoost installé a déjà son robot, le menu n'en montre pas un second.
  const robotHere = useRobotInBrowser();
  const pathname = usePathname();
  // Ce que le robot signale se lit dans l'île, en haut de l'écran : toucher le robot du menu (ou son compte) l'ouvre.
  const alerts = robotAlerts?.alerts ?? [];
  const alertsTitle = alerts.length > 0 ? `${alerts.length} chose${alerts.length > 1 ? "s" : ""} à vous dire` : undefined;
  const granted = new Set(permissions);
  // La phrase de l'entrée survolée (ou atteinte au clavier), en bulle à droite du menu, sur grand écran.

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
          "fixed inset-y-0 left-0 z-40 flex w-[320px] flex-col border-r border-border-subtle bg-surface-sidebar",
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
          {/* Le robot vivant, aux couleurs du comptoir de la personne (le robot de la marque si elle n'en a pas) : il respire,
              cligne des yeux, rit quand on le touche. Hors du lien, pour qu'on puisse le toucher sans changer de page. */}
          <div className="flex min-w-0 items-center gap-2">
            {robotHere && (
              <div
                className="relative shrink-0"
                onClick={() => alerts.length > 0 && openIsland("home")}
                title={alertsTitle}
              >
                <Robot size={42} interactive listen mood={robotAlerts?.mood} look={counterLook?.look} label={counterLook ? counterLook.caption : "Le robot PharmaBoost"} />
                <AlertBadge alerts={alerts} className="-top-1 -right-1.5" />
              </div>
            )}
            <Link href="/" className="min-w-0 rounded-md">
              <p className="text-sm leading-5 font-bold tracking-[-0.025em] text-text-primary">
                Pharma<span className="text-brand-700 dark:text-brand-400">Boost</span>
              </p>
              <p className="truncate text-xs leading-4 text-text-tertiary">{pharmacyName}</p>
            </Link>
            {/* Sans robot sur ce PC, le compte de ce qu'il signale reste au menu : le toucher ouvre l'île (sans robot). */}
            {!robotHere && alerts.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  closeNav();
                  openIsland("home");
                }}
                title={alertsTitle}
                aria-label={`${alertsTitle} : ouvrir l'île PharmaBoost`}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                <AlertBadge alerts={alerts} className="static" />
              </button>
            )}
          </div>
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
              aria-describedby="nav-hint-primary"
              aria-current={isNavItemActive(primary, pathname) ? "page" : undefined}
              className={cn(
                // L'entrée principale, claire et élégante : fond doux de la teinte de marque, texte foncé, l'icône porte le vert.
                "group relative flex h-11 items-center gap-2.5 rounded-lg border border-brand-200 bg-brand-50 px-2.5 text-sm font-semibold text-brand-900 transition-colors duration-150",
                "hover:border-brand-300 hover:bg-brand-100",
                "aria-[current=page]:border-brand-300 aria-[current=page]:bg-brand-100",
                "dark:border-brand-800 dark:bg-brand-950/60 dark:text-brand-100 dark:hover:bg-brand-950 dark:aria-[current=page]:bg-brand-950",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-gradient text-white shadow-xs">
                <primary.icon className="size-4" aria-hidden="true" />
              </span>
              {primary.label}
              <span id="nav-hint-primary" hidden>
                {primary.description}
              </span>
            </Link>
          </div>
        )}

        <nav aria-label="Menu" className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {groups.map((group, index) => (
            <div key={group.key} className={cn(index > 0 && "mt-4 border-t border-border-subtle pt-4")}>
              <p className="px-3 pb-2 text-[11px] font-semibold tracking-[0.08em] text-text-tertiary uppercase">{group.label}</p>
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
              <span className="min-w-5 rounded-full bg-brand-700 px-1.5 text-center text-[11px] leading-5 font-semibold text-white tabular" aria-label={`${supportUnread} réponse${supportUnread > 1 ? "s" : ""} non lue${supportUnread > 1 ? "s" : ""}`}>
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
  const hintId = `nav-hint-${item.href.replace(/[^a-z0-9]+/gi, "-")}`;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      aria-describedby={hintId}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1 text-sm transition-colors duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500",
        isActive
          ? "bg-brand-100/80 font-semibold text-brand-900 dark:bg-brand-950 dark:text-brand-200"
          : "text-text-primary hover:bg-surface-sunken",
      )}
    >
      {/* La barre d'accent de l'entrée active. */}
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brand-700 transition-[opacity,transform] duration-200 dark:bg-brand-400",
          isActive ? "scale-y-100 opacity-100" : "scale-y-50 opacity-0",
        )}
      />
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors duration-150",
          isActive ? "bg-surface-card text-brand-700 shadow-xs dark:bg-brand-900 dark:text-brand-300" : "text-text-secondary group-hover:text-text-primary",
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{item.label}</span>
        {item.subtitle && <span className="block text-[12px] leading-4 font-normal text-text-tertiary">{item.subtitle}</span>}
      </span>
      <span id={hintId} hidden>
        {item.description}
      </span>
    </Link>
  );
}
