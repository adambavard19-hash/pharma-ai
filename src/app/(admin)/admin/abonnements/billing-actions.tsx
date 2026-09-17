"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Check, FileSignature, FileText, Link2, Power, RefreshCw, Send } from "lucide-react";
import {
  cancelAtPeriodEndAction,
  prepareContractForPharmacyAction,
  refreshSubscriptionAction,
  sendContractForPharmacyAction,
  sendSubscriptionInviteAction,
  suspendAccessAction,
} from "@/server/actions/platform-billing";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatCents } from "@/lib/format";
import type { ActionResult } from "@/server/actions/types";

type PlanOption = { id: string; name: string; monthlyPriceCents: number; trialDays: number; isDefault: boolean };

/**
 * Les gestes de la console sur une officine : préparer le contrat, l'envoyer
 * ou le renvoyer, envoyer le lien d'abonnement, relire chez Stripe,
 * programmer une résiliation, suspendre l'accès. Chaque geste est une action
 * serveur tracée ; l'écran ne fait qu'afficher le résultat.
 */
export function PharmacyBillingActions({
  pharmacyId,
  contract,
  hasSubscription,
  subscriptionStatus,
  cancelAtPeriodEnd,
  isActive,
  inviteSent,
  plans,
  stripeReady,
  compact = false,
}: {
  pharmacyId: string;
  contract: { id: string; status: string; version: number } | null;
  hasSubscription: boolean;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  isActive: boolean;
  inviteSent: boolean;
  plans: PlanOption[];
  stripeReady: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [contractOpen, setContractOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);

  const run = (key: string, action: () => Promise<ActionResult<unknown>>) => {
    setBusy(key);
    start(async () => {
      const result = await action();
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Fait.") : result.error });
      setBusy(null);
      router.refresh();
    });
  };

  const contractSendable = contract && ["DRAFT", "SENT", "OPENED"].includes(contract.status);
  const contractDone = contract && ["FINALIZED", "SIGNED_PHARMACY", "SIGNED_COMPANY"].includes(contract.status);
  const canInvite = !hasSubscription || subscriptionStatus === "CANCELED" || subscriptionStatus === "INCOMPLETE_EXPIRED";
  const size = compact ? "sm" : "md";

  return (
    <div className="flex flex-wrap gap-1.5">
      {contract ? (
        <Button asChild size={size} variant="outline" leadingIcon={<FileText className="size-3.5" />}>
          <a href={`/api/contrats/apercu/${contract.id}`} target="_blank" rel="noreferrer">Voir contrat v{contract.version}</a>
        </Button>
      ) : null}
      {(!contract || contract.status === "REFUSED" || contract.status === "EXPIRED") && (
        <Button size={size} variant={contract ? "outline" : "primary"} leadingIcon={<FileSignature className="size-3.5" />} onClick={() => setContractOpen(true)} disabled={plans.length === 0}>
          Préparer le contrat
        </Button>
      )}
      {contractSendable && (
        <Button size={size} variant={contract.status === "DRAFT" ? "primary" : "outline"} loading={pending && busy === "send"} leadingIcon={<Send className="size-3.5" />} onClick={() => run("send", () => sendContractForPharmacyAction({ pharmacyId, contractId: contract.id }))}>
          {contract.status === "DRAFT" ? "Envoyer pour signature" : "Renvoyer"}
        </Button>
      )}
      {canInvite && (
        <Button size={size} variant={contractDone && !inviteSent ? "primary" : "outline"} loading={pending && busy === "invite"} leadingIcon={<Link2 className="size-3.5" />} disabled={!stripeReady} title={stripeReady ? undefined : "Stripe n'est pas configuré"} onClick={() => run("invite", () => sendSubscriptionInviteAction({ pharmacyId, planId: contract ? null : (plans.find((p) => p.isDefault) ?? plans[0])?.id ?? null, contractId: contract?.id ?? null }))}>
          {inviteSent ? "Renvoyer le lien d'abonnement" : "Envoyer l'abonnement"}
        </Button>
      )}
      {hasSubscription && (
        <>
          <Button asChild size={size} variant="outline">
            <Link href={`/admin/abonnements/${pharmacyId}`}>Voir abonnement</Link>
          </Button>
          <Button size={size} variant="ghost" loading={pending && busy === "refresh"} leadingIcon={<RefreshCw className="size-3.5" />} onClick={() => run("refresh", () => refreshSubscriptionAction({ pharmacyId }))}>
            Relire chez Stripe
          </Button>
          {subscriptionStatus !== "CANCELED" && (
            <Button size={size} variant={cancelAtPeriodEnd ? "outline" : "ghost"} loading={pending && busy === "cancel"} leadingIcon={cancelAtPeriodEnd ? <Check className="size-3.5" /> : <Ban className="size-3.5" />} onClick={() => run("cancel", () => cancelAtPeriodEndAction({ pharmacyId, cancel: !cancelAtPeriodEnd }))}>
              {cancelAtPeriodEnd ? "Annuler la résiliation" : "Résilier en fin de période"}
            </Button>
          )}
        </>
      )}
      <Button size={size} variant={isActive ? "ghost" : "outline"} loading={pending && busy === "suspend"} leadingIcon={isActive ? <Power className="size-3.5" /> : <Check className="size-3.5" />} onClick={() => (isActive ? setSuspendOpen(true) : run("suspend", () => suspendAccessAction({ pharmacyId, suspended: false })))}>
        {isActive ? "Suspendre" : "Réactiver l'accès"}
      </Button>

      <PrepareContractModal open={contractOpen} onClose={() => setContractOpen(false)} pharmacyId={pharmacyId} plans={plans} />
      <SuspendModal open={suspendOpen} onClose={() => setSuspendOpen(false)} onConfirm={(reason) => { setSuspendOpen(false); run("suspend", () => suspendAccessAction({ pharmacyId, suspended: true, reason })); }} />
    </div>
  );
}

function PrepareContractModal({ open, onClose, pharmacyId, plans }: { open: boolean; onClose: () => void; pharmacyId: string; plans: PlanOption[] }) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [planId, setPlanId] = useState(plans.find((p) => p.isDefault)?.id ?? plans[0]?.id ?? "");
  const [durationMonths, setDurationMonths] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const plan = plans.find((p) => p.id === planId) ?? null;
  return (
    <Modal open={open} onClose={onClose} title="Préparer le contrat" description="Les informations de l'officine et du titulaire sont reprises telles quelles. Vous choisissez l'offre et l'engagement ; le PDF est généré et reste à relire avant envoi.">
      <div className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Offre" htmlFor="pc-plan">
          <Select id="pc-plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {formatCents(p.monthlyPriceCents)}/mois{p.trialDays ? `, ${p.trialDays} jours offerts` : ""}</option>)}
          </Select>
        </Field>
        <Field label="Durée d'engagement" htmlFor="pc-duration" hint="Telle qu'elle figurera au contrat. Sans engagement : 1 mois, renouvelé tacitement.">
          <Select id="pc-duration" value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)}>
            <option value="">Choisir…</option>
            <option value="1">1 mois (sans engagement)</option>
            <option value="12">12 mois</option>
            <option value="24">24 mois</option>
            <option value="36">36 mois</option>
          </Select>
        </Field>
        <Field label="Date d'effet" htmlFor="pc-start">
          <Input id="pc-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        {plan && <p className="text-[12.5px] text-text-secondary">Le contrat mentionnera : {formatCents(plan.monthlyPriceCents)} HT par mois{plan.trialDays ? `, ${plan.trialDays} premiers jours offerts` : ""}.</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button loading={pending} disabled={!planId || !durationMonths} onClick={() => start(async () => {
            setError(null);
            const result = await prepareContractForPharmacyAction({ pharmacyId, planId, durationMonths: Number(durationMonths), startDate });
            if (!result.ok) { setError(result.error); return; }
            push({ tone: "success", title: result.message ?? "Contrat préparé." });
            onClose();
            router.refresh();
          })}>
            Générer le contrat
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SuspendModal({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal open={open} onClose={onClose} title="Suspendre l'accès" description="L'officine ne pourra plus se connecter ; ses sessions en cours sont fermées. L'abonnement Stripe n'est pas modifié.">
      <div className="space-y-3">
        <Field label="Motif" htmlFor="sus-reason" hint="Visible dans l'historique et le journal d'audit.">
          <Input id="sus-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Impayé persistant, demande du titulaire…" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button variant="danger" disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>Suspendre l&apos;accès</Button>
        </div>
      </div>
    </Modal>
  );
}
