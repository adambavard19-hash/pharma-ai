"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import type { BrandSuggestion, PreferredRangeRow } from "@/server/services/preferred-ranges";
import { deletePreferredRangeAction, setPreferredRangeActiveAction } from "@/server/actions/preferred-ranges";
import { UNIVERSES, isUniverseKey } from "@/config/universes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { Switch } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { RangeModal, formatPercent } from "./range-modal";

type Editing = { range: PreferredRangeRow | null; universe: string };

/**
 * Les gammes privilégiées, univers par univers.
 *
 * Tous les univers sont visibles, même vides, chacun avec son « Ajouter ».
 * Une ligne dit l'essentiel — laboratoire, gamme, priorité, remise, produits
 * concernés — et se règle sur place : activer ou désactiver d'un clic,
 * modifier, supprimer après confirmation dans la ligne elle-même.
 */
export function RangesManager({ ranges, brands }: { ranges: PreferredRangeRow[]; brands: BrandSuggestion[] }) {
  const [editing, setEditing] = useState<Editing | null>(null);

  const byUniverse = useMemo(() => {
    const map = new Map<string, PreferredRangeRow[]>();
    for (const range of ranges) map.set(range.universe, [...(map.get(range.universe) ?? []), range]);
    for (const list of map.values()) list.sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.priority - b.priority || a.laboratory.localeCompare(b.laboratory, "fr"));
    return map;
  }, [ranges]);

  // Une gamme enregistrée sous un univers retiré de la configuration reste
  // visible : on doit pouvoir la corriger ou la supprimer.
  const orphans = ranges.filter((range) => !UNIVERSES.some((universe) => universe.key === range.universe));
  const active = ranges.filter((range) => range.isActive).length;
  const covered = new Set(ranges.filter((range) => range.isActive && isUniverseKey(range.universe)).map((range) => range.universe)).size;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-text-secondary">
          {ranges.length === 0 ? (
            "Aucune gamme privilégiée pour l'instant. Choisissez un univers et ajoutez le laboratoire que vous préférez proposer."
          ) : (
            <>
              {ranges.length} gamme{ranges.length > 1 ? "s" : ""} · <span className="font-medium text-success-700">{active} active{active > 1 ? "s" : ""}</span> · {covered} univers couvert{covered > 1 ? "s" : ""} sur {UNIVERSES.length}
            </>
          )}
        </p>
        <Button size="sm" leadingIcon={<Plus className="size-3.5" />} onClick={() => setEditing({ range: null, universe: UNIVERSES[0].key })}>
          Ajouter une gamme
        </Button>
      </div>

      {brands.length === 0 && (
        <Alert tone="neutral" title="Aucune marque lue dans votre stock">
          Les marques se proposent d&apos;elles-mêmes une fois le stock importé (<Link href="/stock/mise-a-jour" className="font-medium text-brand-700 underline-offset-2 hover:underline">importer le stock</Link>). En attendant, vous pouvez saisir une marque telle qu&apos;elle figure sur vos étiquettes.
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {UNIVERSES.map((universe) => (
          <UniverseCard
            key={universe.key}
            label={universe.label}
            ranges={byUniverse.get(universe.key) ?? []}
            onAdd={() => setEditing({ range: null, universe: universe.key })}
            onEdit={(range) => setEditing({ range, universe: range.universe })}
          />
        ))}
        {orphans.length > 0 && (
          <UniverseCard label="Univers retiré" ranges={orphans} onEdit={(range) => setEditing({ range, universe: UNIVERSES[0].key })} />
        )}
      </div>

      <p className="text-[12.5px] leading-5 text-text-tertiary">
        Comment ça pèse : quand plusieurs références sont aussi adaptées et aussi sûres l&apos;une que l&apos;autre, celle de la gamme la plus prioritaire (1 avant 2) sort en premier ; dans une routine, elle aide à garder la même marque d&apos;une étape à l&apos;autre, à pertinence presque égale. Une gamme ne fait jamais entrer un produit, ne lève aucune précaution de sécurité et ne l&apos;emporte jamais sur un écart réel de pertinence. La remise et les notes restent ici, pour vous : elles n&apos;entrent pas dans le choix et ne sont jamais montrées au comptoir.
      </p>

      {editing && (
        <RangeModal
          range={editing.range}
          initialUniverse={editing.universe}
          brands={brands}
          ranges={ranges}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function UniverseCard({
  label,
  ranges,
  onAdd,
  onEdit,
}: {
  label: string;
  ranges: PreferredRangeRow[];
  onAdd?: () => void;
  onEdit: (range: PreferredRangeRow) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-2.5">
        <h3 className="flex min-w-0 items-center gap-2 text-[14.5px] font-semibold text-text-primary">
          <Layers className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
          <span className="truncate">{label}</span>
          {ranges.length > 0 && <span className="tabular text-[12.5px] font-normal text-text-tertiary">{ranges.length}</span>}
        </h3>
        {onAdd && (
          <Button size="sm" variant="ghost" leadingIcon={<Plus className="size-3.5" />} onClick={onAdd} aria-label={`Ajouter une gamme en ${label}`}>
            Ajouter
          </Button>
        )}
      </div>
      {ranges.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-text-tertiary">Aucune gamme privilégiée.</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {ranges.map((range) => (
            <RangeLine key={range.id} range={range} onEdit={() => onEdit(range)} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function scopeText(range: PreferredRangeRow): { text: string; tone: "muted" | "warning" } {
  if (range.products.length > 0) {
    const count = range.products.length;
    const missing = range.missingProducts > 0 ? ` · ${range.missingProducts} retiré${range.missingProducts > 1 ? "s" : ""} du stock` : "";
    return { text: `${count} produit${count > 1 ? "s" : ""} concerné${count > 1 ? "s" : ""}${missing}`, tone: "muted" };
  }
  if (range.missingProducts > 0) {
    return { text: `Aucun des ${range.missingProducts} produits choisis n'est encore au stock : la gamme ne s'applique plus.`, tone: "warning" };
  }
  if (range.brandReferences === 0) return { text: "Toute la marque · aucune référence au stock pour l'instant", tone: "muted" };
  return { text: `Toute la marque · ${range.brandReferences} référence${range.brandReferences > 1 ? "s" : ""} au stock`, tone: "muted" };
}

function RangeLine({ range, onEdit }: { range: PreferredRangeRow; onEdit: () => void }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const scope = scopeText(range);
  const name = range.rangeName ? `${range.laboratory} · ${range.rangeName}` : range.laboratory;

  const toggle = () =>
    start(async () => {
      const result = await setPreferredRangeActiveAction({ id: range.id, isActive: !range.isActive });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré.") : result.error });
      router.refresh();
    });

  const remove = () =>
    start(async () => {
      const result = await deletePreferredRangeAction(range.id);
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Gamme supprimée.") : result.error });
      setConfirming(false);
      router.refresh();
    });

  return (
    <li className={cn("flex flex-wrap items-start gap-3 px-4 py-3", !range.isActive && "bg-surface-sunken/60", confirming && "bg-danger-50/60")}>
      <span
        className={cn(
          "tabular mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-[12.5px] font-semibold",
          range.isActive ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-500",
        )}
        title={`Priorité ${range.priority} dans l'univers (1 = la plus prioritaire)`}
        aria-label={`Priorité ${range.priority}`}
      >
        {range.priority}
      </span>

      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("text-[14px] font-semibold break-words", range.isActive ? "text-text-primary" : "text-text-tertiary")}>
            {range.laboratory}
            {range.rangeName && <span className="font-normal text-text-secondary"> · {range.rangeName}</span>}
          </span>
          {!range.isActive && <Badge tone="neutral">Inactive</Badge>}
          {range.discountPercent !== null && <Badge tone="accent">Remise {formatPercent(range.discountPercent)} %</Badge>}
        </p>
        <p
          className={cn("text-[12.5px]", scope.tone === "warning" ? "text-warning-700" : "text-text-tertiary")}
          title={range.products.length > 0 ? range.products.map((product) => product.name).join("\n") : undefined}
        >
          {scope.text}
        </p>
        {range.notes && (
          <p className="line-clamp-2 text-[12.5px] text-text-secondary" title={range.notes}>
            {range.notes}
          </p>
        )}
      </div>

      {confirming ? (
        <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
          <span className="text-[13px] font-medium text-danger-700">Supprimer {name} ?</span>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
            Annuler
          </Button>
          <Button size="sm" variant="danger" loading={pending} onClick={remove}>
            Supprimer
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Switch
            id={`range-active-${range.id}`}
            checked={range.isActive}
            disabled={pending}
            onChange={toggle}
            aria-label={range.isActive ? `Désactiver ${name}` : `Activer ${name}`}
            title={range.isActive ? "Active : désactiver" : "Inactive : activer"}
          />
          <Button size="sm" variant="ghost" className="w-8 px-0" onClick={onEdit} aria-label={`Modifier ${name}`} title="Modifier">
            <Pencil className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" className="w-8 px-0 hover:text-danger-700" onClick={() => setConfirming(true)} aria-label={`Supprimer ${name}`} title="Supprimer">
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </li>
  );
}
