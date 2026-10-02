"use client";

import { useEffect, useState, useTransition, type ComponentProps } from "react";
import { useRouter } from "next/navigation";
import { Package, Pill, Plus, Search } from "lucide-react";
import { saveLotAction, searchStockItemsAction } from "@/server/actions/stock-lots";
import type { LotView, StockItemChoice } from "@/server/services/stock-lots";
import { daysUntil, expiryLevel, type ShortDateThresholds } from "@/core/stock/expiry";
import { describeDaysLeft, formatExpiry, parseExpiryInput } from "@/core/stock/expiry-input";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { ExpiryLevelBadge } from "./level-badge";

/** La référence du stock à laquelle un lot se rattache. */
export type LotTarget = { kind: "PRODUCT" | "DRUG"; id: string; label: string; detail: string | null };

/**
 * Saisir un lot : la référence, le numéro (facultatif), la date telle qu'elle
 * est imprimée, la quantité (facultative). La date comprise s'affiche avant
 * d'enregistrer : « 3/27 » devient « 03/2027 · dans 178 j ».
 *
 * `lot` présent : correction d'un lot existant, sa référence ne change pas.
 * `target` présent : la référence est déjà choisie (fiche produit).
 */
export function LotFormModal({
  onClose,
  today,
  thresholds,
  target: fixedTarget,
  lot,
}: {
  onClose: () => void;
  /** « 2026-10-02 » : le jour de l'officine, donné par le serveur. */
  today: string;
  thresholds: ShortDateThresholds;
  target?: LotTarget | null;
  lot?: LotView | null;
}) {
  const editing = Boolean(lot);
  const [target, setTarget] = useState<LotTarget | null>(fixedTarget ?? (lot ? { kind: lot.kind, id: lot.productId ?? lot.presentationId ?? "", label: lot.label, detail: lot.detail } : null));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockItemChoice[]>([]);
  const [searchedFor, setSearchedFor] = useState("");
  const [lotNumber, setLotNumber] = useState(lot?.lotNumber ?? "");
  const [expiry, setExpiry] = useState(lot ? formatExpiry(lot.expiresOn, lot.precision) : "");
  const [quantity, setQuantity] = useState(lot?.quantity ? String(lot.quantity) : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const trimmedQuery = query.trim();
  const canChooseTarget = !editing && !fixedTarget;

  useEffect(() => {
    if (!canChooseTarget || target || trimmedQuery.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await searchStockItemsAction(trimmedQuery);
      if (cancelled) return;
      setResults(result.ok ? result.data : []);
      setSearchedFor(trimmedQuery);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [canChooseTarget, target, trimmedQuery]);

  const visibleResults = !target && trimmedQuery.length >= 2 ? results : [];
  const searching = !target && trimmedQuery.length >= 2 && searchedFor !== trimmedQuery;

  const parsed = parseExpiryInput(expiry);
  const daysLeft = parsed ? daysUntil(parsed.expiresOn, new Date(`${today}T00:00:00Z`)) : null;

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    if (!target) nextErrors.targetId = "Choisissez une référence du stock.";
    if (!parsed) nextErrors.expiry = expiry.trim() ? "Date non reconnue : écrivez par exemple 03/2027 ou 31/03/2027." : "Indiquez la date de péremption.";
    const boxes = quantity.trim() ? Number(quantity.trim()) : null;
    if (boxes !== null && (!Number.isInteger(boxes) || boxes < 1 || boxes > 99_999)) nextErrors.quantity = "Un nombre de boîtes, ou laissez vide.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !target) return;

    start(async () => {
      const result = await saveLotAction({
        id: lot?.id ?? null,
        kind: target.kind,
        targetId: target.id,
        lotNumber,
        expiry,
        quantity: boxes,
        note: lot?.note ?? null,
      });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        push({ tone: "error", title: result.error });
        return;
      }
      push({ tone: "success", title: result.message ?? "Lot enregistré." });
      onClose();
      router.refresh();
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Corriger le lot" : "Ajouter un lot"}
      description="Une date courte ne change jamais la quantité du stock : votre logiciel de gestion reste la référence."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
          <Button type="submit" form="lot-form" loading={pending}>
            Enregistrer
          </Button>
        </>
      }
    >
      <form
        id="lot-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field label="Produit ou médicament" htmlFor="lot-target" required error={errors.targetId}>
          {target ? (
            <div className="flex items-center gap-3 rounded-md border border-border-default bg-surface-sunken/50 px-3 py-2">
              <TargetIcon kind={target.kind} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-text-primary">{target.label}</span>
                {target.detail && <span className="block truncate text-[12px] text-text-tertiary">{target.detail}</span>}
              </span>
              {canChooseTarget && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setTarget(null);
                    setQuery("");
                  }}
                >
                  Changer
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                id="lot-target"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nom, marque, EAN ou CIP…"
                leadingIcon={<Search className="size-4" />}
                autoComplete="off"
                aria-invalid={Boolean(errors.targetId)}
              />
              {trimmedQuery.length >= 2 && (
                <ul className="max-h-64 divide-y divide-border-subtle overflow-y-auto rounded-md border border-border-subtle">
                  {visibleResults.map((item) => (
                    <li key={`${item.kind}-${item.id}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setTarget({ kind: item.kind, id: item.id, label: item.label, detail: item.detail });
                          setErrors((current) => ({ ...current, targetId: "" }));
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-sunken"
                      >
                        <TargetIcon kind={item.kind} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13.5px] font-medium text-text-primary">{item.label}</span>
                          {item.detail && <span className="block truncate text-[12px] text-text-tertiary">{item.detail}</span>}
                        </span>
                        <span className="shrink-0 text-[12px] text-text-tertiary tabular">stock : {item.quantity}</span>
                      </button>
                    </li>
                  ))}
                  {visibleResults.length === 0 && (
                    <li className="px-3 py-3 text-[13px] text-text-tertiary">
                      {searching ? "Recherche…" : "Aucune référence de votre stock ne correspond."}
                    </li>
                  )}
                </ul>
              )}
            </div>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Date de péremption"
            htmlFor="lot-expiry"
            required
            error={errors.expiry || null}
            hint={
              parsed && daysLeft !== null ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  <span>
                    Lu : <span className="font-medium text-text-secondary tabular">{formatExpiry(parsed.expiresOn, parsed.precision)}</span> · {describeDaysLeft(daysLeft)}
                  </span>
                  <ExpiryLevelBadge level={expiryLevel(daysLeft, thresholds)} />
                </span>
              ) : expiry.trim() ? (
                "Date non reconnue : 03/2027, 3/27 ou 31/03/2027."
              ) : (
                "Telle qu'imprimée : 03/2027, 3/27 ou 31/03/2027."
              )
            }
          >
            <Input
              id="lot-expiry"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
              placeholder="03/2027"
              autoComplete="off"
              aria-invalid={Boolean(errors.expiry)}
            />
          </Field>
          <Field label="Numéro de lot" htmlFor="lot-number" hint="Facultatif." error={errors.lotNumber || null}>
            <Input id="lot-number" value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} placeholder="AB1234" autoComplete="off" maxLength={40} />
          </Field>
        </div>

        <Field label="Quantité" htmlFor="lot-quantity" hint="Facultatif : le nombre de boîtes de ce lot." error={errors.quantity || null}>
          <Input
            id="lot-quantity"
            type="number"
            inputMode="numeric"
            min={1}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            className="w-32"
            aria-invalid={Boolean(errors.quantity)}
          />
        </Field>
      </form>
    </Modal>
  );
}

function TargetIcon({ kind }: { kind: "PRODUCT" | "DRUG" }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-text-tertiary">
      {kind === "DRUG" ? <Pill className="size-4" /> : <Package className="size-4" />}
    </span>
  );
}

/** Le bouton « Ajouter un lot » et sa fenêtre. */
export function AddLotButton({
  today,
  thresholds,
  target,
  label = "Ajouter un lot",
  variant = "primary",
  size = "md",
  className,
}: {
  today: string;
  thresholds: ShortDateThresholds;
  target?: LotTarget | null;
  label?: string;
  variant?: ComponentProps<typeof Button>["variant"];
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} className={cn(className)} leadingIcon={<Plus className={size === "sm" ? "size-3.5" : "size-[18px]"} />} onClick={() => setOpen(true)}>
        {label}
      </Button>
      {open && <LotFormModal onClose={() => setOpen(false)} today={today} thresholds={thresholds} target={target} />}
    </>
  );
}
