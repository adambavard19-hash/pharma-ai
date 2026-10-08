"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { setQuantityAction } from "@/server/actions/stock";
import { availabilityOf, type Availability, type StockFilter } from "@/core/stock/stock-summary";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { formatCents, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export type StockRow = {
  kind: "PRODUCT" | "DRUG";
  id: string;
  name: string;
  detail: string | null;
  code: string | null;
  quantity: number;
  priceCents: number | null;
  active: boolean;
  href: string;
};

const FILTER_LABELS: Record<StockFilter, string> = {
  tous: "Tous",
  disponible: "Disponibles",
  rupture: "Ruptures",
  desactive: "Désactivés",
};

const STATE_STYLES: Record<Availability, { badge: string; label: string }> = {
  disponible: { badge: "bg-success-50 text-success-700 ring-success-100 dark:bg-success-700/20 dark:text-success-500 dark:ring-success-700/40", label: "Disponible" },
  rupture: { badge: "bg-danger-50 text-danger-700 ring-danger-100 dark:bg-danger-700/20 dark:text-danger-500 dark:ring-danger-700/40", label: "Rupture" },
  desactive: { badge: "bg-ink-100 text-ink-700 ring-ink-200 dark:bg-ink-800 dark:text-ink-300 dark:ring-ink-700", label: "Désactivé" },
};

/**
 * La liste du stock : le produit, sa quantité, son prix, sa disponibilité — rien d'autre. Un produit est disponible
 * (quantité supérieure à zéro), en rupture, ou désactivé : un stock « faible » n'est pas une rupture.
 *
 * La quantité est un champ : « 8 » devient « 12 » en tapant et en validant, et l'inventaire est consigné. Le reste de
 * la ligne mène à la fiche du produit.
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
}: {
  rows: StockRow[];
  total: number;
  filter: StockFilter;
  counts: Record<StockFilter, number>;
  page: number;
  totalPages: number;
  query: string;
  canAdjust: boolean;
}) {
  const href = (state: StockFilter, nextPage = 1) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (state !== "tous") search.set("etat", state);
    if (nextPage > 1) search.set("page", String(nextPage));
    const text = search.toString();
    return `/stock${text ? `?${text}` : ""}`;
  };
  // « Désactivés » n'apparaît que s'il y en a : un filtre vide est du bruit.
  const filters = (Object.keys(FILTER_LABELS) as StockFilter[]).filter((state) => state !== "desactive" || counts.desactive > 0 || filter === "desactive");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrer la liste">
        {filters.map((state) => (
          <Link
            key={state}
            href={href(state)}
            aria-current={filter === state ? "true" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-[13px] transition-colors",
              filter === state ? "border-brand-600 bg-brand-600 text-white" : "border-border-default text-text-secondary hover:border-border-strong",
            )}
          >
            {FILTER_LABELS[state]} <span className="tabular opacity-80">{formatNumber(counts[state])}</span>
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-border-subtle px-4 py-8 text-center text-[14px] text-text-secondary">
          {query ? "Aucun produit ne correspond à cette recherche." : "Aucun produit dans cette liste."}
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle">
          {rows.map((row) => (
            <StockLine key={`${row.kind}-${row.id}`} row={row} canAdjust={canAdjust} />
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-text-tertiary tabular">
            Page {page} sur {totalPages} · {formatNumber(total)} référence{total > 1 ? "s" : ""}
          </p>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" disabled={page <= 1}>
              <Link href={href(filter, page - 1)}>Précédent</Link>
            </Button>
            <Button asChild variant="outline" size="sm" disabled={page >= totalPages}>
              <Link href={href(filter, page + 1)}>Suivant</Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StockLine({ row, canAdjust }: { row: StockRow; canAdjust: boolean }) {
  const state = availabilityOf(row);
  const style = STATE_STYLES[state];

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link href={row.href} className="group flex min-w-0 flex-1 basis-56 items-center gap-2 hover:underline">
          <span className="min-w-0">
            <span className={cn("block truncate text-[15px] leading-5 font-semibold text-text-primary", !row.active && "text-text-tertiary line-through")}>{row.name}</span>
            <span className="block truncate text-[12.5px] leading-5 text-text-tertiary">
              {[row.detail, row.code ? (row.kind === "DRUG" ? `CIP ${row.code}` : `EAN ${row.code}`) : null].filter(Boolean).join(" · ") || (row.kind === "DRUG" ? "Médicament" : "Produit")}
            </span>
          </span>
          <ChevronRight className="hidden size-4 shrink-0 text-text-tertiary group-hover:text-text-secondary sm:block" aria-hidden="true" />
        </Link>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="flex items-center gap-2 text-[13px] text-text-secondary">
            Quantité
            {canAdjust && row.active ? <QuantityField row={row} /> : <span className="text-[15px] font-semibold tabular text-text-primary">{formatNumber(row.quantity)}</span>}
          </span>
          <span className="min-w-[4.5rem] text-right text-[14px] font-medium tabular text-text-primary">{row.priceCents !== null && row.priceCents > 0 ? formatCents(row.priceCents) : <span className="text-text-tertiary">—</span>}</span>
          <span className={cn("inline-flex min-w-[6.5rem] justify-center rounded-full px-2.5 py-0.5 text-[12.5px] font-medium ring-1 ring-inset", style.badge)}>{style.label}</span>
        </div>
      </div>
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
          "w-[76px] rounded-lg border border-border-default bg-surface-card px-2 py-1 text-right text-[15px] font-semibold tabular text-text-primary",
          "focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none",
          pending && "opacity-60",
        )}
      />
      {pending && <Loader2 className="absolute -left-5 size-4 animate-spin text-text-tertiary" aria-hidden="true" />}
      {saved && !pending && <Check className="absolute -left-5 size-4 text-success-600" aria-hidden="true" />}
    </span>
  );
}
