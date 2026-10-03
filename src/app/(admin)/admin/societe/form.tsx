"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, FileText } from "lucide-react";
import { saveCompanyProfileAdminAction } from "@/server/actions/admin-contracts";
import { missingCompanyFields } from "@/core/contracts/requirements";
import { companyPartyForPreview, partiesPreview } from "@/core/contracts/specimen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type CompanyValues = { legalName: string; legalForm: string; addressLine1: string; postalCode: string; city: string; siren: string; representativeName: string; representativeTitle: string; representativeEmail: string };
const EMPTY: CompanyValues = { legalName: "", legalForm: "", addressLine1: "", postalCode: "", city: "", siren: "", representativeName: "", representativeTitle: "", representativeEmail: "" };

/** Les exigences du contrat, dans l'ordre du formulaire (libellés de `missingCompanyFields`). */
const REQUIREMENTS = ["Dénomination de la société", "Adresse de la société", "SIREN de la société", "Représentant signataire", "E-mail du signataire société"] as const;

/** Contrôle immédiat, avant même l'envoi : 9 chiffres, espaces tolérés. */
function sirenHint(value: string): string | null {
  const digits = value.replace(/[\s.-]+/g, "");
  if (!digits) return null;
  if (!/^\d+$/.test(digits)) return "Le SIREN ne contient que des chiffres (9 au total).";
  if (digits.length !== 9) return `Le SIREN compte 9 chiffres ; vous en avez saisi ${digits.length}.`;
  return null;
}

/**
 * La fiche de la société exploitante, et son rendu dans les contrats en
 * direct : le paragraphe « Entre les soussignés » et les signatures sont
 * produits par le modèle de contrat lui-même, pas recopiés à la main.
 */
export function CompanyForm({ initial, aside }: { initial: CompanyValues | null; aside?: ReactNode }) {
  const [values, setValues] = useState<CompanyValues>(initial ?? EMPTY);
  const [saved, setSaved] = useState<CompanyValues | null>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sirenTouched, setSirenTouched] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const set = (key: keyof CompanyValues) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((current) => ({ ...current, [key]: e.target.value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: "" }));
  };
  const dirty = !saved || (Object.keys(values) as (keyof CompanyValues)[]).some((k) => values[k].trim() !== saved[k].trim());
  const missing = missingCompanyFields(values);
  const preview = useMemo(() => partiesPreview(companyPartyForPreview(values)), [values]);
  const localSiren = sirenTouched ? sirenHint(values.siren) : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSirenTouched(true);
    if (sirenHint(values.siren)) return setErrors((current) => ({ ...current, siren: sirenHint(values.siren) ?? "" }));
    startTransition(async () => {
      const result = await saveCompanyProfileAdminAction(values);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        return;
      }
      setErrors({});
      setSaved(values);
      push({ tone: "success", title: result.message ?? "Fiche enregistrée." });
      router.refresh();
    });
  };

  const error = (key: keyof CompanyValues) => errors[key] || null;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <form onSubmit={submit} noValidate className="min-w-0 space-y-5">
        {!initial && (
          <Alert tone="warning" title="Fiche non renseignée">
            Aucun contrat ne peut être généré tant que la société n&apos;est pas décrite ici.
          </Alert>
        )}
        {formError && <Alert tone="danger">{formError}</Alert>}

        <FormGroup title="Identité de la société" description="Telle qu'elle figure sur l'extrait Kbis.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Dénomination sociale" htmlFor="s-name" required error={error("legalName")} className="sm:col-span-2">
              <Input id="s-name" value={values.legalName} onChange={set("legalName")} placeholder="PharmaBoost SAS" autoComplete="organization" aria-invalid={Boolean(error("legalName"))} />
            </Field>
            <Field label="Forme juridique" htmlFor="s-form" hint="Facultatif. Exemple : SAS au capital de 10 000 €." error={error("legalForm")}>
              <Input id="s-form" value={values.legalForm} onChange={set("legalForm")} placeholder="SAS" />
            </Field>
            <Field label="SIREN" htmlFor="s-siren" required hint="9 chiffres, espaces acceptés." error={error("siren") || localSiren}>
              <Input id="s-siren" value={values.siren} onChange={set("siren")} onBlur={() => setSirenTouched(true)} inputMode="numeric" placeholder="123 456 789" aria-invalid={Boolean(error("siren") || localSiren)} />
            </Field>
          </div>
        </FormGroup>

        <FormGroup title="Siège social" description="L'adresse imprimée dans le paragraphe des parties.">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <Field label="Adresse" htmlFor="s-addr" required error={error("addressLine1")} className="sm:col-span-2">
              <Input id="s-addr" value={values.addressLine1} onChange={set("addressLine1")} placeholder="10 rue de la République" autoComplete="street-address" />
            </Field>
            <Field label="Code postal" htmlFor="s-cp" error={error("postalCode")}>
              <Input id="s-cp" value={values.postalCode} onChange={set("postalCode")} inputMode="numeric" placeholder="75011" autoComplete="postal-code" />
            </Field>
            <Field label="Ville" htmlFor="s-city" required error={error("city")}>
              <Input id="s-city" value={values.city} onChange={set("city")} placeholder="Paris" autoComplete="address-level2" />
            </Field>
          </div>
        </FormGroup>

        <FormGroup title="Signataire des contrats" description="La personne qui contresigne chaque contrat au nom de la société. Le prestataire de signature lui écrit à cette adresse.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Représentant (signataire)" htmlFor="s-rep" required error={error("representativeName")}>
              <Input id="s-rep" value={values.representativeName} onChange={set("representativeName")} placeholder="Prénom Nom" autoComplete="name" />
            </Field>
            <Field label="Qualité" htmlFor="s-title" hint="Facultatif. Exemple : Président." error={error("representativeTitle")}>
              <Input id="s-title" value={values.representativeTitle} onChange={set("representativeTitle")} placeholder="Président" />
            </Field>
            <Field label="E-mail du signataire" htmlFor="s-email" required error={error("representativeEmail")} className="sm:col-span-2">
              <Input id="s-email" type="email" value={values.representativeEmail} onChange={set("representativeEmail")} placeholder="prenom@societe.fr" autoComplete="email" />
            </Field>
          </div>
        </FormGroup>

        <div className="rounded-2xl border border-border-subtle bg-surface-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[14px] font-semibold text-text-primary">Pour générer un contrat</p>
            {missing.length === 0 ? <Badge tone="success">Fiche complète</Badge> : <Badge tone="warning">{missing.length} information{missing.length > 1 ? "s" : ""} à compléter</Badge>}
          </div>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {REQUIREMENTS.map((label) => {
              const ok = !missing.includes(label);
              return (
                <li key={label} className={cn("flex items-center gap-2 text-[13px]", ok ? "text-text-secondary" : "text-warning-700 dark:text-warning-500")}>
                  {ok ? <CheckCircle2 className="size-4 shrink-0 text-success-600" aria-hidden="true" /> : <Circle className="size-4 shrink-0" aria-hidden="true" />}
                  {label}
                  <span className="sr-only">{ok ? " : renseigné" : " : à compléter"}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[12.5px] text-text-tertiary">Les champs marqués d&apos;un astérisque sont exigés pour générer un contrat. La fiche peut être enregistrée incomplète ; les contrats attendront qu&apos;elle soit complète.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="submit" loading={pending} disabled={!dirty && Boolean(saved)}>
              Enregistrer la fiche
            </Button>
            {dirty && saved && <span className="text-[12.5px] text-warning-700 dark:text-warning-500">Modifications non enregistrées</span>}
            {!dirty && saved && <span className="text-[12.5px] text-text-tertiary">Fiche à jour</span>}
          </div>
        </div>
      </form>

      <aside className="min-w-0 space-y-4 lg:sticky lg:top-28" aria-label="Aperçu dans les contrats">
        <section className="overflow-hidden rounded-2xl border border-border-subtle bg-surface-card">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
            <div className="min-w-0">
              <h2 className="text-[12px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">Aperçu dans les contrats</h2>
              <p className="mt-0.5 text-[13px] leading-5 text-text-secondary">Mis à jour pendant la saisie, avec le texte exact du modèle de contrat.</p>
            </div>
            <Button asChild variant="outline" size="sm" leadingIcon={<FileText className="size-4" />}>
              <a href="/api/admin/contrat-specimen" target="_blank" rel="noopener noreferrer">
                Prévisualiser un contrat
              </a>
            </Button>
          </div>
          <div className="space-y-4 px-5 py-5">
            <p className="text-[13.5px] font-semibold text-text-primary">{preview.heading}</p>
            <p className="rounded-lg border-l-2 border-brand-500 bg-brand-50/60 px-3 py-2.5 text-[13.5px] leading-6 text-text-primary dark:bg-brand-950/30">
              <Placeholders text={preview.companyParagraph} tone="warning" />
            </p>
            <div>
              <p className="px-3 text-[13.5px] leading-6 text-text-tertiary">
                <Placeholders text={preview.pharmacyParagraph} tone="muted" />
              </p>
              <p className="mt-1 px-3 text-[11.5px] text-text-tertiary">Exemple : l&apos;officine vient de chaque dossier.</p>
            </div>
            <div>
              <p className="mb-2 text-[13.5px] font-semibold text-text-primary">Signatures</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {preview.signatures.map((s) => (
                  <div key={s.role} className={cn("rounded-lg border p-3", s.role === "COMPANY" ? "border-brand-300 bg-brand-50/40 dark:border-brand-800 dark:bg-brand-950/20" : "border-border-subtle")}>
                    <p className={cn("text-[12px] font-semibold", s.role === "COMPANY" ? "text-brand-700 dark:text-brand-300" : "text-text-tertiary")}>{s.label}</p>
                    <p className={cn("mt-1 text-[13px] break-words", s.role === "COMPANY" ? "text-text-primary" : "text-text-tertiary")}>
                      <Placeholders text={s.name} tone={s.role === "COMPANY" ? "warning" : "muted"} />
                    </p>
                    <p className="text-[12px] break-words text-text-tertiary">
                      <Placeholders text={s.email} tone={s.role === "COMPANY" ? "warning" : "muted"} />
                    </p>
                    <div className="mt-6 border-t border-dashed border-border-default pt-1 text-[10.5px] text-text-tertiary">Signature électronique horodatée</div>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-[12px] leading-5 text-text-tertiary">
              Le PDF spécimen utilise la fiche <strong className="font-medium">enregistrée</strong>, avec une officine fictive. Il n&apos;est ni stocké ni envoyé.
              {dirty && saved ? " Enregistrez d'abord vos modifications pour les y voir." : ""}
            </p>
          </div>
        </section>
        {aside}
      </aside>
    </div>
  );
}

function FormGroup({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-border-subtle bg-surface-card p-5">
      <legend className="sr-only">{title}</legend>
      <p className="text-[14px] font-semibold text-text-primary" aria-hidden="true">
        {title}
      </p>
      {description && <p className="mt-0.5 text-[12.5px] leading-5 text-text-secondary">{description}</p>}
      <div className="mt-4">{children}</div>
    </fieldset>
  );
}

/** Les repères entre crochets (champ non renseigné, exemple) se distinguent du texte. */
function Placeholders({ text, tone }: { text: string; tone: "warning" | "muted" }) {
  const parts = text.split(/(\[[^\]]+\])/g);
  return (
    <>
      {parts.map((part, index) =>
        /^\[[^\]]+\]$/.test(part) ? (
          <span key={index} className={cn("rounded px-1 font-sans text-[12px]", tone === "warning" ? "bg-warning-50 text-warning-700 dark:bg-warning-700/20 dark:text-warning-500" : "bg-surface-sunken text-text-tertiary")}>
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}
