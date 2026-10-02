"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Layers, Pencil, Plus } from "lucide-react";
import { savePartnerRangeAction } from "@/server/actions/platform-partner-brands";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { UNIVERSES, universeLabel } from "@/config/universes";
import type { PublicationStatus } from "@/core/partners/status";
import { PublicationBadge } from "../_components/publication-badge";
import { PublicationStatusControl } from "../_components/status-control";

export type RangeRow = {
  id: string;
  name: string;
  description: string | null;
  universe: string | null;
  status: PublicationStatus;
  sortOrder: number;
  products: number;
};

type RangeForm = { id: string | null; name: string; description: string; universe: string; sortOrder: string };

/**
 * Les gammes d'une marque. Chacune a son propre statut : une gamme n'est vue
 * que si elle est active (ou en test pour le groupe pilote) ET que la marque
 * l'est aussi.
 */
export function RangesCard({ brandId, ranges, pilotCount }: { brandId: string; ranges: RangeRow[]; pilotCount: number }) {
  const router = useRouter();
  const { push } = useToast();
  const [form, setForm] = useState<RangeForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const open = (range: RangeRow | null) => {
    setError(null);
    setFieldErrors({});
    setForm(
      range
        ? { id: range.id, name: range.name, description: range.description ?? "", universe: range.universe ?? "", sortOrder: String(range.sortOrder) }
        : { id: null, name: "", description: "", universe: "", sortOrder: String(ranges.length ? Math.max(...ranges.map((row) => row.sortOrder)) + 1 : 0) },
    );
  };

  const submit = () => {
    if (!form) return;
    setError(null);
    setFieldErrors({});
    start(async () => {
      const result = await savePartnerRangeAction({ brandId, id: form.id, name: form.name, description: form.description, universe: form.universe, sortOrder: form.sortOrder });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Gamme enregistrée." });
      setForm(null);
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader
        title="Gammes"
        description="« Activer une gamme » la rend visible dans les officines qui voient la marque. Une nouvelle gamme est créée en brouillon."
        action={
          <Button size="sm" variant="outline" leadingIcon={<Plus className="size-4" />} onClick={() => open(null)}>
            Nouvelle gamme
          </Button>
        }
      />
      <CardContent>
        {ranges.length === 0 ? (
          <EmptyState icon={<Layers className="size-5" />} title="Aucune gamme" description="Ajoutez les gammes de la marque ; les produits du catalogue s'y rattachent." className="py-8" />
        ) : (
          <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {ranges.map((range) => (
              <li key={range.id} className="space-y-2 p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-text-primary">
                      <span className="break-words">{range.name}</span>
                      <PublicationBadge status={range.status} />
                    </p>
                    <p className="text-[12.5px] text-text-tertiary">
                      {range.universe ? universeLabel(range.universe) : "Sans univers"} · {range.products} produit{range.products > 1 ? "s" : ""} · ordre {range.sortOrder}
                    </p>
                    {range.description && <p className="mt-1 text-[12.5px] leading-5 break-words text-text-secondary">{range.description}</p>}
                  </div>
                  <Button size="sm" variant="ghost" leadingIcon={<Pencil className="size-3.5" />} onClick={() => open(range)}>
                    Modifier
                  </Button>
                </div>
                <PublicationStatusControl target={{ kind: "range", id: range.id, brandId }} current={range.status} name={range.name} pilotCount={pilotCount} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? "Modifier la gamme" : "Nouvelle gamme"}
        description={form?.id ? undefined : "Créée en brouillon : activez-la quand elle est prête."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)}>
              Annuler
            </Button>
            <Button loading={pending} onClick={submit}>
              Enregistrer
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            {error && <Alert tone="danger">{error}</Alert>}
            <Field label="Nom de la gamme" htmlFor="range-name" required error={fieldErrors.name}>
              <Input id="range-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={120} />
            </Field>
            <Field label="Description" htmlFor="range-description" error={fieldErrors.description}>
              <Textarea id="range-description" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} maxLength={2000} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Univers" htmlFor="range-universe" error={fieldErrors.universe}>
                <Select id="range-universe" value={form.universe} onChange={(event) => setForm({ ...form, universe: event.target.value })}>
                  <option value="">Sans univers</option>
                  {UNIVERSES.map((universe) => (
                    <option key={universe.key} value={universe.key}>
                      {universe.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Ordre d'affichage" htmlFor="range-order" hint="Les plus petits d'abord." error={fieldErrors.sortOrder}>
                <Input id="range-order" type="number" inputMode="numeric" min={0} max={9999} value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} />
              </Field>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
