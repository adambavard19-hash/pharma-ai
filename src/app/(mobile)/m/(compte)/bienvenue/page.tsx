import type { Metadata } from "next";
import { requireUser } from "@/server/auth/user-session";
import { currentConsents } from "@/server/services/mobile/consents";
import { AuthFrame } from "../../_components/auth-frame";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Bienvenue" };

/**
 * Le premier passage, une fois : confirmer son profil et choisir ses accords. Après l'inscription comme après la
 * première connexion d'un collaborateur d'officine. On peut y revenir (les valeurs sont pré-remplies), mais les
 * onglets n'y renvoient plus une fois `mobileOnboardedAt` posé.
 */
export default async function WelcomePage() {
  const session = await requireUser();
  const consents = await currentConsents(session.user.id);
  const where = session.activePharmacy ? `Vous êtes dans l'équipe de ${session.activePharmacy.name}${session.roleLabel ? ` (${session.roleLabel.toLowerCase()})` : ""}.` : "Votre compte gratuit est prêt.";

  return (
    <AuthFrame title={`Bienvenue, ${session.user.firstName} !`} subtitle={where}>
      <div className="space-y-1">
        <h2 className="text-[22px] font-bold tracking-[-0.025em] text-ink-950">Faisons connaissance</h2>
        <p className="text-[14px] text-text-secondary">Votre métier oriente les formations proposées. Tout se modifie ensuite dans « Mon espace ».</p>
      </div>
      <WelcomeForm
        isClientStaff={session.isClientStaff}
        defaults={{
          firstName: session.user.firstName,
          lastName: session.user.lastName,
          profession: session.user.profession,
          rpps: session.user.rppsDeclared ?? "",
          pharmacyName: session.user.declaredPharmacyName ?? "",
          news: consents.PHARMABOOST_NEWS.granted,
          partners: consents.PARTNER_COMMUNICATIONS.granted,
        }}
      />
    </AuthFrame>
  );
}
