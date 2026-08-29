"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import { cn } from "@/lib/utils";
import type { ProductCategoryCode } from "@/core/ai/types";

export function CategoryFilter({
  active,
  counts,
}: {
  active: ProductCategoryCode | null;
  counts: Record<string, number>;
}) {
  const searchParams = useSearchParams();

  const buildHref = (category: ProductCategoryCode | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (category) params.set("categorie", category);
    else params.delete("categorie");
    params.delete("page");
    params.set("onglet", "catalogue");
    return `/stock?${params.toString()}`;
  };

  const visible = PRODUCT_CATEGORIES.filter((category) => (counts[category] ?? 0) > 0);

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer par catégorie">
      <Chip href={buildHref(null)} isActive={active === null}>
        Toutes
        <Count value={Object.values(counts).reduce((a, b) => a + b, 0)} isActive={active === null} />
      </Chip>
      {visible.map((category) => (
        <Chip key={category} href={buildHref(category)} isActive={active === category}>
          {PRODUCT_CATEGORY_LABELS[category]}
          <Count value={counts[category] ?? 0} isActive={active === category} />
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  href,
  isActive,
  children,
}: {
  href: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-pressed={isActive}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
        isActive
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-border-default bg-surface-card text-text-secondary hover:border-border-strong hover:text-text-primary",
      )}
    >
      {children}
    </Link>
  );
}

function Count({ value, isActive }: { value: number; isActive: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 text-[11px] tabular",
        isActive ? "bg-white/20" : "bg-surface-sunken text-text-tertiary",
      )}
    >
      {value}
    </span>
  );
}
