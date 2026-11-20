import { notFound } from "next/navigation";
import { PATIENT_APP_LIVE } from "@/core/patient-app/offers";
import { turnOffNurture } from "@/server/services/app-member-emails";
import { Card } from "../../../_components/ui";

export const dynamic = "force-dynamic";

/** « Ne plus recevoir ces conseils » : plus aucune relance de l'appli, sans connexion. */
export default async function NurtureOffPage({ params }: { params: Promise<{ token: string }> }) {
  if (!PATIENT_APP_LIVE) notFound();
  const { token } = await params;
  const done = await turnOffNurture(token.slice(0, 2000));
  return (
    <div className="px-4 pt-8">
      <Card>
        <h1 className="text-[18px] font-bold">{done ? "C'est noté" : "Lien expiré"}</h1>
        <p className="mt-2 text-[14px] leading-5 text-[#475569]">
          {done ? "Vous ne recevrez plus nos conseils par e-mail. Votre espace reste ouvert dans l'appli." : "Ce lien n'est plus valide. Écrivez-nous à contact@pharmaboost.app : nous arrêterons les envois."}
        </p>
      </Card>
    </div>
  );
}
