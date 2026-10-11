"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { saveAcademyContentAction, type AcademyContentPayload } from "@/server/actions/platform-academy";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ACADEMY_KINDS, ACADEMY_KIND_LABELS } from "@/core/academy/content";
import { ACADEMY_TOPICS, ACADEMY_TOPIC_LABELS } from "@/core/academy/topics";

export type ContentFormValues = {
  id: string | null;
  title: string;
  summary: string;
  kind: string;
  url: string;
  body: string;
  academyTopic: string;
  orientation: string;
  durationSeconds: string;
  authorName: string;
  authorRole: string;
  partnerId: string;
  isSponsored: boolean;
  isFreeAccess: boolean;
  quizPassPercent: string;
  sourceLabel: string;
  laboratory: string;
};

export const EMPTY_CONTENT: ContentFormValues = {
  id: null,
  title: "",
  summary: "",
  kind: "MICRO_VIDEO",
  url: "",
  body: "",
  academyTopic: "",
  orientation: "VERTICAL",
  durationSeconds: "",
  authorName: "",
  authorRole: "",
  partnerId: "",
  isSponsored: false,
  isFreeAccess: false,
  quizPassPercent: "70",
  sourceLabel: "",
  laboratory: "",
};

/**
 * Le formulaire d'un contenu de l'Académie. Enregistrer un contenu déjà relu le renvoie en brouillon : la console le
 * dit avant (bandeau) et après (message).
 */
export function ContentForm({ initial, partners, reviewed }: { initial: ContentFormValues; partners: { id: string; name: string }[]; reviewed: boolean }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();
  const set = <K extends keyof ContentFormValues>(key: K, value: ContentFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  const isSheet = values.kind === "SHEET";

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    start(async () => {
      const payload: AcademyContentPayload = { ...values, id: values.id, partnerId: values.partnerId || null, academyTopic: values.academyTopic || null };
      const result = await saveAcademyContentAction(payload);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        push({ tone: "error", title: result.error });
        return;
      }
      setErrors({});
      push({ tone: "success", title: result.message ?? "Enregistré." });
      if (result.data.created) router.push(`/admin/academie/${result.data.id}`);
      else router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {reviewed && (
        <p className="rounded-xl bg-warning-50 px-4 py-3 text-[13px] leading-5 text-warning-800">
          Ce contenu a été relu. Toute modification le renvoie en brouillon et le retire de l&apos;application jusqu&apos;à une nouvelle relecture.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Titre" htmlFor="ac-title" required error={errors.title} className="sm:col-span-2">
          <Input id="ac-title" value={values.title} onChange={(e) => set("title", e.target.value)} maxLength={160} aria-invalid={Boolean(errors.title)} />
        </Field>
        <Field label="Résumé" htmlFor="ac-summary" hint="Deux lignes sous le titre, dans le fil." className="sm:col-span-2">
          <Textarea id="ac-summary" value={values.summary} onChange={(e) => set("summary", e.target.value)} maxLength={500} rows={2} />
        </Field>
        <Field label="Format" htmlFor="ac-kind" required error={errors.kind}>
          <Select id="ac-kind" value={values.kind} onChange={(e) => { set("kind", e.target.value); set("orientation", e.target.value === "MICRO_VIDEO" ? "VERTICAL" : "HORIZONTAL"); }}>
            {ACADEMY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {ACADEMY_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Thème" htmlFor="ac-topic" error={errors.academyTopic} hint="« Médicaments » exige une relecture par un pharmacien.">
          <Select id="ac-topic" value={values.academyTopic} onChange={(e) => set("academyTopic", e.target.value)}>
            <option value="">Sans thème</option>
            {ACADEMY_TOPICS.map((topic) => (
              <option key={topic} value={topic}>
                {ACADEMY_TOPIC_LABELS[topic]}
              </option>
            ))}
          </Select>
        </Field>
        {!isSheet && (
          <>
            <Field label="Sens de la vidéo" htmlFor="ac-orientation">
              <Select id="ac-orientation" value={values.orientation} onChange={(e) => set("orientation", e.target.value)}>
                <option value="VERTICAL">Verticale (9:16)</option>
                <option value="HORIZONTAL">Horizontale (16:9)</option>
              </Select>
            </Field>
            <Field label="Durée (secondes)" htmlFor="ac-duration" error={errors.durationSeconds} hint={values.kind === "MICRO_VIDEO" ? "60 à 180 s recommandées, 180 au plus." : undefined}>
              <Input id="ac-duration" inputMode="numeric" value={values.durationSeconds} onChange={(e) => set("durationSeconds", e.target.value.replace(/\D/g, ""))} aria-invalid={Boolean(errors.durationSeconds)} />
            </Field>
            <Field label="Lien YouTube, Vimeo ou Dailymotion" htmlFor="ac-url" error={errors.url} hint="Facultatif si vous envoyez le fichier vidéo (ci-dessous, après le premier enregistrement)." className="sm:col-span-2">
              <Input id="ac-url" type="url" value={values.url} onChange={(e) => set("url", e.target.value)} placeholder="https://www.youtube.com/watch?v=…" aria-invalid={Boolean(errors.url)} />
            </Field>
          </>
        )}
        <Field label={isSheet ? "Texte de la fiche" : "Texte d'accompagnement (facultatif)"} htmlFor="ac-body" required={isSheet} error={errors.body} className="sm:col-span-2">
          <Textarea id="ac-body" value={values.body} onChange={(e) => set("body", e.target.value)} rows={isSheet ? 10 : 3} maxLength={8000} aria-invalid={Boolean(errors.body)} />
        </Field>
        <Field label="Auteur" htmlFor="ac-author" required error={errors.authorName} hint="Affiché sous le contenu.">
          <Input id="ac-author" value={values.authorName} onChange={(e) => set("authorName", e.target.value)} placeholder="Dr Claire Martin" aria-invalid={Boolean(errors.authorName)} />
        </Field>
        <Field label="Qualité de l'auteur" htmlFor="ac-author-role">
          <Input id="ac-author-role" value={values.authorRole} onChange={(e) => set("authorRole", e.target.value)} placeholder="Pharmacienne, formatrice" />
        </Field>
        <Field label="Partenaire" htmlFor="ac-partner" error={errors.partnerId} hint="Toujours affiché dans l'application.">
          <Select id="ac-partner" value={values.partnerId} onChange={(e) => set("partnerId", e.target.value)}>
            <option value="">Aucun</option>
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Laboratoire (texte)" htmlFor="ac-lab">
          <Input id="ac-lab" value={values.laboratory} onChange={(e) => set("laboratory", e.target.value)} />
        </Field>
        <Field label="Seuil de réussite du quiz (%)" htmlFor="ac-pass" error={errors.quizPassPercent}>
          <Input id="ac-pass" inputMode="numeric" value={values.quizPassPercent} onChange={(e) => set("quizPassPercent", e.target.value.replace(/\D/g, ""))} aria-invalid={Boolean(errors.quizPassPercent)} />
        </Field>
        <Field label="Source affichée" htmlFor="ac-source" hint="« Académie PharmaBoost » par défaut.">
          <Input id="ac-source" value={values.sourceLabel} onChange={(e) => set("sourceLabel", e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-3 rounded-xl border border-border-subtle bg-surface-sunken/50 p-4 sm:grid-cols-2">
        <Checkbox id="ac-free" checked={values.isFreeAccess} onChange={(e) => set("isFreeAccess", e.target.checked)} label="Ouvert aux comptes gratuits" description="Sinon : réservé aux équipes des officines clientes." />
        <Checkbox id="ac-sponsored" checked={values.isSponsored} onChange={(e) => set("isSponsored", e.target.checked)} label="Contenu sponsorisé" description="Affiché « Sponsorisé · partenaire ». Le partenaire est obligatoire." />
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={pending} leadingIcon={<Save className="size-4" aria-hidden="true" />}>
          {values.id ? "Enregistrer" : "Créer le brouillon"}
        </Button>
      </div>
    </form>
  );
}
