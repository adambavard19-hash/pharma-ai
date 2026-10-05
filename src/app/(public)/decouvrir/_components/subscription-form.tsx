"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { submitSubscriptionRequestAction } from "@/server/actions/site-leads";
import { normalizeSubscriptionRequest } from "@/core/contracts/subscription-request";
import { formatSiret, normalizeEmail, normalizePhone, personName } from "@/core/contracts/identity";
import { normalizeReferralCode } from "@/core/billing/referral";
import { Flow, type FlowErrors, type FlowStep } from "@/components/flow/flow";
import { ChoiceCards, CountAnswer, LiveCard, LiveRow, TextAnswer } from "@/components/flow/controls";
import { EmailAnswer } from "@/components/flow/email-answer";
import { officineSteps } from "@/components/flow/officine-steps";
import type { Prefill } from "@/components/flow/registry-answers";
import { cn } from "@/lib/utils";

const TITLES = ["Pharmacien titulaire", "Pharmacienne titulaire", "Co-titulaire", "Gérant", "Gérante", "Président", "Présidente"];

type Values = {
  siret: string;
  pharmacyName: string;
  legalName: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  finessNumber: string;
  phone: string;
  outletCount: string;
  ownerFirstName: string;
  ownerLastName: string;
  ownerTitle: string;
  titleOther: boolean;
  ownerEmail: string;
  hasReferral: "" | "yes" | "no";
  referralCode: string;
  /** Le confrère que l'officine parraine : facultatif. */
  hasReferee: "" | "yes" | "no";
  refereeName: string;
  refereeEmail: string;
  refereePhone: string;
  confirm: boolean;
  website: string;
  prefill: Prefill;
};

export type PublicOffer = { name: string; price: string; perks: string[] };

/** Ce que change le parrainage sur la facture mensuelle, déjà chiffré par la page. */
export type ReferralTerms = { percent: number; fullPrice: string; reducedPrice: string };

function toRequest(v: Values) {
  const outlets = Number(v.outletCount);
  return {
    pharmacyName: v.pharmacyName,
    legalName: v.legalName,
    siret: v.siret,
    finessNumber: v.finessNumber,
    addressLine1: v.addressLine1,
    postalCode: v.postalCode,
    city: v.city,
    phone: v.phone,
    ownerFirstName: v.ownerFirstName,
    ownerLastName: v.ownerLastName,
    ownerTitle: v.ownerTitle,
    ownerEmail: v.ownerEmail,
    outletCount: Number.isFinite(outlets) && outlets > 0 ? Math.round(outlets) : null,
    referralCode: v.hasReferral === "no" ? "" : v.referralCode,
    referee: v.hasReferee === "yes" ? { name: v.refereeName.trim() || null, email: v.refereeEmail.trim(), phone: v.refereePhone.trim() } : null,
  };
}

/** Les règles du serveur (normalizeSubscriptionRequest), appliquées aux seuls champs de la question. */
function validate(v: Values, fields: string[]): FlowErrors {
  const checked = normalizeSubscriptionRequest(toRequest(v));
  const errors: FlowErrors = {};
  if (!checked.ok) for (const field of fields) if (checked.errors[field]) errors[field] = checked.errors[field];
  if (fields.includes("finessNumber") && v.finessNumber && !/^\d{9}$/.test(v.finessNumber)) errors.finessNumber = "Le FINESS compte 9 chiffres, ou laissez vide.";
  return errors;
}

/**
 * La souscription en une question à la fois : l'officine (retrouvée par son
 * SIRET), son signataire, l'offre. Les informations deviennent celles du
 * dossier, du contrat et de l'espace PharmaBoost ; rien ne sera redemandé.
 * Aucune donnée patient.
 */
export function SubscriptionForm({ planId, offer, offerLabel, referral, referralCode = "" }: { planId: string | null; offer: PublicOffer; offerLabel: string; referral: ReferralTerms; referralCode?: string }) {
  const router = useRouter();
  const initialValues = useMemo<Values>(
    () => ({
      siret: "",
      pharmacyName: "",
      legalName: "",
      addressLine1: "",
      postalCode: "",
      city: "",
      finessNumber: "",
      phone: "",
      outletCount: "1",
      ownerFirstName: "",
      ownerLastName: "",
      ownerTitle: "",
      titleOther: false,
      ownerEmail: "",
      hasReferral: referralCode ? "yes" : "",
      referralCode,
      hasReferee: "",
      refereeName: "",
      refereeEmail: "",
      refereePhone: "",
      confirm: false,
      website: "",
      prefill: {},
    }),
    [referralCode],
  );

  const steps = useMemo<FlowStep<Values>[]>(() => {
    const first = (v: Values) => personName(v.ownerFirstName) ?? "";
    return [
      ...officineSteps<Values>({ keys: { siret: "siret", name: "pharmacyName", legalName: "legalName", addressLine1: "addressLine1", postalCode: "postalCode", city: "city", finessNumber: "finessNumber", phone: "phone" }, validate }),
      {
        id: "points-de-vente",
        section: "L'officine",
        question: "Combien de points de vente ?",
        help: "Le contrat couvre ce nombre de points de vente, avec tous leurs postes de comptoir.",
        fields: ["outletCount"],
        seconds: 5,
        validate: (v) => {
          const n = Number(v.outletCount);
          return Number.isInteger(n) && n >= 1 && n <= 50 ? {} : { outletCount: "Indiquez un nombre entre 1 et 50." };
        },
        render: ({ values, errors, set, choose }) => <CountAnswer label="Points de vente" value={values.outletCount} onValueChange={(v) => set("outletCount", v)} onChoose={(v) => choose("outletCount", v)} quick={[1, 2, 3]} max={50} error={errors.outletCount} />,
        recap: { label: "Points de vente", value: (v) => v.outletCount || null },
      },
      {
        id: "signataire",
        section: "Le signataire",
        question: "Qui signera le contrat ?",
        help: "Le ou la titulaire, ou la personne habilitée à engager l'officine.",
        fields: ["ownerFirstName", "ownerLastName"],
        seconds: 10,
        validate: (v) => validate(v, ["ownerFirstName", "ownerLastName"]),
        render: ({ values, errors, set }) => (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextAnswer label="Prénom" value={values.ownerFirstName} onValueChange={(v) => set("ownerFirstName", v)} error={errors.ownerFirstName} autoComplete="given-name" />
            <TextAnswer label="Nom" value={values.ownerLastName} onValueChange={(v) => set("ownerLastName", v)} error={errors.ownerLastName} autoComplete="family-name" />
          </div>
        ),
        recap: { label: "Signataire", value: (v) => [personName(v.ownerFirstName), personName(v.ownerLastName)].filter(Boolean).join(" ") || null },
      },
      {
        id: "qualite",
        section: "Le signataire",
        question: (v) => (first(v) ? `En quelle qualité, ${first(v)} ?` : "En quelle qualité signez-vous ?"),
        help: "Elle figure au contrat, à côté de votre nom.",
        fields: ["ownerTitle"],
        seconds: 5,
        validate: (v) => validate(v, ["ownerTitle"]),
        render: ({ values, errors, set, patch, choose }) => (
          <div className="space-y-4">
            <ChoiceCards
              label="Qualité du signataire"
              options={[...TITLES.map((t) => ({ value: t, label: t })), { value: "__autre", label: "Autre qualité" }]}
              value={values.titleOther ? "__autre" : values.ownerTitle}
              onChoose={(value) => {
                if (value === "__autre") patch({ titleOther: true, ownerTitle: TITLES.includes(values.ownerTitle) ? "" : values.ownerTitle });
                else {
                  patch({ titleOther: false });
                  choose("ownerTitle", value);
                }
              }}
              error={values.titleOther ? undefined : errors.ownerTitle}
            />
            {values.titleOther && <TextAnswer label="Votre qualité" value={values.ownerTitle} onValueChange={(v) => set("ownerTitle", v)} error={errors.ownerTitle} placeholder="Directeur général délégué" autofocus />}
          </div>
        ),
        recap: { label: "Qualité", value: (v) => v.ownerTitle || null },
      },
      {
        id: "email",
        section: "Le signataire",
        question: (v) => (first(v) ? `À quelle adresse envoyer le contrat, ${first(v)} ?` : "À quelle adresse envoyer le contrat ?"),
        help: "Vous y recevrez d'abord un lien pour confirmer votre adresse, puis le contrat prérempli à signer.",
        fields: ["ownerEmail"],
        seconds: 10,
        validate: (v) => validate(v, ["ownerEmail"]),
        render: ({ values, errors, set }) => <EmailAnswer value={values.ownerEmail} onValueChange={(v) => set("ownerEmail", v)} error={errors.ownerEmail} placeholder="vous@pharmacie.fr" />,
        recap: { label: "E-mail", value: (v) => v.ownerEmail.trim() || null },
      },
      {
        id: "parrainage",
        section: "Pour finir",
        question: "Une officine vous a recommandé PharmaBoost ?",
        help: "Son code de parrainage réduit son abonnement : elle vous en remerciera.",
        fields: ["referralCode"],
        optional: true,
        isEmpty: (v) => v.hasReferral === "",
        when: () => !referralCode,
        seconds: 6,
        validate: (v) => {
          if (v.hasReferral !== "yes") return {};
          if (!v.referralCode.trim()) return { referralCode: "Indiquez le code, ou répondez « Non »." };
          return normalizeReferralCode(v.referralCode) ? {} : { referralCode: "Un code de parrainage s'écrit PB- suivi de 6 caractères." };
        },
        render: ({ values, errors, set, choose }) => (
          <div className="space-y-4">
            <ChoiceCards
              label="Recommandation"
              options={[
                { value: "yes", label: "Oui, j'ai un code" },
                { value: "no", label: "Non" },
              ]}
              value={values.hasReferral}
              onChoose={(value) => (value === "no" ? choose("hasReferral", value) : set("hasReferral", value))}
            />
            {values.hasReferral === "yes" && <TextAnswer label="Code de parrainage" value={values.referralCode} onValueChange={(v) => set("referralCode", v.toUpperCase())} error={errors.referralCode} placeholder="PB-XXXXXX" autoComplete="off" className="max-w-xs" autofocus style={{ letterSpacing: "0.06em" }} />}
          </div>
        ),
        recap: { label: "Parrainage", value: (v) => (v.hasReferral === "yes" && v.referralCode ? v.referralCode : null) },
      },
      {
        id: "parrainer",
        section: "Pour finir",
        question: "Parrainez-vous un confrère ?",
        help: `Si la personne que vous parrainez s'abonne, vous ne payez plus ${referral.fullPrice} mais ${referral.reducedPrice} HT par mois (${referral.percent} % de moins). Nous la contactons : rien ne lui est envoyé sans nous.`,
        fields: ["refereeEmail", "refereePhone"],
        optional: true,
        isEmpty: (v) => v.hasReferee === "",
        seconds: 15,
        validate: (v) => {
          if (v.hasReferee !== "yes") return {};
          const errors: FlowErrors = {};
          const email = normalizeEmail(v.refereeEmail);
          if (!email) errors.refereeEmail = "Indiquez l'adresse e-mail de la personne.";
          else if (email === normalizeEmail(v.ownerEmail)) errors.refereeEmail = "Indiquez l'adresse d'un confrère, pas la vôtre.";
          if (!v.refereePhone.trim() || !normalizePhone(v.refereePhone)) errors.refereePhone = "Indiquez son numéro de téléphone.";
          return errors;
        },
        render: ({ values, errors, set, choose }) => (
          <div className="space-y-4">
            <ChoiceCards
              label="Parrainage d'un confrère"
              options={[
                { value: "yes", label: "Oui, j'indique un confrère" },
                { value: "no", label: "Non, pas maintenant" },
              ]}
              value={values.hasReferee}
              onChoose={(value) => (value === "no" ? choose("hasReferee", value) : set("hasReferee", value))}
            />
            {values.hasReferee === "yes" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <TextAnswer label="Prénom et nom (facultatif)" value={values.refereeName} onValueChange={(v) => set("refereeName", v)} autoComplete="off" className="sm:col-span-2" />
                <EmailAnswer value={values.refereeEmail} onValueChange={(v) => set("refereeEmail", v)} error={errors.refereeEmail} placeholder="confrere@pharmacie.fr" />
                <TextAnswer label="Téléphone" value={values.refereePhone} onValueChange={(v) => set("refereePhone", v)} error={errors.refereePhone} autoComplete="off" inputMode="tel" placeholder="06 12 34 56 78" />
              </div>
            )}
          </div>
        ),
        recap: { label: "Confrère parrainé", value: (v) => (v.hasReferee === "yes" ? [v.refereeName.trim(), v.refereeEmail.trim()].filter(Boolean).join(" · ") || null : null) },
      },
    ];
  }, [referralCode, referral]);

  return (
    <Flow<Values>
      name="abonnement"
      steps={steps}
      initialValues={initialValues}
      pinned={["referralCode", "hasReferral"]}
      ephemeral={["confirm"]}
      honeypot="website"
      autoFocus
      recapTitle="Votre dossier est prêt."
      aside={(v) => <SubscriptionAside offer={offer} values={v} referralCode={referralCode} />}
      final={({ values, set }) => (
        <label className={cn("flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-[14.5px] leading-6 text-text-primary transition-colors", values.confirm ? "border-brand-400 bg-brand-50/70 dark:bg-brand-950/30" : "border-border-default bg-surface-app hover:border-brand-300")}>
          <input type="checkbox" checked={values.confirm} onChange={(e) => set("confirm", e.target.checked)} className="mt-1 size-[18px] shrink-0 accent-brand-700" />
          <span>
            Je demande la souscription à l&apos;offre <strong>{offerLabel}</strong> pour cette officine et je souhaite recevoir le contrat d&apos;abonnement à signer électroniquement.
          </span>
        </label>
      )}
      canSubmit={(v) => v.confirm}
      submitLabel="Recevoir mon contrat à signer"
      submitHint="Notre équipe prépare votre contrat et vous l'envoie sous un jour ouvré. Rien n'est prélevé à cette étape."
      onSubmit={async (v) => {
        const result = await submitSubscriptionRequestAction({ ...toRequest(v), planId: planId ?? "", confirm: v.confirm as true, website: v.website });
        if (!result.ok) {
          // Les erreurs du confrère reviennent sous les champs de sa question.
          const fieldErrors = { ...(result.fieldErrors ?? {}) };
          if (fieldErrors["referee.email"]) fieldErrors.refereeEmail = fieldErrors["referee.email"];
          if (fieldErrors["referee.phone"]) fieldErrors.refereePhone = fieldErrors["referee.phone"];
          return { ok: false, error: result.error, fieldErrors };
        }
        router.push(`/decouvrir/merci?type=abonnement&etat=${result.data.outcome.toLowerCase()}`);
        return { ok: true };
      }}
    />
  );
}

function SubscriptionAside({ offer, values, referralCode }: { offer: PublicOffer; values: Values; referralCode: string }) {
  const signer = [personName(values.ownerFirstName), personName(values.ownerLastName)].filter(Boolean).join(" ");
  const place = [values.addressLine1, [values.postalCode, values.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return (
    <div className="space-y-4">
      <div className="rounded-[24px] border border-border-subtle bg-surface-card p-5">
        <p className="font-mono text-[11px] tracking-[0.14em] text-text-tertiary uppercase">{offer.name}</p>
        <p className="mt-2 text-[26px] leading-none font-semibold tracking-[-0.02em] text-text-primary tabular-nums">{offer.price}</p>
        <ul className="mt-3.5 space-y-1.5 text-[13px] text-text-primary">
          {offer.perks.map((perk) => (
            <li key={perk} className="flex items-start gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0 text-brand-600" strokeWidth={3} aria-hidden="true" /> {perk}
            </li>
          ))}
        </ul>
        {(referralCode || (values.hasReferral === "yes" && normalizeReferralCode(values.referralCode))) && (
          <p className="mt-3.5 rounded-xl bg-brand-50 px-3 py-2 text-[12.5px] text-brand-900 dark:bg-brand-950/40 dark:text-brand-100">
            Parrainage <strong className="tabular-nums">{normalizeReferralCode(values.referralCode) ?? referralCode}</strong> renseigné.
          </p>
        )}
      </div>
      <LiveCard title="Votre dossier" footer="Ces informations deviennent celles du contrat et de votre espace PharmaBoost. Votre saisie est gardée sur cet appareil jusqu'à l'envoi.">
        <div className="divide-y divide-border-subtle/70">
          <LiveRow label="Pharmacie" value={values.pharmacyName} />
          <LiveRow label="SIRET" value={values.siret.length === 14 ? formatSiret(values.siret) : null} />
          <LiveRow label="Adresse" value={place} />
          <LiveRow label="Signataire" value={signer ? `${signer}${values.ownerTitle ? `, ${values.ownerTitle.toLowerCase()}` : ""}` : null} />
          <LiveRow label="Contrat envoyé à" value={values.ownerEmail.trim()} />
        </div>
      </LiveCard>
    </div>
  );
}
