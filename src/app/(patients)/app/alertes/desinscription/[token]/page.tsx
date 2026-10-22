import { notFound } from "next/navigation";
import { PATIENT_APP_LIVE } from "@/core/patient-app/offers";
import { turnOffOfferAlerts } from "@/server/services/app-members";
import { Card } from "../../../_components/ui";

export const dynamic = "force-dynamic";

/** « Ne plus recevoir ces e-mails » : l'accord est retiré à l'ouverture du lien, sans connexion. */
export default async function OfferAlertsOffPage({ params }: { params: Promise<{ token: string }> }) {
  if (!PATIENT_APP_LIVE) notFound();
  const { token } = await params;
  const done = await turnOffOfferAlerts(token);
  return (
    <div className="px-4 pt-8">
      <Card>
        <h1 className="text-[18px] font-bold">{done ? "C'est noté" : "Lien expiré"}</h1>
        <p className="mt-2 text-[14px] leading-5 text-[#475569]">
          {done
            ? "Vous ne recevrez plus d'e-mail pour les nouvelles offres. Vous pouvez les réactiver dans Mon espace."
            : "Ce lien n'est plus valide. Décochez « Me prévenir des nouvelles offres » dans Mon espace."}
        </p>
      </Card>
    </div>
  );
}
