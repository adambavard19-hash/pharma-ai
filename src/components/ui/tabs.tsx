"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

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
}: {
  items: TabItem[];
  paramName?: string;
  basePath?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const base = basePath ?? pathname;
  const defaultKey = items.find((item) => !item.href)?.key;

  const routed = items.find(
    (item) => item.href && (pathname === item.href || pathname.startsWith(`${item.href}/`)),
  );
  const active = routed
    ? routed.key
    : pathname === base
      ? (searchParams.get(paramName) ?? defaultKey)
      : defaultKey;

  return (
    <div
      className={cn("flex gap-1 overflow-x-auto border-b border-border-subtle", className)}
      role="tablist"
    >
      {items.map((item) => {
        const params = new URLSearchParams(routed ? "" : searchParams.toString());
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
              "-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13.5px] font-medium whitespace-nowrap transition-colors",
              isActive
                ? "border-brand-600 text-brand-700 dark:text-brand-400"
                : "border-transparent text-text-secondary hover:border-border-default hover:text-text-primary",
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] tabular",
                  isActive
                    ? "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300"
                    : "bg-surface-sunken text-text-tertiary",
                )}
              >
                {item.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
