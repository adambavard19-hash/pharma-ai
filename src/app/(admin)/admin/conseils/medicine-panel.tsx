"use client";

import { useState, useTransition } from "react";
import { Eye, Pill, Plus } from "lucide-react";
import { previewMedicineAdviceAction } from "@/server/actions/admin-central-advice";
import type { AdvicePreview, MedicineCard, PreviewPharmacy, TreeSummary } from "@/server/services/advice-hub";
import { atcMatches } from "@/core/admin/advice-hub";
import { searchableText } from "@/core/search/tolerant-search";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import type { HubItem } from "./advice-hub";

/** Les conseils qui s'appliquent à ce médicament : par sa famille (règles, suggestions du robot), ou par son nom (conseil nommé). */
export function adviceForMedicine(items: HubItem[], medicine: MedicineCard): HubItem[] {
  const name = searchableText(medicine.name).split(" ")[0] ?? "";
  return items.filter((item) => {
    if (item.facets.removed) return false;
    if (item.type === "association") return item.association.triggerKind === "MEDICINE" && name !== "" && searchableText(item.association.triggerLabel).startsWith(name);
    return atcMatches(item.facets.atcPrefixes, [medicine.atcCode]);
  });
}

const titleOf = (item: HubItem): string => (item.type === "rule" ? item.rule.title : item.type === "association" ? `${item.association.triggerLabel} → ${item.association.adviceLabel}` : `${item.proposal.productName} (suggestion du robot)`);

/**
 * « Ce médicament » : ce que la recherche a reconnu comme un médicament, sa famille officielle, tous les conseils qui s'y
 * appliquent, l'arbre de questions s'il en a un, un bouton pour ajouter un conseil pré-rempli et l'aperçu de ce que
 * PharmaBoost proposerait dans une pharmacie choisie.
 */
export function MedicinePanel({ medicines, items, trees, pharmacies, onAdd }: { medicines: MedicineCard[]; items: HubItem[]; trees: TreeSummary[]; pharmacies: PreviewPharmacy[]; onAdd: (atc: string[], title: string) => void }) {
  const [index, setIndex] = useState(0);
  const medicine = medicines[Math.min(index, medicines.length - 1)];
  const applicable = adviceForMedicine(items, medicine);
  const tree = trees.find((candidate) => atcMatches(candidate.atcPrefixes, [medicine.atcCode]));
  const [pharmacyId, setPharmacyId] = useState(pharmacies[0]?.id ?? "");
  const [preview, setPreview] = useState<AdvicePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const runPreview = () => {
    setError(null);
    startTransition(async () => {
      const result = await previewMedicineAdviceAction({ pharmacyId, specialtyId: medicine.specialtyId });
      if (result.ok) setPreview(result.data);
      else setError(result.error);
    });
  };

  const levels = [
    { code: medicine.atcCode, label: `Ce médicament (${medicine.atcCode})` },
    ...(medicine.atcCode.length > 5 ? [{ code: medicine.atcCode.slice(0, 5), label: `Sa famille (${medicine.atcCode.slice(0, 5)})` }] : []),
    ...(medicine.atcCode.length > 4 ? [{ code: medicine.atcCode.slice(0, 4), label: `Sa grande famille (${medicine.atcCode.slice(0, 4)})` }] : []),
  ];

  return (
    <Card className="border-brand-300 dark:border-brand-700">
      <CardContent className="space-y-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-[12px] font-semibold tracking-wide text-brand-700 uppercase dark:text-brand-300">
              <Pill className="size-4" aria-hidden /> Ce médicament
            </p>
            <h2 className="text-[17px] font-bold text-text-primary">{medicine.name}</h2>
            <p className="text-[13px] text-text-secondary">
              {medicine.substances.join(", ") || "Substance non publiée"} · famille officielle {medicine.atcCode}
              {medicine.family ? ` — ${medicine.family}` : ""}
            </p>
          </div>
          {medicines.length > 1 && (
            <div role="tablist" aria-label="Autres médicaments trouvés" className="flex flex-wrap gap-1.5">
              {medicines.map((candidate, at) => (
                <button key={candidate.atcCode} type="button" role="tab" aria-selected={at === index} onClick={() => { setIndex(at); setPreview(null); }} className={cn("rounded-full px-3 py-1 text-[12.5px]", at === index ? "bg-brand-600 text-white" : "bg-surface-sunken text-text-secondary")}>
                  {candidate.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-[13px] font-semibold text-text-primary">
            {applicable.length === 0 ? "Aucun conseil écrit pour ce médicament : au comptoir, le robot cherche dans le stock de chaque pharmacie un produit utile, que vous validez ensuite." : `${applicable.length} conseil${applicable.length > 1 ? "s" : ""} s'appliquent (détail dans la liste ci-dessous) :`}
          </p>
          {applicable.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {applicable.map((item) => (
                <li key={item.facets.id}>
                  <Badge tone={item.facets.review ? "warning" : "success"}>{titleOf(item)}</Badge>
                </li>
              ))}
            </ul>
          )}
          {tree && (
            <div className="rounded-md bg-surface-sunken px-3 py-2 text-[12.5px] text-text-secondary">
              <p className="font-medium text-text-primary">Questions posées au comptoir avant de proposer :</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {tree.questions.map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-text-primary">Ajouter un conseil pour :</span>
          {levels.map((level) => (
            <Button key={level.code} size="sm" variant="outline" leadingIcon={<Plus className="size-3.5" />} onClick={() => onAdd([level.code], "")}>
              {level.label}
            </Button>
          ))}
        </div>

        {pharmacies.length > 0 && (
          <div className="space-y-2 border-t border-border-subtle pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-medium text-text-primary">Ce que PharmaBoost proposerait dans</span>
              <div className="w-64">
                <Select aria-label="Pharmacie de l'aperçu" value={pharmacyId} onChange={(event) => { setPharmacyId(event.target.value); setPreview(null); }}>
                  {pharmacies.map((pharmacy) => (
                    <option key={pharmacy.id} value={pharmacy.id}>
                      {pharmacy.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button size="sm" onClick={runPreview} loading={pending} leadingIcon={<Eye className="size-4" />}>
                Voir l&apos;aperçu
              </Button>
            </div>
            {error && <p role="alert" className="text-[13px] text-danger-600">{error}</p>}
            {preview && (
              <div className="space-y-1.5 rounded-md bg-surface-sunken px-3 py-2.5 text-[13px]">
                <p className="text-[12px] text-text-tertiary">
                  {preview.medicine} chez {preview.pharmacyName} — patient adulte, rien de déclaré. Lecture seule : aucune vente n&apos;est créée.
                </p>
                {preview.proposals.map((proposal) => (
                  <p key={`${proposal.title}-${proposal.product}`}>
                    <strong className="text-text-primary">{proposal.title}</strong> → {proposal.product}
                    <span className="block text-text-secondary">« {proposal.script} »</span>
                  </p>
                ))}
                {preview.uncovered.length > 0 && <p className="text-text-secondary">Sans produit adapté dans ce stock : {preview.uncovered.join(", ")}.</p>}
                {preview.notes.map((note) => (
                  <p key={note} className="text-text-secondary">{note}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
