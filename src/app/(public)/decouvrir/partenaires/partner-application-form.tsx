"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { submitPartnerApplicationAction } from "@/server/actions/partner-applications";
import { UNIVERSES } from "@/config/universes";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";

type ApiAnswer = "YES" | "NO" | "UNKNOWN";

const API_OPTIONS: { value: ApiAnswer; label: string }[] = [
  { value: "YES", label: "Oui" },
  { value: "NO", label: "Non" },
  { value: "UNKNOWN", label: "Je ne sais pas" },
];

const YES_NO: { value: "yes" | "no"; label: string }[] = [
  { value: "yes", label: "Oui" },
  { value: "no", label: "Non" },
];

const LEGEND = "text-[13px] font-semibold tracking-[0.08em] text-brand-700 uppercase";

/**
 * La candidature d'un laboratoire ou d'une marque. Les coordonnées d'une
 * société, rien d'autre : aucune donnée de santé. Le consentement est
 * obligatoire, et l'envoi n'active rien : l'équipe étudie la candidature.
 */
export function PartnerApplicationForm() {
  const [form, setForm] = useState({
    company: "",
    brand: "",
    websiteUrl: "",
    distribution: "",
    contactFirstName: "",
    contactLastName: "",
    contactRole: "",
    email: "",
    phone: "",
    approxReferences: "",
    message: "",
    website: "",
  });
  const [universes, setUniverses] = useState<string[]>([]);
  const [hasApi, setHasApi] = useState<ApiAnswer | null>(null);
  const [tools, setTools] = useState<{ hasB2bPortal: boolean | null; hasCatalog: boolean | null; hasTrainings: boolean | null }>({ hasB2bPortal: null, hasCatalog: null, hasTrainings: null });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<{ acknowledged: boolean; email: string } | null>(null);
  const [pending, start] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  const err = (key: string) => fieldErrors[key];
  const clear = (key: string) => setFieldErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const value = e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
    clear(key);
  };
  const toggleUniverse = (key: string) => setUniverses((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  /** Après une erreur, le curseur va au premier champ à corriger. */
  const focusFirstError = () => requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setError(null);

    const local: Record<string, string> = {};
    const refsText = form.approxReferences.replace(/[\s  .]/g, "");
    if (refsText && !/^\d+$/.test(refsText)) local.approxReferences = "Indiquez un nombre.";
    if (!consent) local.consent = "Cochez cette case pour envoyer votre candidature.";
    if (Object.keys(local).length > 0) {
      setFieldErrors(local);
      setError(local.consent ? "Votre accord est nécessaire pour que nous puissions étudier votre candidature." : "Certaines informations sont à corriger.");
      focusFirstError();
      return;
    }
    setFieldErrors({});

    start(async () => {
      const result = await submitPartnerApplicationAction({
        ...form,
        approxReferences: refsText ? Number(refsText) : null,
        universes,
        hasApi: hasApi ?? "UNKNOWN",
        ...tools,
        consent,
      });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        focusFirstError();
        return;
      }
      setDone({ acknowledged: result.data.acknowledged, email: form.email.trim() });
      requestAnimationFrame(() => doneRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    });
  };

  if (done) {
    return (
      <div ref={doneRef} className="py-6 text-center sm:py-10" role="status">
        <CheckCircle2 className="mx-auto size-12 text-success-600" aria-hidden="true" />
        <h3 className="mt-5 text-[28px] leading-[1.15] font-semibold tracking-[-0.02em] text-text-primary text-balance">Candidature reçue.</h3>
        <p className="mx-auto mt-4 max-w-md text-[16px] leading-7 text-text-secondary">
          {done.acknowledged ? (
            <>Un accusé de réception vous a été envoyé à <span className="font-medium text-text-primary">{done.email}</span>.</>
          ) : (
            <>Votre candidature est enregistrée ; notre équipe vous recontacte à <span className="font-medium text-text-primary">{done.email}</span>.</>
          )}{" "}
          Aucune activation n&apos;est automatique : notre équipe étudie chaque candidature.
        </p>
        <Link href="/decouvrir" className="mt-8 inline-flex h-11 items-center rounded-xl border border-border-default px-5 text-[14.5px] font-medium text-text-primary hover:bg-surface-sunken">
          Retour au site
        </Link>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-8" noValidate>
      <fieldset className="space-y-4">
        <legend className={LEGEND}>La société</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Société" htmlFor="pa-company" required error={err("company")}>
            <Input id="pa-company" value={form.company} onChange={set("company")} autoComplete="organization" aria-invalid={Boolean(err("company"))} />
          </Field>
          <Field label="Marque" htmlFor="pa-brand" required error={err("brand")}>
            <Input id="pa-brand" value={form.brand} onChange={set("brand")} autoComplete="off" aria-invalid={Boolean(err("brand"))} />
          </Field>
          <Field label="Site internet" htmlFor="pa-site" error={err("websiteUrl")}>
            <Input id="pa-site" value={form.websiteUrl} onChange={set("websiteUrl")} inputMode="url" placeholder="www.votre-marque.fr" autoComplete="url" aria-invalid={Boolean(err("websiteUrl"))} />
          </Field>
          <Field label="Réseau de distribution" htmlFor="pa-distribution" hint="Grossistes, vente directe, groupements…" error={err("distribution")}>
            <Input id="pa-distribution" value={form.distribution} onChange={set("distribution")} autoComplete="off" aria-invalid={Boolean(err("distribution"))} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className={LEGEND}>Le contact</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prénom" htmlFor="pa-first" required error={err("contactFirstName")}>
            <Input id="pa-first" value={form.contactFirstName} onChange={set("contactFirstName")} autoComplete="given-name" aria-invalid={Boolean(err("contactFirstName"))} />
          </Field>
          <Field label="Nom" htmlFor="pa-last" required error={err("contactLastName")}>
            <Input id="pa-last" value={form.contactLastName} onChange={set("contactLastName")} autoComplete="family-name" aria-invalid={Boolean(err("contactLastName"))} />
          </Field>
          <Field label="Fonction" htmlFor="pa-role" error={err("contactRole")}>
            <Input id="pa-role" value={form.contactRole} onChange={set("contactRole")} autoComplete="organization-title" aria-invalid={Boolean(err("contactRole"))} />
          </Field>
          <Field label="E-mail professionnel" htmlFor="pa-email" required error={err("email")} hint="L'accusé de réception y est envoyé.">
            <Input id="pa-email" type="email" value={form.email} onChange={set("email")} autoComplete="email" aria-invalid={Boolean(err("email"))} />
          </Field>
          <Field label="Téléphone" htmlFor="pa-phone" error={err("phone")}>
            <Input id="pa-phone" type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" aria-invalid={Boolean(err("phone"))} />
          </Field>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className={LEGEND}>Vos gammes</legend>
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-text-primary" id="pa-universes">Univers</p>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3" role="group" aria-labelledby="pa-universes">
            {UNIVERSES.map((u) => (
              <label
                key={u.key}
                className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border-subtle bg-surface-card px-3 py-2.5 text-[13.5px] leading-5 font-medium text-text-primary transition-colors hover:border-brand-300 has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50/70"
              >
                <input type="checkbox" checked={universes.includes(u.key)} onChange={() => toggleUniverse(u.key)} className="mt-0.5 size-4 shrink-0 accent-brand-700" />
                {u.label}
              </label>
            ))}
          </div>
          <p className="text-[12.5px] text-text-tertiary">Un autre univers ? Précisez-le dans votre message.</p>
        </div>
        <Field label="Nombre approximatif de références" htmlFor="pa-refs" error={err("approxReferences")}>
          <Input id="pa-refs" inputMode="numeric" value={form.approxReferences} onChange={set("approxReferences")} className="w-32" autoComplete="off" aria-invalid={Boolean(err("approxReferences"))} />
        </Field>
      </fieldset>

      <fieldset className="space-y-1">
        <legend className={LEGEND}>Vos outils</legend>
        <p className="pt-3 text-[13px] text-text-tertiary">Pour savoir comment nous pourrions travailler ensemble. Rien n&apos;est requis à ce stade.</p>
        <div className="divide-y divide-border-subtle">
          <Choice id="pa-api" label="API disponible" options={API_OPTIONS} value={hasApi} onChange={setHasApi} />
          <Choice id="pa-b2b" label="Portail B2B" options={YES_NO} value={toChoice(tools.hasB2bPortal)} onChange={(v) => setTools((t) => ({ ...t, hasB2bPortal: v === "yes" }))} />
          <Choice id="pa-catalog" label="Catalogue disponible" options={YES_NO} value={toChoice(tools.hasCatalog)} onChange={(v) => setTools((t) => ({ ...t, hasCatalog: v === "yes" }))} />
          <Choice id="pa-trainings" label="Formations disponibles" options={YES_NO} value={toChoice(tools.hasTrainings)} onChange={(v) => setTools((t) => ({ ...t, hasTrainings: v === "yes" }))} />
        </div>
      </fieldset>

      <Field label="Message" htmlFor="pa-message" error={err("message")} hint="Vos gammes, ce que vous attendez d'un partenariat, un autre univers…">
        <Textarea id="pa-message" value={form.message} onChange={set("message")} rows={4} aria-invalid={Boolean(err("message"))} />
      </Field>

      {/* Pot de miel, invisible pour une personne. */}
      <div className="absolute -left-[9999px] top-auto" aria-hidden="true">
        <label htmlFor="pa-website">Site web</label>
        <input id="pa-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} />
      </div>

      <div className="space-y-1.5">
        <label className={cn("flex items-start gap-3 rounded-xl border bg-surface-sunken/60 p-4 text-[14px] leading-6 text-text-primary", err("consent") ? "border-danger-500" : "border-border-subtle")}>
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => {
              setConsent(e.target.checked);
              clear("consent");
            }}
            className="mt-1 size-4 shrink-0 accent-brand-700"
            aria-invalid={Boolean(err("consent"))}
            aria-describedby={err("consent") ? "pa-consent-error" : undefined}
          />
          <span>
            J&apos;accepte que PharmaBoost utilise ces informations uniquement pour étudier ma candidature et me recontacter. Elles ne sont pas utilisées à d&apos;autres fins. <Consent>En savoir plus</Consent>
            <span className="text-danger-600" aria-hidden="true"> *</span>
          </span>
        </label>
        {err("consent") && (
          <p id="pa-consent-error" className="text-[12.5px] text-danger-600" role="alert">
            {err("consent")}
          </p>
        )}
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" loading={pending}>
          {pending ? "Envoi en cours…" : "Envoyer ma candidature"}
        </Button>
        <p className="text-[12.5px] text-text-tertiary">Aucune activation automatique : notre équipe étudie chaque candidature.</p>
      </div>
    </form>
  );
}

function toChoice(value: boolean | null): "yes" | "no" | null {
  if (value === null) return null;
  return value ? "yes" : "no";
}

function Consent({ children }: { children: ReactNode }) {
  return (
    <Link href="/decouvrir/confidentialite" target="_blank" rel="noopener" className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800">
      {children}
    </Link>
  );
}

/** Une question fermée : des pastilles à choix unique, lisibles au doigt comme à la souris. */
function Choice<T extends string>({ id, label, options, value, onChange }: { id: string; label: string; options: { value: T; label: string }[]; value: T | null; onChange: (value: T) => void }) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4" role="radiogroup" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="text-[14px] font-medium text-text-primary">
        {label}
      </span>
      <div className="inline-flex w-fit shrink-0 rounded-full border border-border-default bg-surface-card p-0.5">
        {options.map((option) => (
          <label
            key={option.value}
            className="cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-medium whitespace-nowrap text-text-secondary transition-colors hover:text-text-primary has-[:checked]:bg-brand-600 has-[:checked]:text-white has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500/40"
          >
            <input type="radio" name={id} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="sr-only" />
            {option.label}
          </label>
        ))}
      </div>
    </div>
  );
}
