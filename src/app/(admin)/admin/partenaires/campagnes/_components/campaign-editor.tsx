"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { saveCampaignAction } from "@/server/actions/platform-sponsoring";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { SPONSORED_FORMAT_LABELS, SPONSORED_FORMATS, SPONSORED_PLACEMENT_LABELS, SPONSORED_PLACEMENTS } from "@/core/sponsoring/campaign";
import { REGULATORY_CATEGORIES, REGULATORY_CATEGORY_LABELS } from "@/core/discover/visibility";
import type { SponsoringTargets } from "@/server/services/mobile/sponsoring-admin";

export type CampaignFormValues = {
  id: string | null;
  partnerId: string;
  brandId: string;
  launchId: string;
  moduleId: string;
  name: string;
  format: string;
  placements: string[];
  audiences: string[];
  startsAt: string;
  endsAt: string;
  regulatoryCategory: string;
};

const AUDIENCE_LABELS: Record<string, string> = { STUDENT: "Étudiants", TECHNICIAN: "Préparateurs", PHARMACIST: "Pharmaciens", OWNER: "Titulaires" };

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

const EMPTY: CampaignFormValues = { id: null, partnerId: "", brandId: "", launchId: "", moduleId: "", name: "", format: "MISE_EN_AVANT", placements: [], audiences: [], startsAt: "", endsAt: "", regulatoryCategory: "" };

/** Créer ou modifier une campagne sponsorisée. Créée en brouillon ; rien n'est diffusé avant validation et activation. */
export function CampaignEditor({ targets, initial, disabledReason }: { targets: SponsoringTargets; initial?: CampaignFormValues; disabledReason?: string | null }) {
  const router = useRouter();
  const { push } = useToast();
  const [form, setForm] = useState<CampaignFormValues | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const partner = form ? targets.partners.find((entry) => entry.id === form.partnerId) : undefined;
  const launches = form ? targets.launches.filter((launch) => launch.partnerId === form.partnerId && (!form.brandId || launch.brandId === form.brandId)) : [];

  const open = () => {
    setError(null);
    setFieldErrors({});
    setForm(initial ?? { ...EMPTY, startsAt: today(), endsAt: inDays(30) });
  };

  const toggle = (key: "placements" | "audiences", value: string) => {
    if (!form) return;
    const list = form[key];
    setForm({ ...form, [key]: list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value] });
  };

  const submit = () => {
    if (!form) return;
    setError(null);
    setFieldErrors({});
    start(async () => {
      const result = await saveCampaignAction(form);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Campagne enregistrée." });
      setForm(null);
      if (!initial) router.push(`/admin/partenaires/campagnes/${result.data.id}`);
      else router.refresh();
    });
  };

  return (
    <>
      {initial ? (
        <Button size="sm" variant="outline" leadingIcon={<Pencil className="size-3.5" />} onClick={open} disabled={!!disabledReason} title={disabledReason ?? undefined}>
          Modifier
        </Button>
      ) : (
        <Button leadingIcon={<Plus className="size-4" />} onClick={open} disabled={targets.partners.length === 0} title={targets.partners.length === 0 ? "Créez d'abord un partenaire" : undefined}>
          Nouvelle campagne
        </Button>
      )}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={initial ? "Modifier la campagne" : "Nouvelle campagne sponsorisée"}
        description="Enregistrée en brouillon. Diffusion seulement après validation réglementaire, approbation et activation. Toujours signalée « Sponsorisé »."
        size="lg"
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
            <Field label="Nom interne" htmlFor="cmp-name" required error={fieldErrors.name}>
              <Input id="cmp-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ex. : Lancement gamme solaire — juin" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Partenaire" htmlFor="cmp-partner" required error={fieldErrors.partnerId}>
                <Select id="cmp-partner" value={form.partnerId} onChange={(event) => setForm({ ...form, partnerId: event.target.value, brandId: "", launchId: "" })}>
                  <option value="">Choisir…</option>
                  {targets.partners.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Format" htmlFor="cmp-format" required error={fieldErrors.format}>
                <Select id="cmp-format" value={form.format} onChange={(event) => setForm({ ...form, format: event.target.value })}>
                  {SPONSORED_FORMATS.map((format) => (
                    <option key={format} value={format}>
                      {SPONSORED_FORMAT_LABELS[format]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Marque" htmlFor="cmp-brand" error={fieldErrors.brandId} hint="Ce qui est mis en avant : une marque, une nouveauté ou un parcours.">
                <Select id="cmp-brand" value={form.brandId} disabled={!partner} onChange={(event) => setForm({ ...form, brandId: event.target.value, launchId: "" })}>
                  <option value="">—</option>
                  {partner?.brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Nouveauté mise en avant" htmlFor="cmp-launch" error={fieldErrors.launchId}>
                <Select id="cmp-launch" value={form.launchId} disabled={!partner} onChange={(event) => setForm({ ...form, launchId: event.target.value })}>
                  <option value="">—</option>
                  {launches.map((launch) => (
                    <option key={launch.id} value={launch.id}>
                      {launch.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Parcours de formation" htmlFor="cmp-module" error={fieldErrors.moduleId} hint="Pour un programme de formation.">
                <Select id="cmp-module" value={form.moduleId} onChange={(event) => setForm({ ...form, moduleId: event.target.value })}>
                  <option value="">—</option>
                  {targets.modules.map((module) => (
                    <option key={module.id} value={module.id}>
                      {module.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Catégorie réglementaire" htmlFor="cmp-category" error={fieldErrors.regulatoryCategory} hint="Reprise de la nouveauté si vide.">
                <Select id="cmp-category" value={form.regulatoryCategory} onChange={(event) => setForm({ ...form, regulatoryCategory: event.target.value })}>
                  <option value="">—</option>
                  {REGULATORY_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {REGULATORY_CATEGORY_LABELS[category]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Début" htmlFor="cmp-start" required error={fieldErrors.startsAt}>
                <Input id="cmp-start" type="date" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} />
              </Field>
              <Field label="Fin" htmlFor="cmp-end" required error={fieldErrors.endsAt}>
                <Input id="cmp-end" type="date" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} />
              </Field>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-text-primary">Emplacements</legend>
              {fieldErrors.placements && <p className="text-[12.5px] text-danger-600">{fieldErrors.placements}</p>}
              <div className="grid gap-2 sm:grid-cols-2">
                {SPONSORED_PLACEMENTS.map((placement) => (
                  <Checkbox key={placement} id={`cmp-pl-${placement}`} checked={form.placements.includes(placement)} onChange={() => toggle("placements", placement)} label={SPONSORED_PLACEMENT_LABELS[placement]} />
                ))}
              </div>
            </fieldset>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-text-primary">Publics (aucun coché : tous)</legend>
              <div className="grid gap-2 sm:grid-cols-4">
                {Object.entries(AUDIENCE_LABELS).map(([value, label]) => (
                  <Checkbox key={value} id={`cmp-au-${value}`} checked={form.audiences.includes(value)} onChange={() => toggle("audiences", value)} label={label} />
                ))}
              </div>
            </fieldset>
          </div>
        )}
      </Modal>
    </>
  );
}
