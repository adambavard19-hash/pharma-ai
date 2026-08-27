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
};

/** Onglets pilotés par l'URL : l'état est partageable et survit au rechargement. */
export function LinkTabs({
  items,
  paramName = "onglet",
  className,
}: {
  items: TabItem[];
  paramName?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get(paramName) ?? items[0]?.key;

  return (
    <div
      className={cn("flex gap-1 overflow-x-auto border-b border-border-subtle", className)}
      role="tablist"
    >
      {items.map((item) => {
        const params = new URLSearchParams(searchParams.toString());
        if (item.key === items[0]?.key) params.delete(paramName);
        else params.set(paramName, item.key);
        const query = params.toString();
        const isActive = active === item.key;

        return (
          <Link
            key={item.key}
            href={`${pathname}${query ? `?${query}` : ""}`}
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
