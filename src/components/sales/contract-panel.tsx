"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, FileText, RefreshCw, Send } from "lucide-react";
import { createPharmacyFromProspectAction, sendContractAction, startContractingAction, updateProspectAction } from "@/server/actions/extranet";
import { adminCreatePharmacyAction, adminResendContractAction, adminStartContractingAction, adminUpdateProspectAction, refreshSignatureStatusAction } from "@/server/actions/platform-sales";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { CONTRACT_FIELD_LABELS, type ContractField, type MissingField } from "@/core/contracts/requirements";

export type ContractPanelData = {
  id: string;
  blocked: boolean;
  pharmacyId: string | null;
  values: Record<ContractField, string> & { ownerTitle: string };
  missing: MissingField[];
  offer: { planId: string; name: string; monthlyPriceCents: number; trialDays: number } | null;
  monthlyPriceCents: number | null;
  contract: { id: string; version: number; status: string; providerEnvelopeId: string | null; signedArchivedAt: string | null } | null;
};

const IN_PROGRESS = ["SENT", "OPENED", "SIGNED_PHARMACY", "SIGNED_COMPANY"];
const EDITABLE: Array<ContractField | "ownerTitle"> = ["name", "legalName", "siret", "addressLine1", "postalCode", "city", "ownerName", "ownerTitle", "email"];
const LABELS: Record<string, string> = { ...CONTRACT_FIELD_LABELS, ownerTitle: "Qualité du signataire" };

const euros = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const trialText = (days: number) => (days >= 28 && days <= 31 ? "premier mois offert" : days > 0 ? `${days} jours offerts` : "sans période offerte");

/**
 * Le contrat d'un dossier, vu par la console ou par le commercial : un seul
 * geste, « Envoyer le contrat ». Le moteur commun vérifie les informations,
 * génère le contrat depuis le modèle actif et l'envoie pour signature. S'il
 * manque quelque chose, seul le manque est demandé.
 */
export function ContractPanel({ mode, data }: { mode: "admin" | "sales"; data: ContractPanelData }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [values, setValues] = useState(data.values);
  const [editing, setEditing] = useState(false);
  const defaultPrice = data.monthlyPriceCents ?? data.offer?.monthlyPriceCents ?? null;
  const [price, setPrice] = useState(defaultPrice ? euros(defaultPrice) : "");
  const [duration, setDuration] = useState("12");
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const router = useRouter();
  const { push } = useToast();

  const contract = data.contract;
  const inProgress = contract && IN_PROGRESS.includes(contract.status);
  const finalized = contract?.status === "FINALIZED";
  const missingFields = new Set(data.missing.map((m) => m.field));
  const showForm = editing || data.missing.length > 0;

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> }>) => {
    if (pending) return;
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Erreur");
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      push({ tone: "success", title: result.message ?? "Enregistré" });
      setEditing(false);
      router.refresh();
    });
  };

  const save = () => run(() => (mode === "admin" ? adminUpdateProspectAction({ prospectId: data.id, ...values }) : updateProspectAction({ prospectId: data.id, ...values })));
  const priceCents = Math.round(Number(price.replace(/\s/g, "").replace(",", ".")) * 100);
  const send = () =>
    run(() => {
      const terms = { prospectId: data.id, monthlyPriceCents: Number.isFinite(priceCents) && priceCents > 0 && priceCents !== defaultPrice ? priceCents : null, durationMonths: Number(duration) || 12, startDate: start };
      return mode === "admin" ? adminStartContractingAction({ ...terms, planId: data.offer?.planId ?? null }) : startContractingAction(terms);
    });
  const resend = () => contract && run(() => (mode === "admin" ? adminResendContractAction({ prospectId: data.id, contractId: contract.id }) : sendContractAction({ prospectId: data.id, contractId: contract.id })));

  return (
    <Card>
      <CardHeader
        title={contract ? `Contrat v${contract.version}` : "Contrat"}
        description={finalized ? (contract?.signedArchivedAt ? "Signé par les deux parties · PDF signé archivé." : "Signé par les deux parties.") : inProgress ? "En attente de signature : les statuts arrivent du prestataire de signature." : "Généré depuis le modèle PharmaBoost actif avec les informations du dossier."}
      />
      <CardContent className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}

        {!finalized && !inProgress && (
          <>
            {data.missing.length > 0 && !editing && (
              <Alert tone="warning" title="Informations manquantes pour le contrat">
                {data.missing.map((m) => (m.reason === "invalid" ? `${m.label} (invalide)` : m.label)).join(", ")}.
              </Alert>
            )}
            {showForm ? (
              <div className="grid gap-3 rounded-lg border border-border-subtle p-3 sm:grid-cols-2">
                {EDITABLE.filter((f) => editing || missingFields.has(f as ContractField) || (f === "ownerTitle" && missingFields.has("ownerName"))).map((field) => (
                  <Field key={field} label={LABELS[field]} htmlFor={`cp-${field}`} required={field !== "ownerTitle"} error={fieldErrors[field]}>
                    <Input id={`cp-${field}`} type={field === "email" ? "email" : "text"} inputMode={field === "siret" || field === "postalCode" ? "numeric" : undefined} value={values[field]} onChange={(e) => setValues({ ...values, [field]: e.target.value })} />
                  </Field>
                ))}
                <div className="flex gap-2 sm:col-span-2">
                  <Button size="sm" loading={pending} onClick={save}>Enregistrer</Button>
                  {editing && <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setValues(data.values); }}>Annuler</Button>}
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-text-secondary">
                {values.legalName} · SIRET {values.siret} · signataire {values.ownerName}{values.ownerTitle ? ` (${values.ownerTitle})` : ""} · {values.email}.{" "}
                <button type="button" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400" onClick={() => setEditing(true)}>Modifier</button>
              </p>
            )}

            {data.missing.length === 0 && !editing && (
              <div className="space-y-3 rounded-lg border border-border-subtle p-3">
                <p className="text-[13px] text-text-secondary">
                  Offre : <strong className="text-text-primary">{data.offer?.name ?? "aucune offre par défaut"}</strong>
                  {data.offer ? ` · ${euros(data.offer.monthlyPriceCents)} € HT/mois · ${trialText(data.offer.trialDays)}` : " — indiquez un tarif."}
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Abonnement mensuel HT" htmlFor="cp-price" required><Input id="cp-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
                  <Field label="Durée (mois)" htmlFor="cp-duration" required><Input id="cp-duration" type="number" min={1} max={60} value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
                  <Field label="Prise d'effet" htmlFor="cp-start" required><Input id="cp-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button loading={pending} disabled={data.blocked || !price} leadingIcon={<Send className="size-4" />} onClick={send}>Envoyer le contrat</Button>
                  {contract?.status === "DRAFT" && <Button asChild variant="outline"><a href={`/api/contrats/apercu/${contract.id}`} target="_blank" rel="noreferrer">Relire le brouillon</a></Button>}
                  <span className="text-[12.5px] text-text-tertiary">Le contrat est généré, soumis à la signature électronique et adressé au titulaire en une fois.</span>
                </div>
              </div>
            )}
            {contract && (contract.status === "REFUSED" || contract.status === "EXPIRED") && <p className="text-[12.5px] text-text-tertiary">Le contrat précédent est {contract.status === "REFUSED" ? "refusé" : "expiré"} : « Envoyer le contrat » en prépare une nouvelle version.</p>}
          </>
        )}

        {inProgress && contract && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" leadingIcon={<FileText className="size-4" />}><a href={`/api/contrats/apercu/${contract.id}`} target="_blank" rel="noreferrer">Voir le PDF</a></Button>
            <Button variant="outline" loading={pending} leadingIcon={<Send className="size-4" />} onClick={resend}>Renvoyer au titulaire</Button>
            {mode === "admin" && contract.providerEnvelopeId && <Button variant="outline" loading={pending} leadingIcon={<RefreshCw className="size-4" />} onClick={() => run(() => refreshSignatureStatusAction({ prospectId: data.id, contractId: contract.id }))}>Actualiser chez le prestataire</Button>}
          </div>
        )}

        {finalized && contract && (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" leadingIcon={<FileText className="size-4" />}><a href={`/api/contrats/apercu/${contract.id}`} target="_blank" rel="noreferrer">{contract.signedArchivedAt ? "Voir le PDF signé" : "Voir le PDF"}</a></Button>
            {mode === "admin" && contract.providerEnvelopeId && <Button variant="outline" loading={pending} leadingIcon={<RefreshCw className="size-4" />} onClick={() => run(() => refreshSignatureStatusAction({ prospectId: data.id, contractId: contract.id }))}>Actualiser chez le prestataire</Button>}
            {!data.pharmacyId && <Button loading={pending} leadingIcon={<Building2 className="size-[18px]" />} onClick={() => run(() => (mode === "admin" ? adminCreatePharmacyAction(data.id) : createPharmacyFromProspectAction(data.id)))}>Créer l&apos;espace pharmacie</Button>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
