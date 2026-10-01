"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { markInvitationOpenedAction, submitOnboardingAction } from "@/server/actions/pharmacy-signup";
import { LGO_OPTIONS, ONBOARDING_STEPS, onboardingSchema, type OnboardingInput } from "@/core/onboarding/form";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

type Values = Record<keyof OnboardingInput, string>;

export function SignupForm({ token, prefill, expiresAt }: { token: string; prefill: Values; expiresAt: string }) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Values>(prefill);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ pharmacyName: string } | null>(null);
  const [pending, start] = useTransition();

  // Le navigateur du titulaire marque l'invitation « ouverte » (pas un antivirus de messagerie).
  useEffect(() => {
    void markInvitationOpenedAction(token);
  }, [token]);

  const set = (key: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const err = (key: keyof Values) => errors[key];

  /** Valide les champs de l'étape courante seulement. */
  const validateStep = (index: number) => {
    const parsed = onboardingSchema.safeParse(values);
    if (parsed.success) return {};
    const fields = ONBOARDING_STEPS[index].fields as readonly string[];
    const found: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (fields.includes(key)) found[key] ??= issue.message;
    }
    return found;
  };

  const next = () => {
    const found = validateStep(step);
    setErrors(found);
    if (Object.keys(found).length === 0) setStep((s) => s + 1);
  };

  const submit = () => {
    const found = validateStep(step);
    setErrors(found);
    if (Object.keys(found).length) return;
    setError(null);
    start(async () => {
      const result = await submitOnboardingAction(token, values);
      if (!result.ok) {
        setError(result.error);
        const fe = result.fieldErrors ?? {};
        setErrors(fe);
        const first = ONBOARDING_STEPS.findIndex((s) => (s.fields as readonly string[]).some((f) => fe[f]));
        if (first >= 0) setStep(first);
        return;
      }
      setDone({ pharmacyName: result.data.pharmacyName });
    });
  };

  if (done) {
    return (
      <div className="rounded-[28px] border border-border-subtle bg-surface-card p-8 text-center sm:p-12">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-brand-600 text-white"><Check className="size-6" strokeWidth={3} /></span>
        <h1 className="mt-5 text-[28px] leading-[1.1] font-semibold tracking-[-0.02em] text-text-primary">Votre dossier est complet.</h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-6 text-text-secondary">Les informations de {done.pharmacyName} sont enregistrées. Votre contrat, prérempli, vous sera adressé par e-mail pour une signature en ligne.</p>
      </div>
    );
  }

  const until = new Date(expiresAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" });

  return (
    <div>
      <p className="font-mono text-[12px] tracking-[0.14em] text-brand-700 uppercase">Inscription</p>
      <h1 className="mt-3 text-[30px] leading-[1.08] font-semibold tracking-[-0.03em] text-text-primary md:text-[38px]">Configurer mon officine</h1>
      <p className="mt-3 text-[15px] text-text-secondary">Trois étapes courtes. Les champs marqués d&apos;un astérisque sont nécessaires au contrat.</p>

      <ol className="mt-8 grid grid-cols-3 gap-2" aria-label="Étapes">
        {ONBOARDING_STEPS.map((s, i) => (
          <li key={s.key} className={cn("rounded-xl border px-3 py-2.5", i === step ? "border-brand-500 bg-brand-50" : i < step ? "border-border-subtle bg-surface-card" : "border-border-subtle")}>
            <span className="flex items-center gap-2 font-mono text-[11px] tracking-[0.12em] text-text-tertiary uppercase">
              {i < step ? <Check className="size-3.5 text-brand-600" strokeWidth={3} /> : <span>0{i + 1}</span>}
            </span>
            <span className={cn("mt-0.5 block text-[13.5px] font-semibold", i === step ? "text-brand-800" : "text-text-primary")}>{s.title}</span>
          </li>
        ))}
      </ol>

      <div className="mt-6 rounded-[28px] border border-border-subtle bg-surface-card p-6 sm:p-8">
        {error && <div className="mb-5"><Alert tone="danger">{error}</Alert></div>}

        {step === 0 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom de la pharmacie" htmlFor="name" required error={err("name")}><Input id="name" value={values.name} onChange={set("name")} placeholder="Pharmacie Centrale" autoComplete="organization" /></Field>
              <Field label="Raison sociale" htmlFor="legalName" required error={err("legalName")} hint="Ex. SELARL Pharmacie Centrale"><Input id="legalName" value={values.legalName} onChange={set("legalName")} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="SIRET" htmlFor="siret" required error={err("siret")}><Input id="siret" value={values.siret} onChange={set("siret")} inputMode="numeric" placeholder="14 chiffres" /></Field>
              <Field label="FINESS (facultatif)" htmlFor="finessNumber" error={err("finessNumber")}><Input id="finessNumber" value={values.finessNumber} onChange={set("finessNumber")} inputMode="numeric" placeholder="9 chiffres" /></Field>
            </div>
            <Field label="Adresse" htmlFor="addressLine1" required error={err("addressLine1")}><Input id="addressLine1" value={values.addressLine1} onChange={set("addressLine1")} autoComplete="street-address" /></Field>
            <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
              <Field label="Code postal" htmlFor="postalCode" required error={err("postalCode")}><Input id="postalCode" value={values.postalCode} onChange={set("postalCode")} inputMode="numeric" autoComplete="postal-code" /></Field>
              <Field label="Ville" htmlFor="city" required error={err("city")}><Input id="city" value={values.city} onChange={set("city")} autoComplete="address-level2" /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Téléphone (facultatif)" htmlFor="phone" error={err("phone")}><Input id="phone" type="tel" value={values.phone} onChange={set("phone")} autoComplete="tel" /></Field>
              <Field label="E-mail de contact (facultatif)" htmlFor="contactEmail" error={err("contactEmail")}><Input id="contactEmail" type="email" value={values.contactEmail} onChange={set("contactEmail")} placeholder="contact@pharmacie.fr" /></Field>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prénom" htmlFor="ownerFirstName" required error={err("ownerFirstName")}><Input id="ownerFirstName" value={values.ownerFirstName} onChange={set("ownerFirstName")} autoComplete="given-name" /></Field>
              <Field label="Nom" htmlFor="ownerLastName" required error={err("ownerLastName")}><Input id="ownerLastName" value={values.ownerLastName} onChange={set("ownerLastName")} autoComplete="family-name" /></Field>
            </div>
            <Field label="Fonction (facultatif)" htmlFor="ownerTitle" error={err("ownerTitle")} hint="Par défaut : pharmacien titulaire."><Input id="ownerTitle" value={values.ownerTitle} onChange={set("ownerTitle")} placeholder="Pharmacien titulaire" /></Field>
            <Field label="Votre e-mail" htmlFor="ownerEmail" required error={err("ownerEmail")} hint="Le contrat et votre accès PharmaBoost partiront à cette adresse."><Input id="ownerEmail" type="email" value={values.ownerEmail} onChange={set("ownerEmail")} autoComplete="email" /></Field>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <Field label="Nombre de postes de comptoir" htmlFor="postCount" required error={err("postCount")} hint="Les postes où PharmaBoost sera installé.">
              <Input id="postCount" type="number" min={1} max={99} inputMode="numeric" value={values.postCount} onChange={set("postCount")} className="w-28" />
            </Field>
            <Field label="Logiciel de gestion (facultatif)" htmlFor="lgo" error={err("lgo")}>
              <Select id="lgo" value={values.lgo} onChange={set("lgo")}>
                <option value="">Je ne sais pas</option>
                {LGO_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </Select>
            </Field>
            <p className="rounded-xl bg-surface-sunken px-4 py-3 text-[13px] leading-5 text-text-secondary">En enregistrant, vous confirmez l&apos;exactitude de ces informations. Elles servent à préparer votre contrat d&apos;abonnement ; aucune donnée de patient n&apos;est demandée.</p>
          </div>
        )}

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          {step > 0 ? (
            <Button variant="ghost" onClick={() => { setErrors({}); setStep((s) => s - 1); }} leadingIcon={<ArrowLeft className="size-4" />}>Retour</Button>
          ) : (
            <span className="text-[12.5px] text-text-tertiary">Lien valable jusqu&apos;au {until}.</span>
          )}
          {step < ONBOARDING_STEPS.length - 1 ? (
            <Button onClick={next}>Continuer <ArrowRight className="size-4" /></Button>
          ) : (
            <Button onClick={submit} loading={pending}>Enregistrer mon dossier</Button>
          )}
        </div>
      </div>
    </div>
  );
}
