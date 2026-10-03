"use client";

import { useState } from "react";
import { PencilLine } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Field, Input } from "@/components/ui/field";
import { changeContractPriceAction } from "@/server/actions/admin-billing";
import { formatEuros } from "@/core/billing/subscription";
import { parseAmountToCents } from "@/lib/format";

/**
 * « Modifier le tarif contractuel » : un nouveau montant, un motif, et le mot
 * MODIFIER à retaper. La fenêtre dit où le changement s'applique (Stripe ou
 * la seule fiche) et à partir de quand ; le serveur revérifie tout.
 */
export function ChangeContractPriceButton({
  subscriptionId,
  currentCents,
  catalogCents,
  stripeLinked,
  stripeConfigured,
  nextInvoiceLabel,
}: {
  subscriptionId: string;
  currentCents: number;
  catalogCents: number;
  stripeLinked: boolean;
  stripeConfigured: boolean;
  nextInvoiceLabel: string | null;
}) {
  const [value, setValue] = useState("");
  const cents = value.trim() ? parseAmountToCents(value) : null;
  const valid = cents !== null && Number.isInteger(cents) && cents >= 100 && cents <= 1_000_000;
  const diff = valid ? cents - currentCents : null;
  const blocked = stripeLinked && !stripeConfigured;

  const consequences = [
    stripeLinked
      ? `L'abonnement Stripe est mis à jour : le nouveau tarif s'applique à la prochaine échéance${nextInvoiceLabel ? ` (${nextInvoiceLabel})` : ""}, sans prorata sur la période en cours.`
      : "Aucun abonnement Stripe n'est rattaché : seule la fiche change. Rien n'est facturé différemment tant qu'aucun abonnement Stripe n'existe.",
    "Le catalogue n'est pas modifié ; les autres officines ne sont pas concernées.",
    "Le changement est inscrit à l'historique du tarif et au journal d'audit, avec son motif.",
  ];

  return (
    <div className="space-y-1.5">
      <ConfirmAction
        label="Modifier le tarif contractuel"
        icon={<PencilLine className="size-4" />}
        variant="outline"
        title="Modifier le tarif contractuel"
        description={`Tarif actuel : ${formatEuros(currentCents)} HT par mois. Tarif catalogue de l'offre : ${formatEuros(catalogCents)} HT.`}
        consequences={consequences}
        reason={{ label: "Motif de la modification", placeholder: "Avenant signé le…, geste commercial validé par…" }}
        typedConfirmation="MODIFIER"
        confirmLabel="Modifier le tarif"
        disabled={blocked}
        onConfirm={async (reason) => {
          if (!valid || cents === null) return { ok: false, error: "Indiquez un nouveau tarif mensuel HT entre 1 € et 10 000 €." };
          if (cents === currentCents) return { ok: false, error: "Le nouveau tarif est identique au tarif actuel." };
          const result = await changeContractPriceAction({ subscriptionId, nextCents: cents, reason: reason ?? "" });
          if (result.ok) setValue("");
          return result;
        }}
      >
        <Field label="Nouveau tarif mensuel HT (€)" htmlFor="contract-price" hint={valid && diff !== null ? `${diff === 0 ? "Identique au tarif actuel" : `${diff > 0 ? "+" : "−"}${formatEuros(Math.abs(diff))} par mois par rapport au tarif actuel`}.` : "Par exemple 290 ou 289,90."}>
          <Input id="contract-price" inputMode="decimal" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder={String(currentCents / 100).replace(".", ",")} />
        </Field>
      </ConfirmAction>
      {blocked && <p className="text-[12px] text-warning-700 dark:text-warning-500">Stripe non configuré : le tarif d&apos;un abonnement facturé par Stripe ne peut pas changer sur la seule fiche.</p>}
    </div>
  );
}
