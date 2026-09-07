"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Package, Pill, Plus, Search } from "lucide-react";
import { addToStockAction } from "@/server/actions/stock";
import type { StockSearchHit } from "@/app/api/stock/recherche/route";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Ajouter au stock en trois gestes : chercher, choisir, dire combien.
 *
 * Les médicaments viennent du catalogue national, les produits de celui de
 * l'officine ; s'il n'y a rien, on crée un produit de l'officine — jamais un
 * médicament, le catalogue national n'est pas à nous.
 */
export function AddToStock({ canManage }: { canManage: boolean }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<StockSearchHit[]>([]);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<StockSearchHit | { kind: "NEW" } | null>(null);

  useEffect(() => {
    const needle = query.trim();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (needle.length < 2) {
        setHits([]);
        setUnknownCode(null);
        return;
      }
      setSearching(true);
      try {
        const response = await fetch(`/api/stock/recherche?q=${encodeURIComponent(needle)}`, { signal: controller.signal });
        if (response.ok) {
          const data = (await response.json()) as { results: StockSearchHit[]; unknownCode: string | null };
          setHits(data.results);
          setUnknownCode(data.unknownCode);
        }
      } catch {
        // requête annulée
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 220);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  if (selected) {
    return (
      <QuantityForm
        selected={selected}
        canManage={canManage}
        defaultName={selected.kind === "NEW" ? query : ""}
        defaultCode={selected.kind === "NEW" ? unknownCode : null}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-text-tertiary">
          {searching ? <Loader2 className="size-5 animate-spin" /> : <Search className="size-5" />}
        </span>
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nom du produit, code CIP ou code-barres"
          className="w-full rounded-xl border border-border-default bg-surface-card py-3.5 pr-4 pl-12 text-[16px] text-text-primary placeholder:text-text-tertiary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
        />
      </div>

      {hits.length > 0 && (
        <ul className="overflow-hidden rounded-xl border border-border-subtle bg-surface-card divide-y divide-border-subtle">
          {hits.map((hit) => (
            <li key={`${hit.kind}-${hit.id}`}>
              <button type="button" onClick={() => setSelected(hit)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-sunken/60">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-text-tertiary">
                  {hit.kind === "DRUG" ? <Pill className="size-4" /> : <Package className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium text-text-primary">{hit.label}</span>
                  <span className="block truncate text-[12px] text-text-tertiary">
                    {[hit.detail, hit.code ? (hit.kind === "DRUG" ? `CIP ${hit.code}` : `EAN ${hit.code}`) : null, hit.kind === "DRUG" ? "catalogue national" : "produit de l'officine"].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-[14px] font-medium tabular text-text-primary">{hit.priceCents !== null ? formatCents(hit.priceCents) : "—"}</span>
                  <span className="block text-[12px] text-text-tertiary">{hit.quantity === null ? "pas encore suivi" : `${hit.quantity} en stock`}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.trim().length >= 2 && !searching && (
        canManage ? (
          <button
            type="button"
            onClick={() => setSelected({ kind: "NEW" })}
            className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border-default px-4 py-3 text-left text-[13.5px] text-text-secondary transition-colors hover:border-brand-400 hover:text-text-primary"
          >
            <Plus className="size-4" />
            {hits.length === 0 ? "Aucune correspondance —" : "Pas dans la liste ?"} créer « {query.trim()} » comme produit de l&apos;officine
            {unknownCode && <span className="text-text-tertiary">(code {unknownCode})</span>}
          </button>
        ) : hits.length === 0 ? (
          <p className="text-[13px] text-text-tertiary">Aucune correspondance. La création d&apos;un produit est réservée au titulaire.</p>
        ) : null
      )}
    </div>
  );
}

function QuantityForm({
  selected,
  canManage,
  defaultName,
  defaultCode,
  onBack,
}: {
  selected: StockSearchHit | { kind: "NEW" };
  canManage: boolean;
  defaultName: string;
  defaultCode: string | null;
  onBack: () => void;
}) {
  const isNew = selected.kind === "NEW";
  const hit = isNew ? null : selected;
  const [name, setName] = useState(defaultName);
  const [code, setCode] = useState(defaultCode ?? "");
  const [quantity, setQuantity] = useState(hit?.quantity !== null && hit?.quantity !== undefined ? String(hit.quantity) : "1");
  const [price, setPrice] = useState(hit?.priceCents !== null && hit?.priceCents !== undefined ? (hit.priceCents / 100).toFixed(2).replace(".", ",") : "");
  const [purchase, setPurchase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const toCents = (value: string): number | null => {
    if (value.trim() === "") return null;
    const number = Number(value.replace(/[€\s]/g, "").replace(",", "."));
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : NaN;
  };

  const submit = () => {
    setError(null);
    const qty = Number.parseInt(quantity, 10);
    if (!Number.isFinite(qty) || qty < 0) return setError("Quantité invalide.");
    const salePriceCents = toCents(price);
    const purchasePriceCents = toCents(purchase);
    if (Number.isNaN(salePriceCents) || Number.isNaN(purchasePriceCents)) return setError("Prix invalide. Utilisez le format 6,90.");

    startTransition(async () => {
      const result = await addToStockAction(
        isNew
          ? { kind: "NEW_PRODUCT", name, ean: code || null, quantity: qty, salePriceCents: salePriceCents ?? 0, purchasePriceCents }
          : hit!.kind === "DRUG"
            ? { kind: "DRUG", cip13: hit!.code ?? "", quantity: qty, ...(canManage && salePriceCents !== null ? { salePriceCents } : {}) }
            : { kind: "PRODUCT", productId: hit!.id, quantity: qty, ...(canManage ? { salePriceCents, purchasePriceCents } : {}) },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      push({ tone: "success", title: result.message ?? "Ajouté au stock" });
      router.push("/stock");
    });
  };

  return (
    <Card>
      <CardContent className="space-y-5 py-6">
        <div>
          <p className="text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">{isNew ? "Nouveau produit de l'officine" : hit!.kind === "DRUG" ? "Médicament" : "Produit de l'officine"}</p>
          <p className="mt-1 text-[20px] font-semibold text-text-primary">{isNew ? name || "Produit" : hit!.label}</p>
          {!isNew && hit!.detail && <p className="text-[13px] text-text-secondary">{hit!.detail}</p>}
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        {isNew && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nom du produit" htmlFor="new-name" required>
              <Input id="new-name" value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Code-barres (EAN)" htmlFor="new-code" hint="Facultatif">
              <Input id="new-code" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" />
            </Field>
          </div>
        )}

        <div className={cn("grid gap-4", canManage ? "sm:grid-cols-3" : "sm:grid-cols-1")}>
          <Field label="Quantité en stock" htmlFor="qty" required>
            <Input id="qty" type="number" min={0} value={quantity} onChange={(event) => setQuantity(event.target.value)} className="text-[18px] font-semibold" />
          </Field>
          {canManage && (
            <>
              <Field label="Prix TTC" htmlFor="price" hint={hit?.kind === "DRUG" ? "Vide = prix public du catalogue" : undefined}>
                <Input id="price" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="6,90" inputMode="decimal" />
              </Field>
              {hit?.kind !== "DRUG" && (
                <Field label="Prix d'achat" htmlFor="purchase" hint="Facultatif, pour la marge">
                  <Input id="purchase" value={purchase} onChange={(event) => setPurchase(event.target.value)} placeholder="3,10" inputMode="decimal" />
                </Field>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onBack} disabled={pending}>
            Retour
          </Button>
          <Button size="lg" onClick={submit} loading={pending} leadingIcon={<Plus className="size-[18px]" />}>
            Ajouter au stock
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
