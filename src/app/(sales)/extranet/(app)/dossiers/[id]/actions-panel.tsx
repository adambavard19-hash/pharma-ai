"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarClock, FileText, MessageSquare, Send } from "lucide-react";
import { addNoteAction, addTaskAction, createPharmacyFromProspectAction, generateContractAction, sendContractAction, setProspectStatusAction, updateProspectAction } from "@/server/actions/extranet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { MANUAL_STATUSES, PROSPECT_STATUS_LABELS, type ProspectStatusCode } from "@/core/sales/pipeline";
import { cn } from "@/lib/utils";

type ContractView = { id: string; version: number; status: string };

/**
 * Les gestes du commercial sur un dossier, pensés pour le pouce : changer
 * l'étape en une pression, noter en trois mots, relancer avec un préréglage,
 * générer puis envoyer le contrat, créer l'espace quand le contrat est signé.
 */
export function SalesActionsPanel({ prospect }: { prospect: { id: string; status: string; blocked: boolean; contracts: ContractView[]; pharmacyId: string | null; monthlyPriceCents: number | null; ownerName: string | null; email: string | null; addressLine1: string | null; city: string | null } }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [taskLabel, setTaskLabel] = useState("Relancer");
  const [taskDate, setTaskDate] = useState("");
  const [price, setPrice] = useState(prospect.monthlyPriceCents ? (prospect.monthlyPriceCents / 100).toFixed(2).replace(".", ",") : "249,00");
  const [duration, setDuration] = useState("12");
  const [start, setStart] = useState(() => new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10));
  const [showContract, setShowContract] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [edit, setEdit] = useState({ ownerName: prospect.ownerName ?? "", email: prospect.email ?? "", addressLine1: prospect.addressLine1 ?? "", city: prospect.city ?? "" });
  const router = useRouter();
  const { push } = useToast();

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Erreur");
        return;
      }
      push({ tone: "success", title: result.message ?? "Enregistré" });
      router.refresh();
    });
  };

  const current = prospect.status as ProspectStatusCode;
  const contract = prospect.contracts[0] ?? null;
  const contractInProgress = contract && ["SENT", "OPENED", "SIGNED_PHARMACY", "SIGNED_COMPANY"].includes(contract.status);
  const finalized = contract?.status === "FINALIZED";
  const canGenerate = !prospect.blocked && !contractInProgress && !finalized && !prospect.pharmacyId;
  const pickDays = (days: number) => { const d = new Date(); d.setDate(d.getDate() + days); setTaskDate(d.toISOString().slice(0, 10)); };

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      {/* Étape : les étapes manuelles en pastilles ; les autres se déduisent. */}
      <Card><CardContent className="py-4">
        <p className="text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">Étape</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {MANUAL_STATUSES.filter((s) => s !== "LOST").map((s) => (
            <button key={s} type="button" disabled={pending || prospect.blocked || s === current || !["PROSPECT", "CONTACTED", "INTERESTED", "PROPOSAL_SENT"].includes(current)} onClick={() => run(() => setProspectStatusAction({ prospectId: prospect.id, status: s }))}
              className={cn("min-h-[40px] rounded-full border px-3.5 text-[13px] font-medium transition-colors disabled:opacity-50", s === current ? "border-brand-600 bg-brand-600 text-white" : "border-border-default text-text-secondary hover:border-brand-400 hover:text-text-primary")}>
              {PROSPECT_STATUS_LABELS[s]}
            </button>
          ))}
          {current !== "LOST" && current !== "ACTIVATED" && (
            <button type="button" disabled={pending || prospect.blocked} onClick={() => { const reason = window.prompt("Motif (facultatif) :") ?? ""; run(() => setProspectStatusAction({ prospectId: prospect.id, status: "LOST", reason })); }} className="min-h-[40px] rounded-full border border-danger-300 px-3.5 text-[13px] font-medium text-danger-700 hover:bg-danger-50 disabled:opacity-50 dark:text-danger-400">Perdu</button>
          )}
        </div>
        {!["PROSPECT", "CONTACTED", "INTERESTED", "PROPOSAL_SENT", "LOST"].includes(current) && <p className="mt-2 text-[12.5px] text-text-tertiary">L&apos;étape suit désormais le contrat et l&apos;officine.</p>}
      </CardContent></Card>

      {/* Note et relance rapides */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card><CardContent className="space-y-2.5 py-4">
          <p className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase"><MessageSquare className="size-3.5" />Note rapide</p>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Appel : intéressé, rappeler jeudi…" />
          <Button size="sm" variant="outline" disabled={note.trim().length < 2} loading={pending} onClick={() => run(async () => { const r = await addNoteAction({ prospectId: prospect.id, note }); if (r.ok) setNote(""); return r; })}>Ajouter la note</Button>
        </CardContent></Card>
        <Card><CardContent className="space-y-2.5 py-4">
          <p className="flex items-center gap-1.5 text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase"><CalendarClock className="size-3.5" />Relance</p>
          <div className="flex flex-wrap gap-1.5">
            {[["Relancer dans 2 jours", 2], ["Appeler dans 1 semaine", 7], ["Renvoyer le contrat", 3]].map(([label, days]) => (
              <button key={String(label)} type="button" onClick={() => { setTaskLabel(String(label).replace(/ dans .*/, "")); pickDays(Number(days)); }} className="rounded-full border border-border-default px-3 py-1.5 text-[12.5px] text-text-secondary hover:border-brand-400 hover:text-text-primary">{label}</button>
            ))}
          </div>
          <div className="flex gap-2"><Input value={taskLabel} onChange={(e) => setTaskLabel(e.target.value)} aria-label="Intitulé de la relance" /><Input type="date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} className="max-w-[160px]" aria-label="Date" /></div>
          <Button size="sm" variant="outline" disabled={!taskDate} loading={pending} onClick={() => run(() => addTaskAction({ prospectId: prospect.id, label: taskLabel, dueAt: new Date(`${taskDate}T09:00:00`).toISOString() }))}>Programmer</Button>
        </CardContent></Card>
      </div>

      {/* Contrat */}
      <Card>
        <CardHeader title={contract ? `Contrat v${contract.version}` : "Contrat"} description={finalized ? "Signé par les deux parties." : contractInProgress ? "En attente de signature." : "Généré depuis le modèle PharmaBoost avec les informations du dossier et de la société."} />
        <CardContent className="space-y-3">
          {!contract || contract.status === "DRAFT" ? (
            <>
              {(!prospect.ownerName || !prospect.email || !prospect.addressLine1 || !prospect.city) && !showEdit && (
                <Alert tone="warning" title="Informations manquantes pour le contrat">
                  Nom du titulaire, e-mail, adresse et ville sont requis. <button type="button" className="font-medium underline underline-offset-2" onClick={() => setShowEdit(true)}>Compléter</button>
                </Alert>
              )}
              {prospect.ownerName && prospect.email && prospect.addressLine1 && prospect.city && !showEdit && !contract && (
                <p className="text-[13px] text-text-secondary">
                  Signataire : {prospect.ownerName} · {prospect.email}. <button type="button" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400" onClick={() => setShowEdit(true)}>Modifier les coordonnées</button>
                </p>
              )}
              {showEdit && (
                <div className="grid gap-3 rounded-lg border border-border-subtle p-3 sm:grid-cols-2">
                  <Field label="Titulaire" htmlFor="e-owner" required><Input id="e-owner" value={edit.ownerName} onChange={(e) => setEdit({ ...edit, ownerName: e.target.value })} /></Field>
                  <Field label="E-mail du titulaire" htmlFor="e-email" required><Input id="e-email" type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
                  <Field label="Adresse" htmlFor="e-addr" required><Input id="e-addr" value={edit.addressLine1} onChange={(e) => setEdit({ ...edit, addressLine1: e.target.value })} /></Field>
                  <Field label="Ville" htmlFor="e-city" required><Input id="e-city" value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} /></Field>
                  <div className="sm:col-span-2"><Button size="sm" loading={pending} onClick={() => run(async () => { const r = await updateProspectAction({ prospectId: prospect.id, ...edit }); if (r.ok) setShowEdit(false); return r; })}>Enregistrer</Button></div>
                </div>
              )}
              {canGenerate && !contract && !showContract && <Button variant="outline" onClick={() => setShowContract(true)} leadingIcon={<FileText className="size-4" />}>Préparer le contrat</Button>}
              {canGenerate && !contract && showContract && (
                <div className="grid gap-3 rounded-lg border border-border-subtle p-3 sm:grid-cols-3">
                  <Field label="Abonnement mensuel HT" htmlFor="c-price" required><Input id="c-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
                  <Field label="Durée (mois)" htmlFor="c-duration" required><Input id="c-duration" type="number" min={1} max={60} value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
                  <Field label="Début" htmlFor="c-start" required><Input id="c-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
                  <div className="sm:col-span-3"><Button loading={pending} leadingIcon={<FileText className="size-4" />} onClick={() => run(() => generateContractAction({ prospectId: prospect.id, monthlyPriceCents: Math.round(Number(price.replace(",", ".")) * 100), durationMonths: Number(duration), startDate: start }))}>Générer le contrat</Button></div>
                </div>
              )}
              {contract && contract.status === "DRAFT" && (
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline"><a href={`/api/contrats/apercu/${contract.id}`} target="_blank" rel="noreferrer">Relire le PDF</a></Button>
                  <Button loading={pending} leadingIcon={<Send className="size-4" />} onClick={() => run(() => sendContractAction({ prospectId: prospect.id, contractId: contract.id }))}>Envoyer le contrat au titulaire</Button>
                </div>
              )}
            </>
          ) : contractInProgress ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><a href={`/api/contrats/apercu/${contract.id}`} target="_blank" rel="noreferrer">Voir le PDF</a></Button>
              <Button variant="outline" loading={pending} leadingIcon={<Send className="size-4" />} onClick={() => run(() => sendContractAction({ prospectId: prospect.id, contractId: contract.id }))}>Renvoyer le lien</Button>
            </div>
          ) : finalized && !prospect.pharmacyId ? (
            <Button loading={pending} leadingIcon={<Building2 className="size-[18px]" />} onClick={() => run(() => createPharmacyFromProspectAction(prospect.id))}>Créer l&apos;espace pharmacie</Button>
          ) : prospect.pharmacyId ? (
            <p className="text-[13.5px] text-text-secondary">Espace pharmacie créé. Le titulaire a reçu son e-mail d&apos;accueil.</p>
          ) : (
            <p className="text-[13.5px] text-text-secondary">Contrat clos ({contract.status.toLowerCase()}). {canGenerate && <button type="button" className="text-brand-700 underline underline-offset-2 dark:text-brand-400" onClick={() => setShowContract(true)}>Préparer un nouveau contrat</button>}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
