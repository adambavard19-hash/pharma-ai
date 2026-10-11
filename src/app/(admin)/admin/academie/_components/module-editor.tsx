"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { saveAcademyModuleAction, setModuleItemsAction } from "@/server/actions/platform-academy";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { AUDIENCES, AUDIENCE_LABELS } from "@/core/academy/topics";
import { REVIEW_STATUS_LABELS, type ReviewStatusCode } from "@/core/academy/review";

export type ModuleFormValues = { id: string | null; title: string; slug: string; summary: string; audience: string; isFreeAccess: boolean; isSponsored: boolean; partnerId: string; sortOrder: number };

export function ModuleForm({ initial, partners }: { initial: ModuleFormValues; partners: { id: string; name: string }[] }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const set = <K extends keyof ModuleFormValues>(key: K, value: ModuleFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    start(async () => {
      const result = await saveAcademyModuleAction({ ...values, partnerId: values.partnerId || null, slug: values.slug || null });
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        push({ tone: "error", title: result.error });
        return;
      }
      setErrors({});
      push({ tone: "success", title: result.message ?? "Enregistré." });
      if (!values.id) router.push(`/admin/academie/parcours/${result.data.id}`);
      else router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Titre" htmlFor="mod-title" required error={errors.title} className="sm:col-span-2">
          <Input id="mod-title" value={values.title} onChange={(e) => set("title", e.target.value)} maxLength={160} />
        </Field>
        <Field label="Présentation" htmlFor="mod-summary" className="sm:col-span-2">
          <Textarea id="mod-summary" value={values.summary} onChange={(e) => set("summary", e.target.value)} rows={2} maxLength={600} />
        </Field>
        <Field label="Public" htmlFor="mod-audience" hint="« Nouveaux collaborateurs » : comptes gratuits, arrivants de moins de 90 jours, titulaires.">
          <Select id="mod-audience" value={values.audience} onChange={(e) => set("audience", e.target.value)}>
            {AUDIENCES.map((audience) => (
              <option key={audience} value={audience}>
                {AUDIENCE_LABELS[audience]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Adresse (dans l'application)" htmlFor="mod-slug" error={errors.slug} hint="Vide : tirée du titre.">
          <Input id="mod-slug" value={values.slug} onChange={(e) => set("slug", e.target.value)} maxLength={80} />
        </Field>
        <Field label="Partenaire" htmlFor="mod-partner" error={errors.partnerId}>
          <Select id="mod-partner" value={values.partnerId} onChange={(e) => set("partnerId", e.target.value)}>
            <option value="">Aucun</option>
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Ordre d'affichage" htmlFor="mod-order" hint="Croissant.">
          <Input id="mod-order" type="number" value={values.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value) || 0)} />
        </Field>
      </div>
      <div className="grid gap-3 rounded-xl border border-border-subtle bg-surface-sunken/50 p-4 sm:grid-cols-2">
        <Checkbox id="mod-free" checked={values.isFreeAccess} onChange={(e) => set("isFreeAccess", e.target.checked)} label="Ouvert aux comptes gratuits" description="Seuls ses contenus gratuits leur seront montrés." />
        <Checkbox id="mod-sponsored" checked={values.isSponsored} onChange={(e) => set("isSponsored", e.target.checked)} label="Parcours sponsorisé" description="Affiché avec son partenaire." />
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={pending} leadingIcon={<Save className="size-4" aria-hidden="true" />}>
          {values.id ? "Enregistrer" : "Créer le parcours"}
        </Button>
      </div>
    </form>
  );
}

type Option = { id: string; title: string; kind: string; reviewStatus: string };
type Row = { contentId: string; isRequired: boolean };

/** Les étapes du parcours, dans l'ordre : ajouter, monter, descendre, retirer, rendre facultative. */
export function ModuleItemsEditor({ moduleId, initial, options }: { moduleId: string; initial: Row[]; options: Option[] }) {
  const [rows, setRows] = useState(initial);
  const [adding, setAdding] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const byId = new Map(options.map((option) => [option.id, option]));
  const change = (next: Row[]) => {
    setRows(next);
    setDirty(true);
  };
  const move = (index: number, delta: number) => {
    const next = [...rows];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    change(next);
  };

  return (
    <div className="space-y-3">
      {rows.length === 0 && <p className="text-[13px] text-text-tertiary">Aucune étape pour l&apos;instant.</p>}
      <ol className="space-y-2">
        {rows.map((row, index) => {
          const option = byId.get(row.contentId);
          return (
            <li key={row.contentId} className="flex flex-wrap items-center gap-2 rounded-xl border border-border-subtle px-3 py-2">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[12.5px] font-bold text-brand-800">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-text-primary">{option?.title ?? "Contenu retiré"}</span>
              {option && <Badge tone={option.reviewStatus === "APPROVED" ? "success" : "neutral"}>{REVIEW_STATUS_LABELS[option.reviewStatus as ReviewStatusCode] ?? option.reviewStatus}</Badge>}
              <label className="flex items-center gap-1.5 text-[12.5px] text-text-secondary">
                <input type="checkbox" checked={!row.isRequired} onChange={(e) => change(rows.map((item, at) => (at === index ? { ...item, isRequired: !e.target.checked } : item)))} className="size-4 rounded" />
                Facultative
              </label>
              <Button type="button" variant="ghost" size="icon" className="size-8" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Monter l'étape ${index + 1}`}>
                <ArrowUp className="size-4" aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-8" disabled={index === rows.length - 1} onClick={() => move(index, 1)} aria-label={`Descendre l'étape ${index + 1}`}>
                <ArrowDown className="size-4" aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-8 text-danger-700" onClick={() => change(rows.filter((_, at) => at !== index))} aria-label={`Retirer l'étape ${index + 1}`}>
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Ajouter un contenu" htmlFor={`${moduleId}-add`} className="min-w-[240px] flex-1">
          <Select id={`${moduleId}-add`} value={adding} onChange={(e) => setAdding(e.target.value)}>
            <option value="">Choisir…</option>
            {options
              .filter((option) => !rows.some((row) => row.contentId === option.id))
              .map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title}
                </option>
              ))}
          </Select>
        </Field>
        <Button type="button" variant="secondary" disabled={!adding} onClick={() => { change([...rows, { contentId: adding, isRequired: true }]); setAdding(""); }} leadingIcon={<Plus className="size-4" aria-hidden="true" />}>
          Ajouter
        </Button>
        <Button
          type="button"
          loading={pending}
          disabled={!dirty}
          onClick={() =>
            start(async () => {
              const result = await setModuleItemsAction({ moduleId, items: rows });
              push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré.") : result.error });
              if (result.ok) {
                setDirty(false);
                router.refresh();
              }
            })
          }
          leadingIcon={<Save className="size-4" aria-hidden="true" />}
        >
          Enregistrer l&apos;ordre
        </Button>
      </div>
    </div>
  );
}
