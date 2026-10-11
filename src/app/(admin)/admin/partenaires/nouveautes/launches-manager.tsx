"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { saveLaunchAction, setLaunchReviewAction, validateLaunchAction } from "@/server/actions/platform-sponsoring";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { REGULATORY_CATEGORIES, REGULATORY_CATEGORY_LABELS } from "@/core/discover/visibility";
import { UNIVERSES } from "@/config/universes";
import { formatDate } from "@/lib/format";
import { LaunchStatusBadge, RegulatoryBadge } from "../campagnes/_components/labels";

export type LaunchRowView = {
  id: string;
  title: string;
  summary: string | null;
  body: string;
  mediaUrl: string | null;
  posterUrl: string | null;
  orientation: string | null;
  productCodes: string[];
  universe: string | null;
  regulatoryCategory: string;
  regulatoryMentions: string | null;
  regulatoryValidatedBy: string | null;
  regulatoryValidatedAt: string | null;
  reviewStatus: "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "ARCHIVED";
  publishedAt: string | null;
  endsAt: string | null;
  partnerName: string;
  brand: { id: string; name: string };
  infoRequests: number;
};

type Brands = { id: string; name: string; partnerName: string }[];

type Form = { id: string | null; brandId: string; title: string; summary: string; body: string; mediaUrl: string; posterUrl: string; orientation: string; productCodes: string; universe: string; regulatoryCategory: string; regulatoryMentions: string; endsAt: string };

const EMPTY: Form = { id: null, brandId: "", title: "", summary: "", body: "", mediaUrl: "", posterUrl: "", orientation: "", productCodes: "", universe: "", regulatoryCategory: "PARAPHARMACY", regulatoryMentions: "", endsAt: "" };

/** Les nouveautés des marques : rédiger (brouillon), valider sur le plan réglementaire, publier, retirer. */
export function LaunchesManager({ launches, brands }: { launches: LaunchRowView[]; brands: Brands }) {
  const router = useRouter();
  const { push } = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [validating, setValidating] = useState<LaunchRowView | null>(null);
  const [validator, setValidator] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const done = (message?: string) => {
    push({ tone: "success", title: message ?? "Enregistré." });
    router.refresh();
  };

  const edit = (launch: LaunchRowView | null) => {
    setError(null);
    setFieldErrors({});
    setForm(
      launch
        ? {
            id: launch.id,
            brandId: launch.brand.id,
            title: launch.title,
            summary: launch.summary ?? "",
            body: launch.body,
            mediaUrl: launch.mediaUrl ?? "",
            posterUrl: launch.posterUrl ?? "",
            orientation: launch.orientation ?? "",
            productCodes: launch.productCodes.join(", "),
            universe: launch.universe ?? "",
            regulatoryCategory: launch.regulatoryCategory,
            regulatoryMentions: launch.regulatoryMentions ?? "",
            endsAt: launch.endsAt ? launch.endsAt.slice(0, 10) : "",
          }
        : EMPTY,
    );
  };

  const save = () => {
    if (!form) return;
    setError(null);
    setFieldErrors({});
    start(async () => {
      const result = await saveLaunchAction(form);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setForm(null);
      done(result.message);
    });
  };

  const review = (id: string, status: string) =>
    start(async () => {
      const result = await setLaunchReviewAction({ id, status });
      if (!result.ok) push({ tone: "error", title: result.error });
      else done(result.message);
    });

  const validate = () => {
    if (!validating) return;
    setError(null);
    start(async () => {
      const result = await validateLaunchAction({ id: validating.id, validator });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setValidating(null);
      setValidator("");
      done(result.message);
    });
  };

  const set = (key: keyof Form) => (event: { target: { value: string } }) => form && setForm({ ...form, [key]: event.target.value });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-text-secondary">{launches.length === 0 ? "Aucune nouveauté." : `${launches.length} nouveauté${launches.length > 1 ? "s" : ""}`}</p>
        <Button leadingIcon={<Plus className="size-4" />} onClick={() => edit(null)} disabled={brands.length === 0} title={brands.length === 0 ? "Créez d'abord une marque" : undefined}>
          Nouvelle nouveauté
        </Button>
      </div>

      {launches.length === 0 ? (
        <Card>
          <EmptyState icon={<Sparkles className="size-5" />} title="Aucune nouveauté" description="Lancements, nouvelles gammes, informations produit : rédigés ici, validés, puis visibles dans l'onglet Découvertes de l'application." />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {launches.map((launch) => (
            <li key={launch.id}>
              <Card className="h-full">
                <CardContent className="space-y-2 pt-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <LaunchStatusBadge status={launch.reviewStatus} />
                    <RegulatoryBadge validatedAt={launch.regulatoryValidatedAt ? new Date(launch.regulatoryValidatedAt) : null} validatedBy={launch.regulatoryValidatedBy} />
                    <span className="text-[12px] text-text-tertiary">{REGULATORY_CATEGORY_LABELS[launch.regulatoryCategory as keyof typeof REGULATORY_CATEGORY_LABELS] ?? launch.regulatoryCategory}</span>
                  </div>
                  <p className="text-[15px] leading-5 font-semibold text-text-primary">{launch.title}</p>
                  <p className="text-[12.5px] text-text-tertiary">
                    {launch.brand.name} · {launch.partnerName}
                    {launch.publishedAt ? ` · publiée le ${formatDate(launch.publishedAt)}` : ""}
                    {launch.endsAt ? ` · jusqu'au ${formatDate(launch.endsAt)}` : ""}
                    {launch.infoRequests > 0 ? ` · ${launch.infoRequests} demande${launch.infoRequests > 1 ? "s" : ""} d'info` : ""}
                  </p>
                  {launch.regulatoryValidatedBy && <p className="text-[12px] text-text-tertiary">Validée par {launch.regulatoryValidatedBy}{launch.regulatoryValidatedAt ? ` le ${formatDate(launch.regulatoryValidatedAt)}` : ""}</p>}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Button size="sm" variant="outline" leadingIcon={<Pencil className="size-3.5" />} onClick={() => edit(launch)}>
                      Modifier
                    </Button>
                    {!launch.regulatoryValidatedAt && launch.reviewStatus !== "ARCHIVED" && (
                      <Button size="sm" variant="secondary" leadingIcon={<ShieldCheck className="size-3.5" />} onClick={() => { setError(null); setValidating(launch); }}>
                        Valider (réglementaire)
                      </Button>
                    )}
                    {launch.reviewStatus !== "APPROVED" && launch.reviewStatus !== "ARCHIVED" && (
                      <Button size="sm" loading={pending} disabled={!launch.regulatoryValidatedAt} title={launch.regulatoryValidatedAt ? undefined : "Validation réglementaire d'abord"} onClick={() => review(launch.id, "APPROVED")}>
                        Publier
                      </Button>
                    )}
                    {launch.reviewStatus === "APPROVED" && (
                      <Button size="sm" variant="outline" loading={pending} onClick={() => review(launch.id, "DRAFT")}>
                        Retirer
                      </Button>
                    )}
                    {launch.reviewStatus !== "ARCHIVED" && (
                      <Button size="sm" variant="ghost" loading={pending} onClick={() => review(launch.id, "ARCHIVED")}>
                        Archiver
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
        title={form?.id ? "Modifier la nouveauté" : "Nouvelle nouveauté"}
        description="Enregistrée en brouillon. Toute modification efface la validation réglementaire : ce qui est en ligne est exactement ce qui a été validé."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setForm(null)}>
              Annuler
            </Button>
            <Button loading={pending} onClick={save}>
              Enregistrer
            </Button>
          </>
        }
      >
        {form && (
          <div className="space-y-4">
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Marque" htmlFor="ln-brand" required error={fieldErrors.brandId}>
                <Select id="ln-brand" value={form.brandId} onChange={set("brandId")}>
                  <option value="">Choisir…</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name} ({brand.partnerName})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Catégorie réglementaire" htmlFor="ln-category" required error={fieldErrors.regulatoryCategory}>
                <Select id="ln-category" value={form.regulatoryCategory} onChange={set("regulatoryCategory")}>
                  {REGULATORY_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {REGULATORY_CATEGORY_LABELS[category]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Titre" htmlFor="ln-title" required error={fieldErrors.title}>
              <Input id="ln-title" value={form.title} onChange={set("title")} />
            </Field>
            <Field label="Résumé" htmlFor="ln-summary" hint="Une ou deux phrases, affichées sur la carte.">
              <Input id="ln-summary" value={form.summary} onChange={set("summary")} />
            </Field>
            <Field label="Texte" htmlFor="ln-body" required error={fieldErrors.body} hint="Informations fournies par le partenaire, sans allégation non autorisée.">
              <Textarea id="ln-body" rows={6} value={form.body} onChange={set("body")} />
            </Field>
            <Field label="Mentions obligatoires" htmlFor="ln-mentions" hint="Obligatoires pour un médicament ; reproduites à l'écran." error={fieldErrors.regulatoryMentions}>
              <Textarea id="ln-mentions" rows={2} value={form.regulatoryMentions} onChange={set("regulatoryMentions")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Vidéo ou image (https)" htmlFor="ln-media" error={fieldErrors.mediaUrl} hint="YouTube, Vimeo, Dailymotion, fichier .mp4 ou image.">
                <Input id="ln-media" value={form.mediaUrl} onChange={set("mediaUrl")} placeholder="https://…" />
              </Field>
              <Field label="Visuel de couverture (https)" htmlFor="ln-poster" error={fieldErrors.posterUrl}>
                <Input id="ln-poster" value={form.posterUrl} onChange={set("posterUrl")} placeholder="https://…" />
              </Field>
              <Field label="Format de la vidéo" htmlFor="ln-orientation">
                <Select id="ln-orientation" value={form.orientation} onChange={set("orientation")}>
                  <option value="">—</option>
                  <option value="VERTICAL">Verticale</option>
                  <option value="HORIZONTAL">Horizontale</option>
                </Select>
              </Field>
              <Field label="Univers" htmlFor="ln-universe">
                <Select id="ln-universe" value={form.universe} onChange={set("universe")}>
                  <option value="">—</option>
                  {UNIVERSES.map((universe) => (
                    <option key={universe.key} value={universe.key}>
                      {universe.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Codes produit (CIP13 / EAN)" htmlFor="ln-codes" error={fieldErrors.productCodes} hint="Séparés par des virgules.">
                <Input id="ln-codes" value={form.productCodes} onChange={set("productCodes")} />
              </Field>
              <Field label="Fin de publication" htmlFor="ln-ends" error={fieldErrors.endsAt} hint="Facultatif.">
                <Input id="ln-ends" type="date" value={form.endsAt} onChange={set("endsAt")} />
              </Field>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={validating !== null}
        onClose={() => setValidating(null)}
        title="Validation réglementaire"
        description={validating ? `« ${validating.title} » — la date du jour est enregistrée avec le nom.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setValidating(null)}>
              Annuler
            </Button>
            <Button loading={pending} onClick={validate} leadingIcon={<ShieldCheck className="size-4" />}>
              Valider
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Validé par (nom et qualité)" htmlFor="ln-validator" required>
            <Input id="ln-validator" value={validator} onChange={(event) => setValidator(event.target.value)} placeholder="Ex. : Dr Donna X, pharmacienne responsable" />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
