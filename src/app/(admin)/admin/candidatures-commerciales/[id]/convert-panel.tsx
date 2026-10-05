"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { convertSalesApplicationAction } from "@/server/actions/admin-sales-applications";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Checkbox } from "@/components/ui/field";

/**
 * « Transformer en commercial » : crée le compte avec les données de la
 * candidature et la commission standard. L'invitation par e-mail (lien pour
 * choisir un mot de passe) est facultative.
 */
export function ConvertPanel({ id, name, email, commissionLabel }: { id: string; name: string; email: string; commissionLabel: string }) {
  const [invite, setInvite] = useState(true);

  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-5 text-text-secondary">
        Crée le compte commercial de {name} avec les informations de la candidature (prénom, nom, e-mail, téléphone, zone). Sa commission est fixe : {commissionLabel} par pharmacie activée, le montant standard réglé dans la console.
      </p>
      <Checkbox id="sales-application-invite" checked={invite} onChange={(event) => setInvite(event.target.checked)} label="Envoyer l'invitation par e-mail" description="Un lien lui permet de choisir son mot de passe. Sans invitation, vous pourrez l'envoyer plus tard depuis la fiche du commercial." />
      <ConfirmAction
        label="Transformer en commercial"
        icon={<UserPlus className="size-3.5" />}
        variant="primary"
        title="Transformer en commercial ?"
        confirmLabel="Créer le commercial"
        consequences={[
          `Un compte commercial est créé pour ${email}.`,
          `Commission fixe de ${commissionLabel} par pharmacie activée.`,
          invite ? "Une invitation est envoyée à cette adresse." : "Aucune invitation n'est envoyée.",
          "Le statut de la candidature ne pourra plus changer.",
        ]}
        onConfirm={() => convertSalesApplicationAction({ id, invite })}
      />
    </div>
  );
}
