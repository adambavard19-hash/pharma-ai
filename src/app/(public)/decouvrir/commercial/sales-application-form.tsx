"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { submitSalesApplicationAction } from "@/server/actions/sales-applications";
import { CV_MAX_LABEL, CV_MIME, cvFileProblem, salesApplicationSchema, type SalesApplicationPayload, type SalesApplicationReceipt } from "@/core/sales-applications/form";
import { CURRENT_STATUSES, currentStatusLabel } from "@/core/sales-applications/status";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";
import { personName } from "@/core/contracts/identity";
import { Flow, type FlowErrors, type FlowStep } from "@/components/flow/flow";
import { ChoiceCards, LiveCard, LiveRow, LongTextAnswer, TextAnswer } from "@/components/flow/controls";
import { EmailAnswer } from "@/components/flow/email-answer";
import { FileAnswer, formatFileSize } from "@/components/flow/file-answer";
import { cn } from "@/lib/utils";

type Values = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  zone: string;
  currentStatus: string;
  salesExperience: string;
  healthExperience: string;
  message: string;
  /** Le CV : un fichier, jamais gardé en brouillon (voir `ephemeral`). */
  cv: File | null;
  consent: boolean;
  website: string;
};

function toPayload(v: Values): SalesApplicationPayload {
  return {
    firstName: v.firstName,
    lastName: v.lastName,
    email: v.email,
    phone: v.phone,
    city: v.city,
    zone: v.zone,
    currentStatus: v.currentStatus,
    salesExperience: v.salesExperience,
    healthExperience: v.healthExperience,
    message: v.message,
    consent: v.consent,
    website: v.website,
  };
}

/** Les règles du serveur (salesApplicationSchema), appliquées aux seuls champs de la question. */
function validate(v: Values, fields: string[]): FlowErrors {
  const errors: FlowErrors = {};
  const parsed = salesApplicationSchema.safeParse(toPayload(v));
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (fields.includes(key)) errors[key] ??= issue.message;
    }
  }
  if (fields.includes("cv") && v.cv) {
    const problem = cvFileProblem(v.cv);
    if (problem) errors.cv = problem;
  }
  return errors;
}

/**
 * La candidature d'un futur commercial, une question à la fois. Des
 * coordonnées et un parcours professionnel, rien d'autre : aucune donnée de
 * santé. Le consentement est obligatoire, et l'envoi n'active rien : l'équipe
 * étudie la candidature. Le CV (PDF, facultatif) n'est proposé que si le
 * serveur sait le conserver.
 */
export function SalesApplicationForm({ cvEnabled }: { cvEnabled: boolean }) {
  const [done, setDone] = useState<{ receipt: SalesApplicationReceipt; email: string } | null>(null);
  const initialValues = useMemo<Values>(
    () => ({ firstName: "", lastName: "", email: "", phone: "", city: "", zone: "", currentStatus: "", salesExperience: "", healthExperience: "", message: "", cv: null, consent: false, website: "" }),
    [],
  );

  const steps = useMemo<FlowStep<Values>[]>(() => {
    const first = (v: Values) => personName(v.firstName) ?? "";
    return [
      {
        id: "identite",
        section: "Vous",
        question: "Faisons connaissance : qui êtes-vous ?",
        fields: ["firstName", "lastName"],
        seconds: 8,
        validate: (v) => validate(v, ["firstName", "lastName"]),
        render: ({ values, errors, set }) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextAnswer label="Prénom" value={values.firstName} onValueChange={(v) => set("firstName", v)} error={errors.firstName} autoComplete="given-name" />
            <TextAnswer label="Nom" value={values.lastName} onValueChange={(v) => set("lastName", v)} error={errors.lastName} autoComplete="family-name" />
          </div>
        ),
        recap: { label: "Nom", value: (v) => [personName(v.firstName), personName(v.lastName)].filter(Boolean).join(" ") || null },
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
            <EmailAnswer label="E-mail" value={values.email} onValueChange={(v) => set("email", v)} error={errors.email} placeholder="vous@exemple.fr" />
            <TextAnswer label="Téléphone" type="tel" value={values.phone} onValueChange={(v) => set("phone", v)} error={errors.phone} autoComplete="tel" placeholder="06 12 34 56 78" />
          </div>
        ),
        recap: { label: "Contact", value: (v) => [v.email.trim(), v.phone.trim()].filter(Boolean).join(" · ") || null },
      },
      {
        id: "zone",
        section: "Votre secteur",
        question: "Où vous situez-vous, et où souhaitez-vous travailler ?",
        fields: ["city", "zone"],
        seconds: 12,
        validate: (v) => validate(v, ["city", "zone"]),
        render: ({ values, errors, set }) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextAnswer label="Votre ville ou secteur" value={values.city} onValueChange={(v) => set("city", v)} error={errors.city} autoComplete="address-level2" placeholder="Lyon" />
            <TextAnswer label="Zone souhaitée" value={values.zone} onValueChange={(v) => set("zone", v)} error={errors.zone} autoComplete="off" placeholder="Rhône-Alpes" />
          </div>
        ),
        recap: { label: "Secteur", value: (v) => [v.city.trim() && `Ville : ${v.city.trim()}`, v.zone.trim() && `Zone souhaitée : ${v.zone.trim()}`].filter(Boolean).join(" · ") || null },
      },
      {
        id: "statut",
        section: "Votre parcours",
        question: "Quelle est votre situation actuelle ?",
        help: "Une seule réponse : celle qui vous correspond le mieux aujourd'hui.",
        fields: ["currentStatus"],
        seconds: 6,
        validate: (v) => validate(v, ["currentStatus"]),
        render: ({ values, errors, choose }) => (
          <ChoiceCards label="Situation actuelle" columns={1} options={CURRENT_STATUSES.map((s) => ({ value: s.value, label: s.label }))} value={values.currentStatus} onChoose={(value) => choose("currentStatus", value)} error={errors.currentStatus} />
        ),
        recap: { label: "Situation", value: (v) => (v.currentStatus ? currentStatusLabel(v.currentStatus) : null) },
      },
      {
        id: "experience-commerciale",
        section: "Votre parcours",
        question: "Quelle est votre expérience commerciale ?",
        help: "Postes, secteurs, type de clients : quelques lignes suffisent.",
        fields: ["salesExperience"],
        seconds: 40,
        validate: (v) => validate(v, ["salesExperience"]),
        render: ({ values, errors, set }) => <LongTextAnswer srLabel="Expérience commerciale" value={values.salesExperience} onValueChange={(v) => set("salesExperience", v)} error={errors.salesExperience} rows={5} maxLength={2000} />,
        recap: { label: "Expérience commerciale", value: (v) => v.salesExperience.trim() || null },
      },
      {
        id: "experience-sante",
        section: "Votre parcours",
        question: "Une expérience avec les pharmacies ou la santé ?",
        help: "Facultatif : pharmacie, laboratoire, matériel médical, logiciel de santé…",
        fields: ["healthExperience"],
        optional: true,
        seconds: 20,
        validate: (v) => validate(v, ["healthExperience"]),
        render: ({ values, errors, set }) => <LongTextAnswer srLabel="Expérience avec les pharmacies ou la santé" value={values.healthExperience} onValueChange={(v) => set("healthExperience", v)} error={errors.healthExperience} rows={4} maxLength={2000} />,
        recap: { label: "Pharmacies ou santé", value: (v) => v.healthExperience.trim() || null },
      },
      {
        id: "motivation",
        section: "Votre projet",
        question: "Pourquoi souhaitez-vous rejoindre l'équipe ?",
        help: "Un mot sur ce qui vous motive.",
        fields: ["message"],
        seconds: 30,
        validate: (v) => validate(v, ["message"]),
        render: ({ values, errors, set }) => <LongTextAnswer srLabel="Message ou motivation" value={values.message} onValueChange={(v) => set("message", v)} error={errors.message} rows={5} maxLength={2000} />,
        recap: { label: "Motivation", value: (v) => v.message.trim() || null },
      },
      {
        id: "cv",
        section: "Votre projet",
        question: "Souhaitez-vous joindre votre CV ?",
        help: `Facultatif. Un fichier PDF, ${CV_MAX_LABEL} au plus.`,
        fields: ["cv"],
        optional: true,
        // Le CV n'est proposé que si le serveur sait le conserver.
        when: () => cvEnabled,
        seconds: 15,
        validate: (v) => validate(v, ["cv"]),
        render: ({ values, errors, set }) => <FileAnswer label="CV au format PDF" accept={`${CV_MIME},.pdf`} file={values.cv} onFileChange={(file) => set("cv", file)} error={errors.cv} chooseLabel="Choisir un PDF" />,
        recap: { label: "CV", value: (v) => (v.cv ? `${v.cv.name} · ${formatFileSize(v.cv.size)}` : null) },
      },
    ];
  }, [cvEnabled]);

  if (done) return <SalesDone receipt={done.receipt} email={done.email} />;

  return (
    <Flow<Values>
      name="commercial"
      steps={steps}
      initialValues={initialValues}
      ephemeral={["consent", "cv"]}
      honeypot="website"
      recapTitle="Votre candidature est prête."
      aside={(v) => <SalesAside values={v} />}
      final={({ values, errors, set }) => (
        <div className="space-y-1.5">
          <label className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-[14.5px] leading-6 text-text-primary transition-colors", errors.consent ? "border-danger-500" : values.consent ? "border-brand-400 bg-brand-50/70 dark:bg-brand-950/30" : "border-border-default bg-surface-app hover:border-brand-300")}>
            <input type="checkbox" checked={values.consent} onChange={(e) => set("consent", e.target.checked)} className="mt-1 size-[18px] shrink-0 accent-brand-700" aria-invalid={errors.consent ? true : undefined} aria-describedby={errors.consent ? "sa-consent-error" : undefined} />
            <span>
              J&apos;accepte que PharmaBoost utilise ces informations{cvEnabled ? ", et mon CV s'il est joint," : ""} uniquement pour étudier ma candidature et me recontacter. Elles ne sont pas utilisées à d&apos;autres fins.{" "}
              <Link href="/decouvrir/confidentialite#candidatures-commerciales" target="_blank" rel="noopener" className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800">
                En savoir plus
              </Link>
              <span className="text-danger-600" aria-hidden="true"> *</span>
            </span>
          </label>
          {errors.consent && (
            <p id="sa-consent-error" className="text-[12.5px] text-danger-600" role="alert">
              {errors.consent}
            </p>
          )}
        </div>
      )}
      canSubmit={(v) => v.consent}
      submitLabel="Envoyer ma candidature"
      submitHint="Aucune activation automatique : notre équipe étudie chaque candidature."
      onSubmit={async (v) => {
        const body = new FormData();
        body.set("payload", JSON.stringify(toPayload(v)));
        if (v.cv) body.set("cv", v.cv);
        const result = await submitSalesApplicationAction(body);
        if (!result.ok) return { ok: false, error: result.error, fieldErrors: result.fieldErrors };
        setDone({ receipt: result.data, email: v.email.trim() });
        return { ok: true };
      }}
    />
  );
}

function SalesAside({ values }: { values: Values }) {
  const name = [personName(values.firstName), personName(values.lastName)].filter(Boolean).join(" ");
  return (
    <LiveCard title="Votre candidature" footer="Notre équipe étudie chaque candidature. Vos informations ne servent qu'à cela.">
      <div className="divide-y divide-border-subtle/70">
        <LiveRow label="Nom" value={name} />
        <LiveRow label="Ville ou secteur" value={values.city.trim()} />
        <LiveRow label="Zone souhaitée" value={values.zone.trim()} />
        <LiveRow label="Situation" value={values.currentStatus ? currentStatusLabel(values.currentStatus) : null} />
      </div>
    </LiveCard>
  );
}

function SalesDone({ receipt, email }: { receipt: SalesApplicationReceipt; email: string }) {
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
        {receipt.acknowledged ? (
          <>Un accusé de réception vous a été envoyé à <span className="font-medium text-text-primary">{email}</span>.</>
        ) : (
          <>Votre candidature est enregistrée ; notre équipe vous écrira à <span className="font-medium text-text-primary">{email}</span> si votre profil est retenu.</>
        )}
      </p>
      {receipt.cv === "failed" && (
        <p className="mt-3 text-[15px] leading-6 text-text-secondary">
          Votre CV n&apos;a pas pu être joint. Vous pouvez l&apos;envoyer à <span className="font-medium text-text-primary">{PUBLIC_CONTACT_EMAIL}</span>.
        </p>
      )}
      <h4 className="mt-9 font-mono text-[11.5px] tracking-[0.14em] text-text-tertiary uppercase">Et maintenant</h4>
      <ol className="mt-4 space-y-4">
        {[
          { title: "Notre équipe étudie votre candidature", body: "Chaque candidature est lue par notre équipe." },
          { title: "Un premier échange", body: "Si votre profil est retenu, nous vous contactons pour échanger." },
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
