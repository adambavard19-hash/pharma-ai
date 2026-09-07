"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Loader2, Pill, Package } from "lucide-react";
import { setQuantityAction } from "@/server/actions/stock";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";

export type StockRow = {
  kind: "PRODUCT" | "DRUG";
  id: string;
  name: string;
  detail: string | null;
  code: string | null;
  quantity: number;
  threshold: number;
  priceCents: number | null;
  /** Visible seulement pour qui gère le catalogue. */
  purchasePriceCents: number | null;
  active: boolean;
  href: string;
  updatedAt: string;
};

type StateKey = "tous" | "stock" | "faible" | "rupture" | "inactif";

const STATE_LABELS: Record<StateKey, string> = {
  tous: "Tous",
  stock: "En stock",
  faible: "Stock faible",
  rupture: "Ruptures",
  inactif: "Désactivés",
};

function stateOf(row: StockRow): Exclude<StateKey, "tous"> {
  if (!row.active) return "inactif";
  if (row.quantity <= 0) return "rupture";
  if (row.threshold > 0 && row.quantity <= row.threshold) return "faible";
  return "stock";
}

/**
 * La liste du stock, compacte : produit, quantité, prix, état.
 *
 * La quantité est un champ, pas un texte : « 8 » devient « 12 » en tapant et
 * en validant, et l'inventaire est consigné. Le reste de la ligne mène à la
 * fiche.
 */
export function StockList({
  rows,
  total,
  filter,
  counts,
  page,
  totalPages,
  query,
  canAdjust,
  canManage,
}: {
  rows: StockRow[];
  total: number;
  filter: string;
  counts: Record<StateKey, number>;
  page: number;
  totalPages: number;
  query: string;
  canAdjust: boolean;
  canManage: boolean;
}) {
  const href = (state: StateKey, nextPage = 1) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (state !== "tous") search.set("etat", state);
    if (nextPage > 1) search.set("page", String(nextPage));
    const text = search.toString();
    return `/stock${text ? `?${text}` : ""}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {(Object.keys(STATE_LABELS) as StateKey[]).map((state) => (
          <Link
            key={state}
            href={href(state)}
            className={cn(
              "rounded-full border px-3 py-1 text-[12.5px] transition-colors",
              filter === state
                ? "border-brand-600 bg-brand-600 text-white"
                : "border-border-default text-text-secondary hover:border-border-strong",
            )}
          >
            {STATE_LABELS[state]} <span className="tabular opacity-80">{counts[state]}</span>
          </Link>
        ))}
        <span className="ml-auto text-[12.5px] text-text-tertiary tabular">
          {total} référence{total > 1 ? "s" : ""}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface-card">
        <div className="hidden grid-cols-[minmax(0,1fr)_110px_120px_130px_28px] gap-3 border-b border-border-subtle bg-surface-sunken/60 px-4 py-2 text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase sm:grid">
          <span>Produit</span>
          <span className="text-right">Stock</span>
          <span className="text-right">Prix</span>
          <span>État</span>
          <span />
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13.5px] text-text-secondary">
            {query ? "Aucun produit ne correspond à cette recherche." : "Aucun produit dans cette liste."}
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {rows.map((row) => (
              <StockLine key={`${row.kind}-${row.id}`} row={row} canAdjust={canAdjust} canManage={canManage} />
            ))}
          </ul>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-text-tertiary">Page {page} sur {totalPages}</p>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" disabled={page <= 1}>
              <Link href={href(filter as StateKey, page - 1)}>Précédent</Link>
            </Button>
            <Button asChild variant="outline" size="sm" disabled={page >= totalPages}>
              <Link href={href(filter as StateKey, page + 1)}>Suivant</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const STATE_STYLES: Record<Exclude<StateKey, "tous">, { dot: string; label: string }> = {
  stock: { dot: "bg-success-500", label: "En stock" },
  faible: { dot: "bg-warning-500", label: "Stock faible" },
  rupture: { dot: "bg-danger-500", label: "Rupture" },
  inactif: { dot: "bg-text-tertiary/40", label: "Désactivé" },
};

function StockLine({ row, canAdjust, canManage }: { row: StockRow; canAdjust: boolean; canManage: boolean }) {
  const state = stateOf(row);
  const style = STATE_STYLES[state];

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_110px_120px_130px_28px]">
      <Link href={row.href} className="flex min-w-0 items-center gap-3 hover:underline">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-text-tertiary">
          {row.kind === "DRUG" ? <Pill className="size-4" /> : <Package className="size-4" />}
        </span>
        <span className="min-w-0">
          <span className={cn("block truncate text-[14px] font-medium text-text-primary", !row.active && "text-text-tertiary line-through")}>
            {row.name}
          </span>
          <span className="block truncate text-[12px] text-text-tertiary">
            {[row.detail, row.code ? (row.kind === "DRUG" ? `CIP ${row.code}` : `EAN ${row.code}`) : null].filter(Boolean).join(" · ")}
          </span>
        </span>
      </Link>

      <div className="flex justify-end">
        {canAdjust && row.active ? (
          <QuantityField row={row} />
        ) : (
          <span className="text-[15px] font-semibold tabular text-text-primary">{row.quantity}</span>
        )}
      </div>

      <span className="text-right text-[14px] font-medium tabular text-text-primary">
        {row.priceCents !== null ? formatCents(row.priceCents) : "—"}
        {canManage && row.purchasePriceCents !== null && row.purchasePriceCents > 0 && (
          <span className="block text-[11.5px] font-normal text-text-tertiary">achat {formatCents(row.purchasePriceCents)}</span>
        )}
      </span>

      <span className="flex items-center gap-2 text-[13px] text-text-secondary">
        <span className={cn("size-2 shrink-0 rounded-full", style.dot)} />
        {style.label}
      </span>

      <Link href={row.href} aria-label={`Détails de ${row.name}`} className="hidden text-text-tertiary hover:text-text-secondary sm:block">
        <ChevronRight className="size-4" />
      </Link>
    </li>
  );
}

/** Le champ de quantité : tape, valide, c'est enregistré. */
function QuantityField({ row }: { row: StockRow }) {
  const [value, setValue] = useState(String(row.quantity));
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const commit = () => {
    const next = Number.parseInt(value, 10);
    if (!Number.isFinite(next) || next < 0) {
      setValue(String(row.quantity));
      return;
    }
    if (next === row.quantity) return;
    startTransition(async () => {
      const result = await setQuantityAction({ kind: row.kind, id: row.id, quantity: next });
      if (!result.ok) {
        push({ tone: "error", title: result.error });
        setValue(String(row.quantity));
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      router.refresh();
    });
  };

  return (
    <span className="relative inline-flex items-center">
      <input
        type="number"
        min={0}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          if (event.key === "Escape") setValue(String(row.quantity));
        }}
        aria-label={`Quantité de ${row.name}`}
        className={cn(
          "w-[84px] rounded-lg border border-border-default bg-surface-card px-2.5 py-1.5 text-right text-[15px] font-semibold tabular text-text-primary",
          "focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none",
          pending && "opacity-60",
        )}
      />
      {pending && <Loader2 className="absolute -left-5 size-4 animate-spin text-text-tertiary" />}
      {saved && !pending && <Check className="absolute -left-5 size-4 text-success-600" />}
    </span>
  );
}
