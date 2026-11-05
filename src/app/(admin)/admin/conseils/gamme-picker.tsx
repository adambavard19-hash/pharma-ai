"use client";

import { useEffect, useMemo, useState } from "react";
import { Layers, Loader2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { cn } from "@/lib/utils";

type GammeProduct = { ean: string; name: string; brand: string | null; inStock: boolean };
type Gamme = { key: string; label: string; products: GammeProduct[] };

/**
 * « Toute une gamme » (fondateur, 5 nov. 2026) : on tape « réhydratation », « chute de cheveux » ou une marque (« Hydratis »),
 * et PharmaBoost propose tous les produits de la famille, connus des pharmacies, ceux en stock d'abord, tous cochés. On décoche
 * ce qu'on ne veut pas, puis « Ajouter ». `suggestFrom` : le dernier produit choisi à la main — PharmaBoost propose alors la
 * gamme à laquelle il appartient, sans rien taper.
 */
export function GammePicker({ onAdd, exclude, suggestFrom, label }: { onAdd: (products: { ean: string; name: string; brand: string | null }[]) => void; exclude: string[]; suggestFrom?: string | null; label: string }) {
  const [query, setQuery] = useState("");
  const [found, setGammes] = useState<Gamme[]>([]);
  const [loading, setLoading] = useState(false);
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const asked = query.trim() || suggestFrom || "";
  const excluded = useMemo(() => new Set(exclude), [exclude]);
  const gammes = asked.trim().length >= 3 ? found : [];

  useEffect(() => {
    if (asked.trim().length < 3) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/admin/conseils/gammes?q=${encodeURIComponent(asked)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : { gammes: [] }))
        .then((data: { gammes: Gamme[] }) => {
          setGammes(data.gammes ?? []);
          setUnchecked(new Set());
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [asked]);

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-brand-300 bg-brand-50/40 p-3 dark:border-brand-800 dark:bg-brand-950/20">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-text-primary">
        <Sparkles className="size-4 text-brand-600" aria-hidden="true" /> {label}
      </p>
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="« réhydratation », « chute de cheveux », « Hydratis »…" aria-label={label} />
      {!query.trim() && suggestFrom && gammes.length > 0 && <p className="text-[12.5px] text-text-secondary">« {suggestFrom} » fait partie de ces gammes : ajoutez les autres produits d&apos;un coup.</p>}
      {loading && (
        <p className="flex items-center gap-1.5 text-[12.5px] text-text-tertiary">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Recherche des produits de la gamme…
        </p>
      )}
      {!loading && query.trim().length >= 3 && gammes.length === 0 && <p className="text-[12.5px] text-text-tertiary">Aucune gamme reconnue pour « {query.trim()} ». Essayez un autre mot, ou ajoutez les produits un par un.</p>}
      {gammes.map((gamme) => {
        const available = gamme.products.filter((product) => !excluded.has(product.ean));
        const chosen = available.filter((product) => !unchecked.has(product.ean));
        return (
          <div key={gamme.key} className="rounded-lg border border-border-subtle bg-surface-card p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-text-primary">
                <Layers className="size-4 text-brand-600" aria-hidden="true" /> {gamme.label}
                <span className="font-normal text-text-tertiary">· {gamme.products.length} produit{gamme.products.length > 1 ? "s" : ""}</span>
              </p>
              <div className="flex items-center gap-2">
                <button type="button" className="text-[12px] font-medium text-brand-700 hover:underline" onClick={() => setUnchecked((set) => (chosen.length === available.length ? new Set([...set, ...available.map((p) => p.ean)]) : new Set([...set].filter((ean) => !available.some((p) => p.ean === ean)))))}>
                  {chosen.length === available.length ? "Tout décocher" : "Tout cocher"}
                </button>
                <Button size="sm" disabled={chosen.length === 0} leadingIcon={<Plus className="size-3.5" />} onClick={() => onAdd(chosen.map(({ ean, name, brand }) => ({ ean, name, brand })))}>
                  Ajouter {chosen.length}
                </Button>
              </div>
            </div>
            {available.length === 0 ? (
              <p className="mt-1.5 text-[12.5px] text-text-tertiary">Toute la gamme est déjà ajoutée.</p>
            ) : (
              <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto pr-1">
                {available.map((product) => {
                  const on = !unchecked.has(product.ean);
                  return (
                    <li key={product.ean}>
                      <label className={cn("flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-[13px]", on ? "text-text-primary" : "text-text-tertiary")}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => setUnchecked((set) => { const next = new Set(set); if (next.has(product.ean)) next.delete(product.ean); else next.add(product.ean); return next; })}
                          className="size-4 accent-brand-600"
                        />
                        <span className="min-w-0 flex-1 truncate">{product.name}</span>
                        {product.inStock ? <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 text-[11px] font-medium text-emerald-700">en stock</span> : <span className="shrink-0 text-[11px] text-text-tertiary">pas en stock</span>}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
