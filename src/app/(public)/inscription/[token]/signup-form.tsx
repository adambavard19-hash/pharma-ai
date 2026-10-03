"use client";

import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { markInvitationOpenedAction, submitOnboardingAction } from "@/server/actions/pharmacy-signup";
import { LGO_OPTIONS, onboardingSchema, type OnboardingInput } from "@/core/onboarding/form";
import { formatSiret, personName } from "@/core/contracts/identity";
import { Flow, type FlowErrors, type FlowStep } from "@/components/flow/flow";
import { ChoiceCards, CountAnswer, LiveCard, LiveRow, TextAnswer } from "@/components/flow/controls";
import { EmailAnswer } from "@/components/flow/email-answer";
import { officineSteps } from "@/components/flow/officine-steps";
import type { Prefill } from "@/components/flow/registry-answers";

type Fields = Record<keyof OnboardingInput, string>;
type Values = Fields & { titleOther: boolean; prefill: Prefill };

const TITLES = ["Pharmacien titulaire", "Pharmacienne titulaire", "Co-titulaire", "Gérant", "Gérante", "Président", "Présidente"];
const FIELD_KEYS = Object.keys(onboardingSchema.shape) as (keyof OnboardingInput)[];

function fieldsOf(v: Values): Fields {
  return Object.fromEntries(FIELD_KEYS.map((key) => [key, v[key] ?? ""])) as Fields;
}

/** Les règles du serveur (onboardingSchema), appliquées aux seuls champs de la question. */
function validate(v: Values, fields: string[]): FlowErrors {
  const parsed = onboardingSchema.safeParse(fieldsOf(v));
  if (parsed.success) return {};
  const errors: FlowErrors = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0]);
    if (fields.includes(key)) errors[key] ??= issue.message;
  }
  return errors;
}

/**
 * L'inscription d'une officine par son titulaire, depuis le lien de son
 * invitation, une question à la fois. Ce que le commercial a déjà renseigné
 * est prérempli ; le SIRET retrouve le reste dans l'annuaire public. Aucun
 * compte demandé, aucune donnée patient.
 */
export function SignupForm({ token, prefill, expiresAt }: { token: string; prefill: Fields; expiresAt: string }) {
  const [done, setDone] = useState<{ pharmacyName: string } | null>(null);

  // Le navigateur du titulaire marque l'invitation « ouverte » (pas un antivirus de messagerie).
  useEffect(() => {
    void markInvitationOpenedAction(token);
  }, [token]);

  const initialValues = useMemo<Values>(() => ({ ...prefill, titleOther: Boolean(prefill.ownerTitle) && !TITLES.includes(prefill.ownerTitle), prefill: {} }), [prefill]);

  const steps = useMemo<FlowStep<Values>[]>(() => {
    const first = (v: Values) => personName(v.ownerFirstName) ?? "";
    return [
      ...officineSteps<Values>({ keys: { siret: "siret", name: "name", legalName: "legalName", addressLine1: "addressLine1", postalCode: "postalCode", city: "city", finessNumber: "finessNumber", phone: "phone", contactEmail: "contactEmail" }, validate }),
      {
        id: "titulaire",
        section: "Le titulaire",
        question: "Qui est le ou la titulaire ?",
        help: "La personne qui signera le contrat au nom de l'officine.",
        fields: ["ownerFirstName", "ownerLastName"],
        seconds: 10,
        validate: (v) => validate(v, ["ownerFirstName", "ownerLastName"]),
        render: ({ values, errors, set }) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextAnswer label="Prénom" value={values.ownerFirstName} onValueChange={(v) => set("ownerFirstName", v)} error={errors.ownerFirstName} autoComplete="given-name" />
            <TextAnswer label="Nom" value={values.ownerLastName} onValueChange={(v) => set("ownerLastName", v)} error={errors.ownerLastName} autoComplete="family-name" />
          </div>
        ),
        recap: { label: "Titulaire", value: (v) => [personName(v.ownerFirstName), personName(v.ownerLastName)].filter(Boolean).join(" ") || null },
      },
      {
        id: "qualite",
        section: "Le titulaire",
        question: (v) => (first(v) ? `En quelle qualité, ${first(v)} ?` : "En quelle qualité signez-vous ?"),
        help: "Facultatif : par défaut, pharmacien titulaire.",
        fields: ["ownerTitle"],
        optional: true,
        seconds: 5,
        validate: (v) => validate(v, ["ownerTitle"]),
        render: ({ values, errors, set, patch, choose }) => (
          <div className="space-y-4">
            <ChoiceCards
              label="Qualité"
              options={[...TITLES.map((t) => ({ value: t, label: t })), { value: "__autre", label: "Autre qualité" }]}
              value={values.titleOther ? "__autre" : values.ownerTitle}
              onChoose={(value) => {
                if (value === "__autre") patch({ titleOther: true, ownerTitle: TITLES.includes(values.ownerTitle) ? "" : values.ownerTitle });
                else {
                  patch({ titleOther: false });
                  choose("ownerTitle", value);
                }
              }}
            />
            {values.titleOther && <TextAnswer label="Votre qualité" value={values.ownerTitle} onValueChange={(v) => set("ownerTitle", v)} error={errors.ownerTitle} autofocus />}
          </div>
        ),
        recap: { label: "Qualité", value: (v) => v.ownerTitle || "Pharmacien titulaire (par défaut)" },
      },
      {
        id: "email",
        section: "Le titulaire",
        question: (v) => (first(v) ? `Votre adresse e-mail, ${first(v)} ?` : "Votre adresse e-mail ?"),
        help: "Le contrat et votre accès PharmaBoost partiront à cette adresse.",
        fields: ["ownerEmail"],
        seconds: 8,
        validate: (v) => validate(v, ["ownerEmail"]),
        render: ({ values, errors, set }) => <EmailAnswer value={values.ownerEmail} onValueChange={(v) => set("ownerEmail", v)} error={errors.ownerEmail} placeholder="vous@pharmacie.fr" />,
        recap: { label: "E-mail", value: (v) => v.ownerEmail.trim() || null },
      },
      {
        id: "postes",
        section: "L'équipement",
        question: "Sur combien de postes de comptoir installer PharmaBoost ?",
        fields: ["postCount"],
        seconds: 5,
        validate: (v) => validate(v, ["postCount"]),
        render: ({ values, errors, set, choose }) => <CountAnswer label="Postes de comptoir" value={values.postCount} onValueChange={(v) => set("postCount", v)} onChoose={(v) => choose("postCount", v)} quick={[1, 2, 3, 4]} max={99} error={errors.postCount} />,
        recap: { label: "Postes", value: (v) => v.postCount || null },
      },
      {
        id: "logiciel",
        section: "L'équipement",
        question: "Quel logiciel de gestion utilisez-vous ?",
        help: "Facultatif : vous pouvez passer si vous ne savez pas.",
        fields: ["lgo"],
        optional: true,
        seconds: 5,
        validate: (v) => validate(v, ["lgo"]),
        render: ({ values, choose }) => <ChoiceCards label="Logiciel de gestion" options={LGO_OPTIONS.map((o) => ({ value: o.id, label: o.label }))} value={values.lgo} onChoose={(v) => choose("lgo", v)} />,
        recap: { label: "Logiciel", value: (v) => LGO_OPTIONS.find((o) => o.id === v.lgo)?.label ?? null },
      },
    ];
  }, []);

  if (done) {
    return (
      <div className="mx-auto max-w-2xl rounded-[28px] border border-border-subtle bg-surface-card p-8 sm:p-12" role="status">
        <span className="flex size-14 items-center justify-center rounded-full bg-brand-600 text-white motion-safe:animate-slide-up" aria-hidden="true">
          <Check className="size-7" strokeWidth={3} />
        </span>
        <h1 className="mt-6 text-[30px] leading-[1.1] font-semibold tracking-[-0.03em] text-text-primary text-balance">Votre dossier est complet.</h1>
        <p className="mt-3 text-[15.5px] leading-7 text-text-secondary">Les informations de {done.pharmacyName} sont enregistrées. Votre contrat, prérempli, vous sera adressé par e-mail pour une signature en ligne.</p>
      </div>
    );
  }

  const until = new Date(expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

  return (
    <div>
      <div className="mb-7 max-w-2xl">
        <p className="font-mono text-[12px] tracking-[0.14em] text-brand-700 uppercase">Inscription</p>
        <h1 className="mt-2 text-[30px] leading-[1.08] font-semibold tracking-[-0.03em] text-text-primary text-balance md:text-[38px]">Configurer mon officine</h1>
        <p className="mt-3 text-[15.5px] leading-7 text-text-secondary">Une question à la fois, environ deux minutes. Ce qui est déjà connu est prérempli : vous vérifiez, vous complétez. Lien valable jusqu&apos;au {until}.</p>
      </div>
      <Flow<Values>
        name={`inscription-${token.slice(-12)}`}
        steps={steps}
        initialValues={initialValues}
        autoFocus
        recapTitle="Votre dossier est prêt."
        aside={(v) => <SignupAside values={v} until={until} />}
        final={() => <p className="rounded-2xl bg-surface-sunken px-4 py-3 text-[13.5px] leading-6 text-text-secondary">En enregistrant, vous confirmez l&apos;exactitude de ces informations. Elles servent à préparer votre contrat d&apos;abonnement ; aucune donnée de patient n&apos;est demandée.</p>}
        submitLabel="Enregistrer mon dossier"
        onSubmit={async (v) => {
          const result = await submitOnboardingAction(token, fieldsOf(v));
          if (!result.ok) return { ok: false, error: result.error, fieldErrors: result.fieldErrors };
          setDone({ pharmacyName: result.data.pharmacyName });
          return { ok: true };
        }}
      />
    </div>
  );
}

function SignupAside({ values, until }: { values: Values; until: string }) {
  const owner = [personName(values.ownerFirstName), personName(values.ownerLastName)].filter(Boolean).join(" ");
  const place = [values.addressLine1, [values.postalCode, values.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return (
    <LiveCard title="Votre officine" footer={`Ces informations préparent votre contrat. Lien personnel, valable jusqu'au ${until}.`}>
      <div className="divide-y divide-border-subtle/70">
        <LiveRow label="Pharmacie" value={values.name} />
        <LiveRow label="SIRET" value={values.siret.replace(/\D/g, "").length === 14 ? formatSiret(values.siret) : null} />
        <LiveRow label="Adresse" value={place} />
        <LiveRow label="Titulaire" value={owner} />
        <LiveRow label="Postes de comptoir" value={values.postCount} />
      </div>
    </LiveCard>
  );
}
