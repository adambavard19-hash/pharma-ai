"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { ADMIN_NAV, activeNavItem, type AdminNavSpace } from "@/core/admin/nav";
import { cn } from "@/lib/utils";

/**
 * La navigation de la console : six espaces, chacun avec son menu. Un clic
 * sur l'espace ouvre le menu (clavier compris) ; la page courante est
 * soulignée, et sa rubrique cochée dans le menu.
 */
export function AdminNav({ unread = 0 }: { unread?: number }) {
  const pathname = usePathname();
  const active = activeNavItem(pathname);
  // Le menu ouvert est rattaché à la page où il a été ouvert : changer de page le referme, sans effet.
  const [opened, setOpened] = useState<{ key: string; path: string } | null>(null);
  const openKey = opened?.path === pathname ? opened.key : null;
  const setOpenKey = (key: string | null) => setOpened(key ? { key, path: pathname } : null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!openKey) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpened(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpened(null);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openKey]);

  return (
    <nav ref={navRef} className="-mb-px flex flex-wrap items-center gap-0.5" aria-label="Espaces de la console">
      {ADMIN_NAV.map((space) => {
        const isActive = active.space.key === space.key;
        if (space.items.length === 0) {
          return (
            <Link key={space.key} href={space.href} aria-current={isActive ? "page" : undefined} className={tabClass(isActive)}>
              {space.label}
            </Link>
          );
        }
        const open = openKey === space.key;
        return (
          <div key={space.key} className="relative">
            <button type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpenKey(open ? null : space.key)} className={cn(tabClass(isActive), "inline-flex items-center gap-1")}>
              {space.label}
              {space.key === "communication" && unread > 0 && <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10.5px] leading-none font-semibold text-white tabular-nums">{unread}</span>}
              <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
            </button>
            {open && <SpaceMenu space={space} activeHref={active.item?.href ?? null} unread={unread} />}
          </div>
        );
      })}
    </nav>
  );
}

function tabClass(active: boolean) {
  return cn(
    "border-b-2 px-3 py-2.5 text-[13.5px] font-medium whitespace-nowrap transition-colors",
    active ? "border-brand-600 text-brand-700 dark:text-brand-400" : "border-transparent text-text-secondary hover:text-text-primary",
  );
}

function SpaceMenu({ space, activeHref, unread }: { space: AdminNavSpace; activeHref: string | null; unread: number }) {
  return (
    <div role="menu" className="absolute top-full left-0 z-50 mt-1 w-[22rem] rounded-xl border border-border-subtle bg-surface-card p-1.5 shadow-xl animate-[slide-up_0.15s_ease-out] motion-reduce:animate-none">
      {space.items.map((item) => {
        const current = item.href === activeHref;
        return (
          <Link key={item.href} href={item.href} role="menuitem" aria-current={current ? "page" : undefined} className={cn("flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors", current ? "bg-brand-50 dark:bg-brand-950/50" : "hover:bg-surface-sunken")}>
            <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", current ? "bg-brand-600" : "bg-border-strong")} aria-hidden="true" />
            <span className="min-w-0">
              <span className={cn("flex items-center gap-1.5 text-[13.5px] font-semibold", current ? "text-brand-800 dark:text-brand-200" : "text-text-primary")}>
                {item.label}
                {item.href === "/admin/notifications" && unread > 0 && <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[10.5px] leading-none text-white tabular-nums">{unread}</span>}
              </span>
              <span className="mt-0.5 block text-[12px] leading-4 text-text-secondary">{item.description}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
