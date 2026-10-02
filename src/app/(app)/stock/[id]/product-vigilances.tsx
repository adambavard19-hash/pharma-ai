"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { VIGILANCE_LEVELS, VIGILANCE_LEVEL_LABELS, VIGILANCE_POPULATIONS, populationLabel, type VigilanceLevel } from "@/config/vigilances";
import { deleteProductVigilanceAction, saveProductVigilanceAction } from "@/server/actions/product-vigilances";

/**
 * Les vigilances patient que le pharmacien déclare sur ce produit (grossesse,
 * allaitement, asthme, épilepsie, enfant). Elles s'affichent sur la carte de
 * conseil quand elles concernent le patient ; une contre-indication écarte le
 * produit pour un patient concerné. Rien n'est prérempli : c'est la notice et
 * le pharmacien qui font foi.
 */

const LEVEL_TONE: Record<VigilanceLevel, "danger" | "warning" | "neutral"> = {
  CONTRAINDICATION: "danger",
  PHARMACIST_VALIDATION: "danger",
  CAUTION: "warning",
  INFO: "neutral",
};

export type DeclaredVigilanceRow = { id: string; population: string; level: VigilanceLevel; note: string | null };

export function ProductVigilances({ productId, rows, canManage }: { productId: string; rows: DeclaredVigilanceRow[]; canManage: boolean }) {
  const [adding, setAdding] = useState(false);
  const [population, setPopulation] = useState<string>(VIGILANCE_POPULATIONS[0].key);
  const [level, setLevel] = useState<VigilanceLevel>("CAUTION");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const { push } = useToast();
  const router = useRouter();

  const save = () =>
    start(async () => {
      const result = await saveProductVigilanceAction({ productId, population, level, note: note.trim() || null });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Vigilance enregistrée.") : result.error });
      if (result.ok) {
        setAdding(false);
        setNote("");
        router.refresh();
      }
    });

  const remove = (id: string) =>
    start(async () => {
      const result = await deleteProductVigilanceAction(id);
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Vigilance retirée.") : result.error });
      if (result.ok) router.refresh();
    });

  return (
    <Card>
      <CardHeader
        title="Vigilances patient"
        description="Ce que la notice impose de vérifier : affiché sur la carte de conseil quand le patient est concerné."
        action={
          canManage && !adding ? (
            <Button size="sm" variant="outline" leadingIcon={<Plus className="size-4" />} onClick={() => setAdding(true)}>
              Ajouter
            </Button>
          ) : undefined
        }
      />
      <CardContent className="space-y-3">
        {rows.length === 0 && !adding && <p className="text-[13.5px] text-text-secondary">Aucune vigilance déclarée sur ce produit.</p>}
        {rows.length > 0 && (
          <ul className="divide-y divide-border-subtle">
            {rows.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-text-primary">
                    {populationLabel(row.population)}
                    <Badge tone={LEVEL_TONE[row.level]}>{VIGILANCE_LEVEL_LABELS[row.level]}</Badge>
                  </p>
                  {row.note && <p className="mt-0.5 text-[13px] text-text-secondary">{row.note}</p>}
                </div>
                {canManage && (
                  <button type="button" onClick={() => remove(row.id)} disabled={pending} aria-label={`Retirer la vigilance ${populationLabel(row.population)}`} className="shrink-0 rounded-lg p-1.5 text-text-tertiary hover:bg-surface-sunken hover:text-danger-700">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {adding && (
          <div className="space-y-3 rounded-xl border border-border-subtle bg-surface-sunken/40 p-3.5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Population" htmlFor="vig-population">
                <Select id="vig-population" value={population} onChange={(e) => setPopulation(e.target.value)}>
                  {VIGILANCE_POPULATIONS.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Niveau" htmlFor="vig-level">
                <Select id="vig-level" value={level} onChange={(e) => setLevel(e.target.value as VigilanceLevel)}>
                  {VIGILANCE_LEVELS.map((l) => (
                    <option key={l} value={l}>{VIGILANCE_LEVEL_LABELS[l]}</option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Raison (facultatif)" htmlFor="vig-note">
              <Input id="vig-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Ex. : contient de l'eucalyptol, à éviter avant 12 ans" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>Annuler</Button>
              <Button size="sm" onClick={save} loading={pending}>Enregistrer</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
