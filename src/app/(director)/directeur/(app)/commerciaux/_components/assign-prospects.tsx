"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRightLeft } from "lucide-react";
import { reassignProspectsAction } from "@/server/actions/director-reps";
import { REASSIGN_MAX, groupByStage } from "@/core/sales/director/team";
import { PROSPECT_STATUS_LABELS, type ProspectStatusCode } from "@/core/sales/pipeline";
import { isOverdue } from "@/core/sales/board";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Select } from "@/components/ui/field";
import { formatCents, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ProspectStatusBadge } from "@/components/sales/status-badge";

/** Un dossier, tel que la page le passe au navigateur : des dates en texte (ISO), jamais d'objet `Date`. */
export type PickerProspect = {
  id: string;
  name: string;
  city: string | null;
  status: ProspectStatusCode;
  nextActionAt?: string | null;
  nextActionLabel?: string | null;
  lastContactAt?: string | null;
  createdAt?: string | null;
  /** Le commercial désactivé qui suivait encore ce dossier. */
  formerRepName?: string | null;
  monthlyPriceCents?: number | null;
  blocked?: boolean;
};

/**
 * Choisir des dossiers puis les confier à un commercial actif.
 *
 *  - `mode="reassign"` : le portefeuille d'un commercial, rangé par étape ;
 *    il peut les confier à un autre.
 *  - `mode="assign"` : les dossiers sans commercial, en liste, à attribuer.
 *
 * Le serveur relit chaque dossier et le commercial visé : cet écran ne fait que
 * rassembler le choix. Rien ne part sans la fenêtre de confirmation.
 */
export function AssignProspects({ prospects, reps, mode, nowIso, emptyText }: { prospects: PickerProspect[]; reps: { id: string; name: string }[]; mode: "reassign" | "assign"; nowIso: string; emptyText?: string }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const groups = useMemo(() => (mode === "reassign" ? groupByStage(prospects) : [{ status: null, items: prospects }]), [mode, prospects]);
  const count = selected.size;
  const targetName = reps.find((rep) => rep.id === target)?.name ?? null;
  // Une attribution porte sur 100 dossiers au plus : « tout sélectionner » prend les 100 premiers et le dit.
  const selectable = prospects.slice(0, REASSIGN_MAX);
  const allSelected = selectable.length > 0 && selectable.every((prospect) => selected.has(prospect.id));
  const capped = prospects.length > REASSIGN_MAX;

  if (prospects.length === 0) return <p className="py-6 text-center text-[13.5px] text-text-tertiary">{emptyText ?? "Aucun dossier."}</p>;

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-xl bg-surface-sunken px-4 py-3 md:flex-row md:items-center md:justify-between">
        <Checkbox id={`all-${mode}`} checked={allSelected} onChange={(event) => setSelected(event.target.checked ? new Set(selectable.map((prospect) => prospect.id)) : new Set())} label={count === 0 ? (capped ? `Sélectionner les ${REASSIGN_MAX} premiers` : "Tout sélectionner") : `${count} dossier${count > 1 ? "s" : ""} choisi${count > 1 ? "s" : ""}`} />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="min-w-0 sm:w-64">
            <Select aria-label={mode === "assign" ? "Attribuer à" : "Confier à"} value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="">{mode === "assign" ? "Attribuer à…" : "Confier à…"}</option>
              {reps.map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.name}
                </option>
              ))}
            </Select>
          </div>
          <ConfirmAction
            label={mode === "assign" ? "Attribuer" : "Réaffecter"}
            icon={<ArrowRightLeft className="size-3.5" />}
            variant="primary"
            disabled={count === 0 || !target}
            title={mode === "assign" ? "Attribuer ces dossiers ?" : "Réaffecter ces dossiers ?"}
            consequences={[
              `${count} dossier${count > 1 ? "s" : ""} ${count > 1 ? "seront confiés" : "sera confié"} à ${targetName ?? "ce commercial"}.`,
              "Les relances ouvertes et les commissions prévisionnelles non facturées le suivent.",
              `${targetName ?? "Le commercial"} est prévenu${count > 1 ? " de ces nouveaux dossiers" : " de ce nouveau dossier"}.`,
              "Chaque dossier garde la trace du geste dans son historique.",
            ]}
            confirmLabel={mode === "assign" ? "Attribuer" : "Réaffecter"}
            onConfirm={async () => {
              const result = await reassignProspectsAction({ prospectIds: [...selected], salesRepId: target });
              if (result.ok) setSelected(new Set());
              return result;
            }}
          />
        </div>
      </div>

      {capped && <p className="text-[12.5px] text-text-tertiary">{REASSIGN_MAX} dossiers au plus par attribution : choisissez-en jusqu&apos;à {REASSIGN_MAX}, puis recommencez avec les suivants.</p>}
      <div className="space-y-4">
        {groups.map((group) => (
          <section key={group.status ?? "tous"} aria-label={group.status ? PROSPECT_STATUS_LABELS[group.status] : "Dossiers"}>
            {group.status && (
              <h3 className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-text-primary">
                {PROSPECT_STATUS_LABELS[group.status]}
                <span className="rounded-full bg-surface-sunken px-1.5 text-[11.5px] font-medium text-text-secondary tabular-nums">{group.items.length}</span>
              </h3>
            )}
            <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
              {group.items.map((prospect) => {
                const late = isOverdue(prospect.nextActionAt, nowIso);
                return (
                  <li key={prospect.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5">
                    <Checkbox id={`pick-${prospect.id}`} checked={selected.has(prospect.id)} onChange={() => toggle(prospect.id)} aria-label={`Choisir ${prospect.name}`} />
                    <div className="min-w-0 flex-1 basis-56">
                      <p className="truncate text-[14px] font-medium text-text-primary">{prospect.name}</p>
                      <p className={cn("truncate text-[12px]", late ? "font-medium text-warning-700 dark:text-warning-500" : "text-text-tertiary")}>
                        {prospect.city ?? "Ville non renseignée"}
                        {prospect.nextActionAt ? ` · ${prospect.nextActionLabel ?? "À faire"} le ${formatDate(prospect.nextActionAt)}${late ? " (en retard)" : ""}` : ""}
                        {prospect.lastContactAt ? ` · dernier contact le ${formatDate(prospect.lastContactAt)}` : ""}
                        {mode === "assign" && prospect.createdAt ? ` · créé le ${formatDate(prospect.createdAt)}` : ""}
                        {prospect.formerRepName ? ` · ancien commercial : ${prospect.formerRepName} (désactivé)` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {mode === "assign" && <ProspectStatusBadge status={prospect.status} />}
                      {prospect.blocked && <Badge tone="warning">Suspendu</Badge>}
                      {typeof prospect.monthlyPriceCents === "number" && <span className="text-[12.5px] text-text-secondary tabular-nums">{formatCents(prospect.monthlyPriceCents)} / mois</span>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {reps.length === 0 && (
        <p className="text-[12.5px] text-text-tertiary">
          Aucun autre commercial actif pour l&apos;instant. <Link href="/directeur/commerciaux/nouveau" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">Ajoutez-en un</Link> pour pouvoir lui confier des dossiers.
        </p>
      )}
    </div>
  );
}
