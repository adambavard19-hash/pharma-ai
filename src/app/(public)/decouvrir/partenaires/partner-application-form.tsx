"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { submitPartnerApplicationAction } from "@/server/actions/partner-applications";
import { partnerApplicationSchema, type PartnerApplicationPayload } from "@/core/partners/application-form";
import { UNIVERSES, universeLabel } from "@/config/universes";
import { personName } from "@/core/contracts/identity";
import { Flow, type FlowErrors, type FlowStep } from "@/components/flow/flow";
import { LiveCard, LiveRow, LongTextAnswer, MultiCards, Segmented, TextAnswer } from "@/components/flow/controls";
import { EmailAnswer } from "@/components/flow/email-answer";
import { cn } from "@/lib/utils";

type ApiAnswer = "YES" | "NO" | "UNKNOWN";
type YesNo = "yes" | "no";

const API_OPTIONS: { value: ApiAnswer; label: string }[] = [
  { value: "YES", label: "Oui" },
  { value: "NO", label: "Non" },
  { value: "UNKNOWN", label: "Je ne sais pas" },
];
const YES_NO: { value: YesNo; label: string }[] = [
  { value: "yes", label: "Oui" },
  { value: "no", label: "Non" },
];
const CHANNELS = ["Grossistes-répartiteurs", "Vente directe aux officines", "Groupements et enseignes", "Centrales d'achat", "Plateformes en ligne"];

type Values = {
  company: string;
  brand: string;
  universes: string[];
  approxReferences: string;
  channels: string[];
  distributionNote: string;
  websiteUrl: string;
  hasApi: ApiAnswer | "";
  hasB2bPortal: YesNo | "";
  hasCatalog: YesNo | "";
  hasTrainings: YesNo | "";
  contactFirstName: string;
  contactLastName: string;
  contactRole: string;
  email: string;
  phone: string;
  message: string;
  consent: boolean;
  website: string;
};

const yesNo = (value: YesNo | ""): boolean | null => (value === "" ? null : value === "yes");

/** Les canaux cochés et la précision deviennent le texte « distribution » attendu par le serveur. */
function distributionText(v: Values): string {
  return [v.channels.join(", "), v.distributionNote.trim()].filter(Boolean).join(" — ");
}

function toPayload(v: Values): PartnerApplicationPayload {
  const refs = v.approxReferences.replace(/[\s  .]/g, "");
  return {
    company: v.company,
    brand: v.brand,
    contactFirstName: v.contactFirstName,
    contactLastName: v.contactLastName,
    contactRole: v.contactRole,
    email: v.email,
    phone: v.phone,
    websiteUrl: v.websiteUrl,
    universes: v.universes,
    approxReferences: refs ? (/^\d+$/.test(refs) ? Number(refs) : Number.NaN) : null,
    distribution: distributionText(v),
    hasApi: v.hasApi || "UNKNOWN",
    hasB2bPortal: yesNo(v.hasB2bPortal),
    hasCatalog: yesNo(v.hasCatalog),
    hasTrainings: yesNo(v.hasTrainings),
    message: v.message,
    consent: v.consent,
    website: v.website,
  };
}

/** Les règles du serveur (partnerApplicationSchema), appliquées aux seuls champs de la question. */
function validate(v: Values, fields: string[]): FlowErrors {
  const parsed = partnerApplicationSchema.safeParse(toPayload(v));
  if (parsed.success) return {};
  const errors: FlowErrors = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0]);
    if (fields.includes(key)) errors[key] ??= key === "approxReferences" ? "Indiquez un nombre, par exemple 120." : issue.message;
  }
  return errors;
}

/** « 1200 » → « 1 200 » au fil de la frappe. */
function groupDigits(value: string): string {
  const digits = value.replace(/\D+/g, "").slice(0, 7);
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/**
 * La candidature d'un laboratoire ou d'une marque, une question à la fois.
 * Les coordonnées d'une société, rien d'autre : aucune donnée de santé. Le
 * consentement est obligatoire, et l'envoi n'active rien : l'équipe étudie
 * la candidature.
 */
export function PartnerApplicationForm() {
  const [done, setDone] = useState<{ acknowledged: boolean; email: string } | null>(null);
  const initialValues = useMemo<Values>(
    () => ({
      company: "",
      brand: "",
      universes: [],
      approxReferences: "",
      channels: [],
      distributionNote: "",
      websiteUrl: "",
      hasApi: "",
      hasB2bPortal: "",
      hasCatalog: "",
      hasTrainings: "",
      contactFirstName: "",
      contactLastName: "",
      contactRole: "",
      email: "",
      phone: "",
      message: "",
      consent: false,
      website: "",
    }),
    [],
  );

  const steps = useMemo<FlowStep<Values>[]>(() => {
    const first = (v: Values) => personName(v.contactFirstName) ?? "";
    return [
      {
        id: "societe",
        section: "Votre société",
        question: "Quelle société représentez-vous ?",
        help: "Le laboratoire ou la société qui commercialise vos gammes.",
        fields: ["company"],
        seconds: 6,
        validate: (v) => validate(v, ["company"]),
        render: ({ values, errors, set }) => <TextAnswer srLabel="Société" value={values.company} onValueChange={(v) => set("company", v)} error={errors.company} autoComplete="organization" placeholder="Laboratoires Exemple" />,
        recap: { label: "Société", value: (v) => v.company.trim() || null },
      },
      {
        id: "marque",
        section: "Votre société",
        question: "Et la marque que vous souhaitez présenter ?",
        help: "Plusieurs marques ? Indiquez la principale, et les autres dans votre message.",
        fields: ["brand"],
        seconds: 6,
        validate: (v) => validate(v, ["brand"]),
        render: ({ values, errors, set }) => (
          <div className="space-y-3">
            <TextAnswer id="pa-brand" srLabel="Marque" value={values.brand} onValueChange={(v) => set("brand", v)} error={errors.brand} autoComplete="off" />
            {values.company.trim() && values.brand.trim() !== values.company.trim() && (
              <button type="button" onClick={() => {
                  set("brand", values.company.trim());
                  requestAnimationFrame(() => document.getElementById("pa-brand")?.focus());
                }} className="rounded-full border border-border-default bg-surface-app px-3.5 py-1.5 text-[13.5px] font-medium text-text-secondary hover:border-brand-300 hover:text-text-primary">
                Même nom que la société : {values.company.trim()}
              </button>
            )}
          </div>
        ),
        recap: { label: "Marque", value: (v) => v.brand.trim() || null },
      },
      {
        id: "univers",
        section: "Vos gammes",
        question: "Dans quels univers sont vos gammes ?",
        help: "Plusieurs réponses possibles. Un autre univers ? Précisez-le dans votre message.",
        fields: ["universes"],
        optional: true,
        seconds: 10,
        render: ({ values, set }) => <MultiCards label="Univers" dense columns={3} options={UNIVERSES.map((u) => ({ value: u.key, label: u.label }))} values={values.universes} onToggle={(key) => set("universes", values.universes.includes(key) ? values.universes.filter((k) => k !== key) : [...values.universes, key])} />,
        recap: { label: "Univers", value: (v) => v.universes.map(universeLabel).join(", ") || null },
      },
      {
        id: "references",
        section: "Vos gammes",
        question: "Combien de références environ ?",
        help: "Un ordre de grandeur suffit.",
        fields: ["approxReferences"],
        optional: true,
        seconds: 5,
        validate: (v) => validate(v, ["approxReferences"]),
        render: ({ values, errors, set }) => <TextAnswer srLabel="Nombre de références" value={groupDigits(values.approxReferences)} onValueChange={(v) => set("approxReferences", v.replace(/\D+/g, ""))} error={errors.approxReferences} inputMode="numeric" autoComplete="off" placeholder="120" className="max-w-56" trailing={<span className="text-[14px] text-text-tertiary">réf.</span>} />,
        recap: { label: "Références", value: (v) => (v.approxReferences ? groupDigits(v.approxReferences) : null) },
      },
      {
        id: "distribution",
        section: "Vos gammes",
        question: "Comment vos produits arrivent-ils en officine ?",
        help: "Plusieurs réponses possibles.",
        fields: ["distribution", "channels", "distributionNote"],
        optional: true,
        isEmpty: (v) => v.channels.length === 0 && !v.distributionNote.trim(),
        seconds: 10,
        validate: (v) => {
          const errors = validate(v, ["distribution"]);
          return errors.distribution ? { distributionNote: "Précision trop longue : 300 caractères au plus en tout." } : {};
        },
        render: ({ values, errors, set }) => (
          <div className="space-y-4">
            <MultiCards label="Canaux de distribution" options={CHANNELS.map((c) => ({ value: c, label: c }))} values={values.channels} onToggle={(c) => set("channels", values.channels.includes(c) ? values.channels.filter((x) => x !== c) : [...values.channels, c])} />
            <TextAnswer label="Une précision ?" value={values.distributionNote} onValueChange={(v) => set("distributionNote", v)} error={errors.distributionNote} autoComplete="off" placeholder="Grossistes nationaux, référencement en cours chez…" maxLength={200} />
          </div>
        ),
        recap: { label: "Distribution", value: (v) => distributionText(v) || null },
      },
      {
        id: "site",
        section: "Vos gammes",
        question: "Votre site internet ?",
        fields: ["websiteUrl"],
        optional: true,
        seconds: 5,
        validate: (v) => validate(v, ["websiteUrl"]),
        render: ({ values, errors, set }) => <TextAnswer srLabel="Site internet" value={values.websiteUrl} onValueChange={(v) => set("websiteUrl", v)} error={errors.websiteUrl} inputMode="url" autoComplete="url" autoCapitalize="none" spellCheck={false} placeholder="www.votre-marque.fr" />,
        recap: { label: "Site", value: (v) => v.websiteUrl.trim() || null },
      },
      {
        id: "outils",
        section: "Vos outils",
        question: "Quels outils pouvez-vous partager ?",
        help: "Pour savoir comment nous pourrions travailler ensemble. Rien n'est requis à ce stade.",
        fields: ["hasApi", "hasB2bPortal", "hasCatalog", "hasTrainings"],
        optional: true,
        seconds: 12,
        render: ({ values, set }) => (
          <div className="divide-y divide-border-subtle rounded-2xl border border-border-subtle px-4 sm:px-5">
            <Segmented label="Une API" options={API_OPTIONS} value={values.hasApi || null} onChange={(v) => set("hasApi", v)} />
            <Segmented label="Un portail B2B" options={YES_NO} value={values.hasB2bPortal || null} onChange={(v) => set("hasB2bPortal", v)} />
            <Segmented label="Un catalogue" options={YES_NO} value={values.hasCatalog || null} onChange={(v) => set("hasCatalog", v)} />
            <Segmented label="Des formations" options={YES_NO} value={values.hasTrainings || null} onChange={(v) => set("hasTrainings", v)} />
          </div>
        ),
        recap: {
          label: "Outils",
          value: (v) => {
            const answer = (value: string) => ({ YES: "oui", NO: "non", UNKNOWN: "je ne sais pas", yes: "oui", no: "non" })[value];
            const parts = [
              ["API", v.hasApi],
              ["Portail B2B", v.hasB2bPortal],
              ["Catalogue", v.hasCatalog],
              ["Formations", v.hasTrainings],
            ]
              .filter(([, value]) => value)
              .map(([name, value]) => `${name} : ${answer(value)}`);
            return parts.join(" · ") || null;
          },
        },
      },
      {
        id: "interlocuteur",
        section: "Vous",
        question: "Faisons connaissance : qui êtes-vous ?",
        fields: ["contactFirstName", "contactLastName", "contactRole"],
        seconds: 12,
        validate: (v) => validate(v, ["contactFirstName", "contactLastName", "contactRole"]),
        render: ({ values, errors, set }) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextAnswer label="Prénom" value={values.contactFirstName} onValueChange={(v) => set("contactFirstName", v)} error={errors.contactFirstName} autoComplete="given-name" />
            <TextAnswer label="Nom" value={values.contactLastName} onValueChange={(v) => set("contactLastName", v)} error={errors.contactLastName} autoComplete="family-name" />
            <TextAnswer label="Fonction" className="sm:col-span-2" value={values.contactRole} onValueChange={(v) => set("contactRole", v)} error={errors.contactRole} autoComplete="organization-title" placeholder="Directrice commerciale, responsable trade marketing…" hint="Facultatif." />
          </div>
        ),
        recap: { label: "Interlocuteur", value: (v) => [[personName(v.contactFirstName), personName(v.contactLastName)].filter(Boolean).join(" "), v.contactRole.trim()].filter(Boolean).join(", ") || null },
      },
      {
        id: "contact",
        section: "Vous",
        question: (v) => (first(v) ? `Comment vous joindre, ${first(v)} ?` : "Comment vous joindre ?"),
        help: "L'accusé de réception part à cette adresse.",
        fields: ["email", "phone"],
        seconds: 10,
        validate: (v) => validate(v, ["email", "phone"]),
        render: ({ values, errors, set }) => (
          <div className="grid gap-4 sm:grid-cols-[1.4fr_1fr]">
            <EmailAnswer label="E-mail professionnel" value={values.email} onValueChange={(v) => set("email", v)} error={errors.email} placeholder="vous@votre-marque.fr" />
            <TextAnswer label="Téléphone" type="tel" value={values.phone} onValueChange={(v) => set("phone", v)} error={errors.phone} autoComplete="tel" hint="Facultatif." />
          </div>
        ),
        recap: { label: "Contact", value: (v) => [v.email.trim(), v.phone.trim()].filter(Boolean).join(" · ") || null },
      },
      {
        id: "message",
        section: "Votre projet",
        question: "Un mot sur votre projet ?",
        help: "Vos gammes, ce que vous attendez d'un partenariat, un autre univers…",
        fields: ["message"],
        optional: true,
        seconds: 20,
        validate: (v) => validate(v, ["message"]),
        render: ({ values, errors, set }) => <LongTextAnswer srLabel="Message" value={values.message} onValueChange={(v) => set("message", v)} error={errors.message} rows={5} maxLength={2000} />,
        recap: { label: "Message", value: (v) => v.message.trim() || null },
      },
    ];
  }, []);

  if (done) return <PartnerDone acknowledged={done.acknowledged} email={done.email} />;

  return (
    <Flow<Values>
      name="partenaire"
      steps={steps}
      initialValues={initialValues}
      ephemeral={["consent"]}
      honeypot="website"
      recapTitle="Votre candidature est prête."
      aside={(v) => <PartnerAside values={v} />}
      final={({ values, errors, set }) => (
        <div className="space-y-1.5">
          <label className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-[14.5px] leading-6 text-text-primary transition-colors", errors.consent ? "border-danger-500" : values.consent ? "border-brand-400 bg-brand-50/70 dark:bg-brand-950/30" : "border-border-default bg-surface-app hover:border-brand-300")}>
            <input type="checkbox" checked={values.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-1 size-[18px] shrink-0 accent-brand-700" aria-invalid={errors.consent ? true : undefined} aria-describedby={errors.consent ? "pa-consent-error" : undefined} />
            <span>
              J&apos;accepte que PharmaBoost utilise ces informations uniquement pour étudier ma candidature et me recontacter. Elles ne sont pas utilisées à d&apos;autres fins.{" "}
              <Link href="/decouvrir/confidentialite" target="_blank" rel="noopener" className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800">
                En savoir plus
              </Link>
              <span className="text-danger-600" aria-hidden="true"> *</span>
            </span>
          </label>
          {errors.consent && (
            <p id="pa-consent-error" className="text-[12.5px] text-danger-600" role="alert">
              {errors.consent}
            </p>
          )}
        </div>
      )}
      canSubmit={(v) => v.consent}
      submitLabel="Envoyer ma candidature"
      submitHint="Aucune activation automatique : notre équipe étudie chaque candidature."
      onSubmit={async (v) => {
        const result = await submitPartnerApplicationAction(toPayload(v));
        if (!result.ok) return { ok: false, error: result.error, fieldErrors: result.fieldErrors };
        setDone({ acknowledged: result.data.acknowledged, email: v.email.trim() });
        return { ok: true };
      }}
    />
  );
}

function PartnerAside({ values }: { values: Values }) {
  const contact = [personName(values.contactFirstName), personName(values.contactLastName)].filter(Boolean).join(" ");
  return (
    <LiveCard title="Votre candidature" footer="Aucune activation automatique : notre équipe étudie chaque candidature et vous recontacte.">
      <div className="divide-y divide-border-subtle/70">
        <LiveRow label="Société" value={values.company.trim()} />
        <LiveRow label="Marque" value={values.brand.trim()} />
        <LiveRow
          label="Univers"
          value={
            values.universes.length ? (
              <span className="mt-1 flex flex-wrap gap-1">
                {values.universes.map((key) => (
                  <span key={key} className="rounded-full bg-brand-50 px-2 py-0.5 text-[12px] font-medium text-brand-800 dark:bg-brand-950/50 dark:text-brand-200">
                    {universeLabel(key)}
                  </span>
                ))}
              </span>
            ) : null
          }
        />
        <LiveRow label="Références" value={values.approxReferences ? `${groupDigits(values.approxReferences)} environ` : null} />
        <LiveRow label="Interlocuteur" value={contact} />
      </div>
    </LiveCard>
  );
}

function PartnerDone({ acknowledged, email }: { acknowledged: boolean; email: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Le parcours disparaît, la page raccourcit : la confirmation vient sous les yeux.
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, []);
  return (
    <div ref={ref} className="mx-auto max-w-2xl py-6 sm:py-10" role="status">
      <span className="flex size-14 items-center justify-center rounded-full bg-brand-600 text-white motion-safe:animate-slide-up" aria-hidden="true">
        <Check className="size-7" strokeWidth={3} />
      </span>
      <h3 className="mt-6 text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-text-primary text-balance">Candidature reçue.</h3>
      <p className="mt-4 text-[16px] leading-7 text-text-secondary">
        {acknowledged ? (
          <>Un accusé de réception vous a été envoyé à <span className="font-medium text-text-primary">{email}</span>.</>
        ) : (
          <>Votre candidature est enregistrée ; notre équipe vous recontacte à <span className="font-medium text-text-primary">{email}</span>.</>
        )}
      </p>
      <h4 className="mt-9 font-mono text-[11.5px] tracking-[0.14em] text-text-tertiary uppercase">Et maintenant</h4>
      <ol className="mt-4 space-y-4">
        {[
          { title: "Notre équipe étudie votre candidature", body: "Rien n'est activé automatiquement." },
          { title: "Nous échangeons", body: "Nous convenons ensemble des gammes, des conditions et de la façon de travailler." },
          { title: "Diffusion aux officines", body: "Les gammes retenues sont présentées aux officines, dans leur espace partenaire." },
        ].map((step, i) => (
          <li key={step.title} className="flex gap-4">
            <span className={i === 0 ? "flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[13px] font-semibold text-white" : "flex size-8 shrink-0 items-center justify-center rounded-full border border-border-default text-[13px] font-semibold text-text-secondary"}>{i + 1}</span>
            <div className="pt-1">
              <p className="text-[15.5px] font-semibold text-text-primary">{step.title}</p>
              <p className="mt-0.5 text-[14px] leading-6 text-text-secondary">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <Link href="/decouvrir" className="mt-9 inline-flex h-11 items-center rounded-xl border border-border-default px-5 text-[14.5px] font-medium text-text-primary hover:bg-surface-sunken">
        Retour au site
      </Link>
    </div>
  );
}
