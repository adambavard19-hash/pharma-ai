"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { submitRecommendationAction } from "@/server/actions/site-leads";
import { recommendationSchema, type RecommendationPayload } from "@/core/site/recommendation-form";
import { cn } from "@/lib/utils";

const EMPTY: Required<RecommendationPayload> = { referrerName: "", referrerEmail: "", referrerPhone: "", pharmacyName: "", city: "", contactName: "", contactPhone: "", message: "", website: "" };

/**
 * « Recommander une pharmacie » (fondateur, 20 oct. 2026) : l'apporteur écrit la pharmacie qu'il connaît et ses propres
 * coordonnées, pour qu'on lui verse sa prime si elle signe. Une seule page, les règles de `recommendationSchema`, le
 * serveur reste seul juge. Après l'envoi, il peut en recommander une autre sans retaper ses coordonnées.
 */
export function RecommendationForm({ bonus }: { bonus: string }) {
  const [values, setValues] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = (key: keyof RecommendationPayload) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = recommendationSchema.safeParse(values);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Vérifiez le formulaire.");
    setError(null);
    setPending(true);
    const result = await submitRecommendationAction(values).catch(() => null);
    setPending(false);
    if (!result?.ok) return setError(result && !result.ok ? result.error : "L'envoi n'a pas abouti. Réessayez dans un instant.");
    setSent(values.pharmacyName.trim());
    // Ses coordonnées restent : il peut enchaîner une autre pharmacie.
    setValues((v) => ({ ...EMPTY, referrerName: v.referrerName, referrerEmail: v.referrerEmail, referrerPhone: v.referrerPhone }));
  }

  if (sent) {
    return (
      <div className="rounded-[24px] border border-border-subtle bg-surface-app p-7 text-center sm:p-10" role="status">
        <CheckCircle2 className="mx-auto size-10 text-brand-600" aria-hidden="true" />
        <p className="mt-4 text-[20px] font-semibold text-text-primary">Merci, {sent} est bien reçue.</p>
        <p className="mx-auto mt-2 max-w-md text-[15px] leading-6 text-text-secondary">
          Notre équipe la contacte et lui présente PharmaBoost. Si elle signe, vos {bonus} vous sont versés dès que sa mise en service est réglée. Un e-mail de confirmation vient de vous être envoyé.
        </p>
        <button type="button" onClick={() => setSent(null)} className="mt-6 inline-flex h-11 items-center justify-center rounded-full border border-border-default px-6 text-[14.5px] font-semibold text-text-primary hover:border-brand-400">
          Recommander une autre pharmacie
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="rounded-[24px] border border-border-subtle bg-surface-app p-6 sm:p-8" data-recommandation="">
      <fieldset>
        <legend className="text-[15px] font-semibold text-text-primary">La pharmacie que vous connaissez</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Nom de la pharmacie" value={values.pharmacyName} onChange={set("pharmacyName")} required autoComplete="off" />
          <Field label="Ville" value={values.city} onChange={set("city")} required autoComplete="off" />
          <Field label="Titulaire ou contact (facultatif)" value={values.contactName} onChange={set("contactName")} autoComplete="off" />
          <Field label="Téléphone de la pharmacie (facultatif)" value={values.contactPhone} onChange={set("contactPhone")} type="tel" autoComplete="off" />
        </div>
        <label className="mt-3 block">
          <span className="text-[13px] font-medium text-text-secondary">Un mot pour nous (facultatif)</span>
          <textarea value={values.message} onChange={(e) => set("message")(e.target.value)} rows={3} maxLength={1000} className={cn(INPUT, "h-auto py-2.5")} placeholder="Par exemple : le titulaire est intéressé, à appeler le matin." />
        </label>
      </fieldset>

      <fieldset className="mt-6">
        <legend className="text-[15px] font-semibold text-text-primary">Vous, pour recevoir votre prime</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Votre nom" value={values.referrerName} onChange={set("referrerName")} required autoComplete="name" />
          <Field label="Votre e-mail" value={values.referrerEmail} onChange={set("referrerEmail")} required type="email" autoComplete="email" />
          <Field label="Votre téléphone" value={values.referrerPhone} onChange={set("referrerPhone")} required type="tel" autoComplete="tel" />
        </div>
      </fieldset>

      {/* Pot de miel : invisible pour un humain. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={(e) => set("website")(e.target.value)} className="hidden" aria-hidden="true" />

      {error && <p className="mt-4 text-[14px] font-medium text-red-700" role="alert">{error}</p>}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] leading-5 text-text-tertiary">Si elle signe, {bonus} HT pour vous, dès que sa mise en service est réglée.</p>
        <button type="submit" disabled={pending} className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-brand-600 px-7 text-[15px] font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
          {pending ? "Envoi…" : "Envoyer la pharmacie"} <Send className="size-4" aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}

const INPUT = "mt-1 block h-11 w-full rounded-xl border border-border-default bg-surface-card px-3.5 text-[15px] text-text-primary outline-none placeholder:text-text-tertiary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

function Field({ label, value, onChange, required = false, type = "text", autoComplete }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; autoComplete?: string }) {
  return (
    <label className="block min-w-0">
      <span className="text-[13px] font-medium text-text-secondary">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} autoComplete={autoComplete} className={INPUT} />
    </label>
  );
}
