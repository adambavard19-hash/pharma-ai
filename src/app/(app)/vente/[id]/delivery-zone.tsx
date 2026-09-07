"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Package, ScanBarcode, ShoppingBag, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProductSearchResult } from "@/app/api/produits/recherche/route";

export type DeliveryExtra = {
  productId: string;
  name: string;
  brand: string | null;
  quantity: number;
  unitPriceCents: number;
};

/**
 * Zone 4 — ce que le patient emporte.
 *
 * Le comptoir ne délivre pas que des conseils : il y a les boîtes de
 * l'ordonnance, et parfois une référence que le patient demande de lui-même.
 * Cette zone rassemble ce qui sortira de la caisse, et rien d'autre.
 *
 * La distinction faite ici est la même que celle qui tient tout le produit :
 * une ligne issue d'un conseil accepté est attribuée à Pharma.ai, une référence
 * simplement scannée ne l'est pas. On aurait pu tout compter et gonfler le
 * chiffre ; c'est précisément ce que l'outil s'interdit.
 */
export function DeliveryZone({
  accepted,
  extras,
  onAddExtra,
  onRemoveExtra,
  canSell,
}: {
  accepted: { id: string; name: string; quantity: number; unitPriceCents: number }[];
  extras: DeliveryExtra[];
  onAddExtra: (product: ProductSearchResult) => void;
  onRemoveExtra: (productId: string) => void;
  canSell: boolean;
}) {
  const adviceTotal = accepted.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);
  const extrasTotal = extras.reduce((sum, l) => sum + l.unitPriceCents * l.quantity, 0);

  return (
    <section className="space-y-3" aria-labelledby="zone-delivrance">
      <h2 id="zone-delivrance" className="flex items-center gap-2">
        <ShoppingBag className="size-[18px] shrink-0 text-text-tertiary" />
        <span className="text-[15px] font-semibold tracking-wide text-text-primary uppercase">
          Délivrance
        </span>
      </h2>

      <Card>
        <CardContent className="space-y-4 pt-5 pb-5">
          {accepted.length === 0 && extras.length === 0 ? (
            <p className="text-[13px] text-text-tertiary">
              Rien à encaisser pour l&apos;instant. Les conseils acceptés arrivent ici, et vous
              pouvez scanner une référence que le patient demande de lui-même.
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {accepted.map((line) => (
                <li key={line.id} className="flex items-center gap-3 py-2.5">
                  <Package className="size-4 shrink-0 text-text-tertiary" />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-text-primary">
                    {line.name}
                    {line.quantity > 1 && (
                      <span className="text-text-tertiary"> × {line.quantity}</span>
                    )}
                  </span>
                  <Badge tone="brand">+ Vente additionnelle Pharma.ai</Badge>
                  <span className="shrink-0 text-[13.5px] font-medium tabular text-text-primary">
                    {formatCents(line.unitPriceCents * line.quantity)}
                  </span>
                </li>
              ))}

              {extras.map((line) => (
                <li key={line.productId} className="flex items-center gap-3 py-2.5">
                  <ScanBarcode className="size-4 shrink-0 text-text-tertiary" />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-text-primary">
                    {line.name}
                    {line.quantity > 1 && (
                      <span className="text-text-tertiary"> × {line.quantity}</span>
                    )}
                  </span>
                  <Badge tone="neutral">Scanné</Badge>
                  <span className="shrink-0 text-[13.5px] font-medium tabular text-text-primary">
                    {formatCents(line.unitPriceCents * line.quantity)}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveExtra(line.productId)}
                    aria-label={`Retirer ${line.name}`}
                    className="shrink-0 rounded-md p-1 text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-danger-600"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {canSell && <ScanField onSelect={onAddExtra} />}

          {(accepted.length > 0 || extras.length > 0) && (
            <p className="text-[11.5px] leading-4 text-text-tertiary">
              {formatCents(adviceTotal)} issus d&apos;un conseil accepté
              {extras.length > 0 && ` · ${formatCents(extrasTotal)} scannés hors conseil`}. Seul
              le premier montant est attribué à Pharma.ai.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/**
 * Champ de scan. Une douchette tape le code-barres puis « Entrée » : c'est un
 * champ texte ordinaire, et c'est justement ce qui le rend compatible avec
 * n'importe quel lecteur du marché. Le code EAN est cherché comme le nom.
 */
function ScanField({ onSelect }: { onSelect: (product: ProductSearchResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const needle = query.trim();
    const controller = new AbortController();

    // Tout passe par le minuteur, y compris la remise à zéro : appeler
    // `setState` dans le corps de l'effet déclencherait un rendu en cascade à
    // chaque frappe — et une douchette « tape » très vite.
    const timer = setTimeout(async () => {
      if (needle.length < 2) {
        setResults([]);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch(
          `/api/produits/recherche?q=${encodeURIComponent(needle)}`,
          { signal: controller.signal },
        );
        if (response.ok) {
          const data = (await response.json()) as { results: ProductSearchResult[] };
          setResults(data.results);
        }
      } catch {
        // Requête annulée : on garde l'affichage précédent.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const take = (product: ProductSearchResult) => {
    onSelect(product);
    setQuery("");
    setResults([]);
    inputRef.current?.focus();
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-tertiary">
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ScanBarcode className="size-4" />
          )}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Scanner un produit — code-barres ou nom"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Une douchette termine par « Entrée ». Un résultat unique est
            // alors ajouté sans clic : au comptoir, la main est déjà sur la
            // boîte suivante.
            if (event.key === "Enter") {
              event.preventDefault();
              if (results.length === 1) take(results[0]);
            }
          }}
          className={cn(
            "w-full rounded-lg border border-dashed border-border-default bg-surface-sunken/40 py-2.5 pr-3 pl-9",
            "text-[13.5px] text-text-primary placeholder:text-text-tertiary",
            "focus:border-brand-500 focus:bg-surface-card focus:ring-2 focus:ring-brand-500/20 focus:outline-none",
          )}
        />
      </div>

      {results.length > 0 && (
        <ul className="max-h-56 overflow-y-auto rounded-lg border border-border-default p-1">
          {results.slice(0, 6).map((product) => (
            <li key={product.id}>
              <button
                type="button"
                onClick={() => take(product)}
                disabled={product.quantity <= 0}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-surface-sunken disabled:opacity-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-text-primary">
                    {product.name}
                  </span>
                  <span className="block text-[11.5px] text-text-tertiary">
                    {product.brand ? `${product.brand} · ` : ""}
                    {product.quantity > 0 ? `${product.quantity} en rayon` : "rupture"}
                  </span>
                </span>
                <span className="shrink-0 text-[13px] font-medium tabular text-text-primary">
                  {formatCents(product.salePriceCents)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
