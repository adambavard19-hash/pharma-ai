"use client";

import { Send } from "lucide-react";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Alert } from "@/components/ui/feedback";
import { sendDraftContractAction } from "@/server/actions/admin-contracts";

/**
 * « Envoyer » un brouillon : la conséquence est écrite avant le clic. Le
 * serveur revérifie que c'est bien le dernier brouillon du dossier.
 */
export function SendDraftButton({
  contractId,
  reference,
  signerName,
  signerEmail,
  monthlyPrice,
  generatedOn,
  stale,
  signatureLabel,
  signatureLive,
  size = "sm",
  variant = "primary",
}: {
  contractId: string;
  reference: string;
  signerName: string;
  signerEmail: string;
  monthlyPrice: string;
  generatedOn: string;
  stale: boolean;
  signatureLabel: string;
  signatureLive: boolean;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "outline";
}) {
  return (
    <ConfirmAction
      label="Envoyer"
      icon={<Send className="size-4" />}
      size={size}
      variant={variant}
      title={`Envoyer le contrat ${reference}`}
      description={`Le contrat part à ${signerName} (${signerEmail}).`}
      consequences={[
        `Tarif inscrit au contrat : ${monthlyPrice} HT par mois.`,
        signatureLive ? `Une demande de signature électronique est créée chez ${signatureLabel}, et le lien part dans l'e-mail PharmaBoost.` : "Aucun prestataire de signature n'est branché : le contrat part par lien sécurisé, sans signature électronique.",
        "Le délai de signature de 30 jours court à partir de cet envoi ; les relances automatiques, si elles sont activées, suivent leur cadence.",
        "L'envoi est tracé dans le dossier, l'historique des communications et le journal d'audit.",
      ]}
      confirmLabel="Envoyer le contrat"
      onConfirm={() => sendDraftContractAction({ contractId })}
    >
      {stale && (
        <Alert tone="warning" title="Le dossier a changé depuis ce brouillon">
          Ce brouillon a été généré le {generatedOn}. Le PDF envoyé sera celui-ci, tel quel. Si les informations du dossier ont été corrigées depuis, préparez plutôt une nouvelle version depuis le dossier.
        </Alert>
      )}
    </ConfirmAction>
  );
}
