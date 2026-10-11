"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUserRound, Compass, GraduationCap, House, Trophy, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { RobotMark, Wordmark } from "./ui";

/**
 * Les cinq onglets de PharmaBoost Mobile. Au téléphone et à la tablette : la barre du bas, comme une application
 * native (cibles de 56 px, zone sûre de l'iPhone respectée). À partir de 1024 px : un rail sur la gauche, la colonne
 * de contenu restant centrée.
 */
export const MOBILE_TABS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/m", label: "Accueil", icon: House },
  { href: "/m/formations", label: "Formations", icon: GraduationCap },
  { href: "/m/decouvertes", label: "Découvertes", icon: Compass },
  { href: "/m/challenges", label: "Challenges", icon: Trophy },
  { href: "/m/moi", label: "Mon espace", icon: CircleUserRound },
];

/** L'onglet actif : le préfixe le plus long qui correspond (« /m/officine » allume « Mon espace »). */
export function activeTab(pathname: string): string {
  if (pathname === "/m/officine") return "/m/moi";
  const match = MOBILE_TABS.filter((tab) => (tab.href === "/m" ? pathname === "/m" : pathname === tab.href || pathname.startsWith(`${tab.href}/`)));
  return match.at(-1)?.href ?? "/m";
}

export function BottomTabBar() {
  const current = activeTab(usePathname());
  return (
    <nav aria-label="Navigation principale" className="m-safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-ink-200/70 bg-white/85 backdrop-blur-xl backdrop-saturate-150 lg:hidden">
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-5">
        {MOBILE_TABS.map((tab) => {
          const active = tab.href === current;
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex flex-1 flex-col items-center justify-center gap-1 text-[10.5px] font-semibold tracking-[-0.01em] transition-colors",
                  active ? "text-brand-800" : "text-ink-500 active:text-ink-700",
                )}
              >
                <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-all duration-200", active ? "bg-brand-100" : "group-active:scale-90")}>
                  <Icon className="size-[22px]" strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" />
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideRail() {
  const current = activeTab(usePathname());
  return (
    <nav aria-label="Navigation principale" className="fixed inset-y-0 left-0 z-40 hidden w-[104px] flex-col items-center border-r border-ink-200/70 bg-white/80 py-6 backdrop-blur-xl lg:flex">
      <Link href="/m" className="mb-8 flex flex-col items-center gap-1.5" aria-label="PharmaBoost — accueil">
        <RobotMark size={40} />
        <Wordmark className="text-[12px]" />
      </Link>
      <ul className="flex flex-col gap-2">
        {MOBILE_TABS.map((tab) => {
          const active = tab.href === current;
          const Icon = tab.icon;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex w-[84px] flex-col items-center gap-1.5 rounded-2xl py-2.5 text-[11.5px] font-semibold transition-colors", active ? "text-brand-800" : "text-ink-500 hover:bg-ink-50 hover:text-ink-800")}
              >
                <span className={cn("flex h-8 w-14 items-center justify-center rounded-full transition-colors", active && "bg-brand-100")}>
                  <Icon className="size-[22px]" strokeWidth={active ? 2.3 : 1.9} aria-hidden="true" />
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
