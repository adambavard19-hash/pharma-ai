"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitSubscriptionRequestAction } from "@/server/actions/site-leads";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";

const TITLES = ["Pharmacien titulaire", "Pharmacienne titulaire", "Gérant", "Gérante", "Président", "Présidente", "Co-titulaire"];

/**
 * La souscription en une fois : l'officine, son représentant, l'offre. Les
 * informations saisies ici deviennent celles du dossier, du contrat et de
 * l'espace PharmaBoost ; rien ne sera redemandé. Aucune donnée patient.
 */
export function SubscriptionForm({ planId, offerLabel, referralCode = "" }: { planId: string | null; offerLabel: string; referralCode?: string }) {
  const [form, setForm] = useState({
    pharmacyName: "",
    legalName: "",
    siret: "",
    finessNumber: "",
    addressLine1: "",
    postalCode: "",
    city: "",
    phone: "",
    ownerFirstName: "",
    ownerLastName: "",
    ownerTitle: "Pharmacien titulaire",
    ownerEmail: "",
    outletCount: "1",
    referralCode,
    website: "",
  });
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const err = (key: string) => fieldErrors[key];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(null);
    setFieldErrors({});
    start(async () => {
      const outlets = Number(form.outletCount);
      const result = await submitSubscriptionRequestAction({
        ...form,
        outletCount: Number.isFinite(outlets) && outlets > 0 ? Math.round(outlets) : null,
        planId: planId ?? "",
        confirm: confirm as true,
      });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      router.push(`/decouvrir/merci?type=abonnement&etat=${result.data.outcome.toLowerCase()}`);
    });
  };

  return (
    <form onSubmit={submit} className="space-y-7" noValidate>
      {error && <Alert tone="danger">{error}</Alert>}

      <fieldset className="space-y-4">
        <legend className="text-[13px] font-semibold tracking-[0.08em] text-brand-700 uppercase">L&apos;officine</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom de la pharmacie" htmlFor="sub-name" required error={err("pharmacyName")}>
            <Input id="sub-name" value={form.pharmacyName} onChange={set("pharmacyName")} placeholder="Pharmacie du Centre" autoComplete="organization" />
          </Field>
          <Field label="Raison sociale" htmlFor="sub-legal" required error={err("legalName")} hint="Telle qu'inscrite au registre (SELARL…).">
            <Input id="sub-legal" value={form.legalName} onChange={set("legalName")} placeholder="SELARL Pharmacie du Centre" />
          </Field>
          <Field label="SIRET" htmlFor="sub-siret" required error={err("siret")} hint="14 chiffres.">
            <Input id="sub-siret" value={form.siret} onChange={set("siret")} inputMode="numeric" placeholder="123 456 789 00012" autoComplete="off" />
          </Field>
          <Field label="N° FINESS" htmlFor="sub-finess" error={err("finessNumber")} hint="Facultatif.">
            <Input id="sub-finess" value={form.finessNumber} onChange={set("finessNumber")} inputMode="numeric" autoComplete="off" />
          </Field>
          <Field label="Adresse" htmlFor="sub-address" required error={err("addressLine1")} className="sm:col-span-2">
            <Input id="sub-address" value={form.addressLine1} onChange={set("addressLine1")} autoComplete="street-address" />
          </Field>
          <Field label="Code postal" htmlFor="sub-postal" required error={err("postalCode")}>
            <Input id="sub-postal" value={form.postalCode} onChange={set("postalCode")} inputMode="numeric" autoComplete="postal-code" />
          </Field>
          <Field label="Ville" htmlFor="sub-city" required error={err("city")}>
            <Input id="sub-city" value={form.city} onChange={set("city")} autoComplete="address-level2" />
          </Field>
          <Field label="Téléphone de l'officine" htmlFor="sub-phone" error={err("phone")}>
            <Input id="sub-phone" type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" />
          </Field>
          <Field label="Points de vente" htmlFor="sub-outlets">
            <Input id="sub-outlets" inputMode="numeric" value={form.outletCount} onChange={set("outletCount")} className="w-24" />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-[13px] font-semibold tracking-[0.08em] text-brand-700 uppercase">Le signataire</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prénom" htmlFor="sub-first" required error={err("ownerFirstName")}>
            <Input id="sub-first" value={form.ownerFirstName} onChange={set("ownerFirstName")} autoComplete="given-name" />
          </Field>
          <Field label="Nom" htmlFor="sub-last" required error={err("ownerLastName")}>
            <Input id="sub-last" value={form.ownerLastName} onChange={set("ownerLastName")} autoComplete="family-name" />
          </Field>
          <Field label="Qualité" htmlFor="sub-title" required error={err("ownerTitle")}>
            <Input id="sub-title" list="sub-titles" value={form.ownerTitle} onChange={set("ownerTitle")} />
            <datalist id="sub-titles">{TITLES.map((t) => <option key={t} value={t} />)}</datalist>
          </Field>
          <Field label="E-mail professionnel" htmlFor="sub-email" required error={err("ownerEmail")} hint="Le contrat à signer y est envoyé.">
            <Input id="sub-email" type="email" value={form.ownerEmail} onChange={set("ownerEmail")} autoComplete="email" />
          </Field>
          <Field label="Code de parrainage" htmlFor="sub-referral" hint="Si une officine vous a recommandé PharmaBoost.">
            <Input id="sub-referral" value={form.referralCode} onChange={set("referralCode")} placeholder="PB-XXXXXX" className="uppercase" autoComplete="off" />
          </Field>
        </div>
      </fieldset>

      {/* Pot de miel, invisible pour une personne. */}
      <div className="absolute -left-[9999px] top-auto" aria-hidden="true">
        <label htmlFor="sub-website">Site web</label>
        <input id="sub-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface-sunken/60 p-4 text-[14px] leading-6 text-text-primary">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-1 size-4 accent-brand-700" />
        <span>Je demande la souscription à l&apos;offre <strong>{offerLabel}</strong> pour cette officine et je souhaite recevoir le contrat d&apos;abonnement à signer électroniquement.</span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" loading={pending} disabled={!confirm}>Recevoir mon contrat à signer</Button>
        <p className="text-[12.5px] text-text-tertiary">Une confirmation de votre adresse, puis le contrat arrive aussitôt. Rien n&apos;est prélevé à cette étape.</p>
      </div>
    </form>
  );
}
