"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSignature, Send } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { prepareContractForPharmacyAction, sendContractForPharmacyAction } from "@/server/actions/platform-billing";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/field";
import { Alert } from "@/components/ui/feedback";
import { useToast } from "@/components/ui/toast";
import { formatEuros } from "@/core/billing/subscription";

export type PlanOption = { id: string; name: string; monthlyPriceCents: number; trialDays: number; isDefault: boolean };

/**
 * Les gestes de contrat depuis la fiche abonnement : préparer le contrat
 * (PDF à relire), puis l'envoyer pour signature. Le contrat reprend le tarif
 * catalogue de l'offre choisie : c'est ce tarif qui deviendra le tarif
 * contractuel de l'officine à la souscription.
 */
export function PrepareContractButton({ pharmacyId, plans, variant = "primary" }: { pharmacyId: string; plans: PlanOption[]; variant?: "primary" | "outline" }) {
  const router = useRouter();
  const { push } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [planId, setPlanId] = useState(plans.find((p) => p.isDefault)?.id ?? plans[0]?.id ?? "");
  const [durationMonths, setDurationMonths] = useState("");
  const [startDate, setStartDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const plan = plans.find((p) => p.id === planId) ?? null;

  const openModal = () => {
    setStartDate(new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(new Date()));
    setError(null);
    setOpen(true);
  };

  return (
    <>
      <Button size="sm" variant={variant} leadingIcon={<FileSignature className="size-4" />} onClick={openModal} disabled={plans.length === 0}>
        Préparer le contrat
      </Button>
      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Préparer le contrat"
        description="Les informations de l'officine et du titulaire sont reprises telles quelles. Le PDF est généré et reste à relire avant envoi."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Annuler
            </Button>
            <Button
              loading={pending}
              disabled={!planId || !durationMonths || !startDate}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const result = await prepareContractForPharmacyAction({ pharmacyId, planId, durationMonths: Number(durationMonths), startDate });
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  push({ tone: "success", title: result.message ?? "Contrat préparé." });
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              Générer le contrat
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Offre" htmlFor="pc-plan">
            <Select id="pc-plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatEuros(p.monthlyPriceCents)} HT/mois{p.trialDays ? `, ${p.trialDays} jours offerts` : ""}
                </option>
              ))}
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
          {plan && (
            <p className="rounded-lg bg-surface-sunken px-3 py-2 text-[12.5px] text-text-secondary">
              Le contrat mentionnera {formatEuros(plan.monthlyPriceCents)} HT par mois{plan.trialDays ? `, ${plan.trialDays} premiers jours offerts` : ""}. Ce tarif deviendra le tarif contractuel de l&apos;officine à la souscription.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}

export function SendContractButton({ pharmacyId, contractId, status, signerEmail }: { pharmacyId: string; contractId: string; status: string; signerEmail: string }) {
  const first = status === "DRAFT";
  return (
    <ConfirmAction
      label={first ? "Envoyer pour signature" : "Renvoyer"}
      icon={<Send className="size-4" />}
      variant={first ? "primary" : "outline"}
      title={first ? "Envoyer le contrat pour signature" : "Renvoyer le contrat"}
      description={`Le contrat part à ${signerEmail}.`}
      consequences={first ? ["Le titulaire reçoit le contrat par e-mail, avec le lien de signature électronique.", "Le statut passe à « Envoyé » ; les relances automatiques suivent leur cadence."] : ["Le titulaire reçoit de nouveau le lien de signature.", "Le contrat lui-même n'est pas modifié."]}
      confirmLabel={first ? "Envoyer" : "Renvoyer"}
      onConfirm={() => sendContractForPharmacyAction({ pharmacyId, contractId })}
    />
  );
}
