"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { convertSalesApplicationAction } from "@/server/actions/admin-sales-applications";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { Checkbox } from "@/components/ui/field";

/**
 * « Créer l'espace de l'affilié » : le secours, quand la création automatique à
 * l'acceptation n'a pas pu se faire (ou pour une candidature acceptée avant le
 * 18 oct. 2026). Crée le compte de l'extranet avec les données de la
 * candidature et l'affiliation (10 à 20 % chaque mois, selon le palier). L'invitation par e-mail est
 * facultative.
 */
export function ConvertPanel({ id, name, email, commissionLabel }: { id: string; name: string; email: string; commissionLabel: string }) {
  const [invite, setInvite] = useState(true);

  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-5 text-text-secondary">
        Crée l&apos;espace d&apos;affilié de {name} (son accès à l&apos;extranet) avec les informations de la candidature (prénom, nom, e-mail, téléphone, zone). Sa rémunération : {commissionLabel}. Vous pourrez la modifier depuis sa fiche.
      </p>
      <Checkbox id="sales-application-invite" checked={invite} onChange={(event) => setInvite(event.target.checked)} label="Envoyer l'invitation par e-mail" description="Un lien lui permet de choisir son mot de passe. Sans invitation, vous pourrez l'envoyer plus tard depuis la fiche du commercial." />
      <ConfirmAction
        label="Créer l'espace de l'affilié"
        icon={<UserPlus className="size-3.5" />}
        variant="primary"
        title="Créer l'espace de l'affilié ?"
        confirmLabel="Créer l'espace"
        consequences={[
          `Un espace d'affilié est créé pour ${email}.`,
          `${commissionLabel}.`,
          invite ? "Une invitation est envoyée à cette adresse." : "Aucune invitation n'est envoyée.",
          "Le statut de la candidature ne pourra plus changer.",
        ]}
        onConfirm={() => convertSalesApplicationAction({ id, invite })}
      />
    </div>
  );
}
