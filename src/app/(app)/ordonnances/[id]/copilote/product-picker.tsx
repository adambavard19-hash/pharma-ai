"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Loader2, Package, Search } from "lucide-react";
import { Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/format";
import { PRODUCT_CATEGORY_LABELS } from "@/config/catalog";
import type { ProductCategoryCode } from "@/core/ai/types";
import type { ProductSearchResult } from "@/app/api/produits/recherche/route";

/** Recherche dans le stock de l'officine, limitée aux produits disponibles. */
export function ProductPicker({
  onSelect,
  disabled,
}: {
  onSelect: (productId: string, product: ProductSearchResult) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    // Le passage à l'état « chargement » est planifié, pas appliqué
    // synchroniquement dans l'effet : cela évite un rendu en cascade et
    // supprime le clignotement sur les réponses rapides.
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/produits/recherche?q=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal },
        );
        if (response.ok) {
          const data = (await response.json()) as { results: ProductSearchResult[] };
          setResults(data.results);
        }
      } catch {
        // Requête annulée : on conserve l'affichage précédent.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="space-y-3">
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Nom, marque, référence, EAN…"
        leadingIcon={
          loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />
        }
        autoFocus
      />

      {results.length === 0 && !loading ? (
        <p className="py-8 text-center text-[13px] text-text-tertiary">
          Aucun produit trouvé dans votre catalogue.
        </p>
      ) : (
        <ul className="max-h-[45vh] space-y-1.5 overflow-y-auto">
          {results.map((product) => (
            <li key={product.id}>
              <button
                type="button"
                disabled={disabled || product.status === "OUT_OF_STOCK"}
                onClick={() => onSelect(product.id, product)}
                className="flex w-full items-center gap-3 rounded-lg border border-border-subtle p-2.5 text-left transition-colors hover:border-brand-400 hover:bg-brand-50/50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-brand-950/40"
              >
                {product.imageUrl ? (
                  <Image
                    src={product.imageUrl}
                    alt=""
                    width={40}
                    height={40}
                    className="size-10 shrink-0 rounded-md object-cover"
                  />
                ) : (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-text-tertiary">
                    <Package className="size-4" />
                  </span>
                )}

                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-text-primary">
                    {product.name}
                  </span>
                  <span className="block truncate text-[12px] text-text-tertiary">
                    {product.brand ? `${product.brand} · ` : ""}
                    {PRODUCT_CATEGORY_LABELS[product.category as ProductCategoryCode]}
                  </span>
                </span>

                <span className="shrink-0 text-right">
                  <span className="block text-[13px] font-medium tabular text-text-primary">
                    {formatCents(product.salePriceCents)}
                  </span>
                  <Badge
                    tone={
                      product.status === "OUT_OF_STOCK"
                        ? "danger"
                        : product.status === "LOW_STOCK"
                          ? "warning"
                          : "success"
                    }
                  >
                    {product.status === "OUT_OF_STOCK"
                      ? "Rupture"
                      : `${product.quantity} en stock`}
                  </Badge>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
