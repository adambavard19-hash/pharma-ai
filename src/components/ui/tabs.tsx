"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type TabItem = {
  key: string;
  label: string;
  count?: number;
  icon?: ReactNode;
  /**
   * Onglet qui mène à une autre adresse plutôt qu'à un paramètre d'URL.
   * Utile quand une section est assez lourde pour mériter sa propre route mais
   * appartient visuellement au même écran.
   */
  href?: string;
};

/**
 * Onglets pilotés par l'URL : l'état est partageable et survit au rechargement.
 *
 * Un même jeu d'onglets peut mêler des vues d'une même page (paramètre `onglet`)
 * et des sections qui vivent sur leur propre route (`href`) — d'où `basePath`,
 * qui indique où ramènent les premières quand on se trouve sur les secondes.
 */
export function LinkTabs({
  items,
  paramName = "onglet",
  basePath,
  className,
  activeKey,
}: {
  items: TabItem[];
  paramName?: string;
  basePath?: string;
  className?: string;
  /** L'onglet à allumer, quand la page sait mieux que l'adresse lequel c'est (une ancienne adresse rattachée à un onglet). */
  activeKey?: string;
}) {
  // Hors du routeur (un rendu serveur isolé, un test), l'adresse est inconnue : on retombe sur l'onglet par défaut.
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const base = basePath ?? pathname;
  const defaultKey = items.find((item) => !item.href)?.key;

  const routed = items.find(
    (item) => item.href && (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  );
  const active = activeKey
    ? activeKey
    : routed
    ? routed.key
    : pathname === base
      ? (searchParams?.get(paramName) ?? defaultKey)
      : defaultKey;

  // L'indicateur glisse sous l'onglet actif : sa place et sa largeur sont mesurées sur l'onglet lui-même.
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const tab = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
      setIndicator(tab ? { left: tab.offsetLeft, width: tab.offsetWidth } : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, items.length]);

  return (
    <div className={cn("-mx-1 overflow-x-auto px-1 pb-1", className)}>
      <div ref={listRef} className="relative inline-flex min-w-max items-center gap-0.5 rounded-(--ui-radius-tabs) border border-border-subtle bg-surface-sunken/70 p-1" role="tablist">
        {indicator && (
          <span
            aria-hidden="true"
            className="absolute top-1 bottom-1 left-0 rounded-(--ui-radius-tab) bg-surface-card shadow-sm ring-1 ring-border-subtle transition-[transform,width] duration-200 ease-out"
            style={{ transform: `translateX(${indicator.left}px)`, width: indicator.width }}
          />
        )}
        {items.map((item) => {
          const params = new URLSearchParams(routed ? "" : (searchParams?.toString() ?? ""));
          if (item.key === defaultKey) params.delete(paramName);
          else params.set(paramName, item.key);
          const query = params.toString();
          const isActive = active === item.key;
          const href = item.href ?? `${base}${query ? `?${query}` : ""}`;

          return (
            <Link
              key={item.key}
              href={href}
              scroll={false}
              role="tab"
              aria-selected={isActive}
              className={cn(
                "relative z-10 flex h-9 items-center gap-2 rounded-(--ui-radius-tab) px-3.5 text-[13.5px] font-medium whitespace-nowrap transition-colors duration-150",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500",
                isActive
                  ? cn("text-brand-800 dark:text-brand-300", !indicator && "bg-surface-card shadow-sm")
                  : "text-text-secondary hover:bg-surface-card/60 hover:text-text-primary",
              )}
            >
              {item.icon}
              {item.label}
              {item.count !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] leading-none tabular transition-colors",
                    isActive
                      ? "bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200"
                      : "bg-surface-card text-text-tertiary ring-1 ring-border-subtle",
                  )}
                >
                  {item.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
