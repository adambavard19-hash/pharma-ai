"use client";

import { BellRing } from "lucide-react";
import { ConfirmAction } from "./confirm-action";
import { remindContractNowAction } from "@/server/actions/admin-contracts";

/** « Relancer » un contrat non signé : confirmation, puis l'e-mail de relance part au signataire. */
export function RemindContractButton({ contractId, signerEmail, reminderCount, size = "sm", variant = "secondary" }: { contractId: string; signerEmail: string; reminderCount: number; size?: "sm" | "md"; variant?: "secondary" | "primary" | "outline" }) {
  return (
    <ConfirmAction
      label="Relancer"
      icon={<BellRing className="size-4" />}
      size={size}
      variant={variant}
      title="Relancer la signature du contrat"
      description={`Un e-mail de relance part à ${signerEmail}, avec le lien de signature.`}
      consequences={[
        `Ce sera la relance n° ${reminderCount + 1} : elle compte dans la cadence des relances automatiques.`,
        "Le statut est d'abord relu chez le prestataire de signature : un contrat déjà signé n'est pas relancé.",
        "Jamais deux relances en moins de 24 heures.",
      ]}
      confirmLabel="Envoyer la relance"
      onConfirm={() => remindContractNowAction({ contractId })}
    />
  );
}
