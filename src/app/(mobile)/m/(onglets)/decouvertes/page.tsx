import type { Metadata } from "next";
import { Compass } from "lucide-react";
import { requireUser } from "@/server/auth/user-session";
import { ScreenTitle } from "../../_components/ui";
import { ComingSoonCard, SegmentsPreview } from "../../_components/coming-soon";

export const metadata: Metadata = { title: "Découvertes" };

/**
 * Découvertes et partenaires — construit par l'étape « Découvertes » du chantier mobile, dans
 * `decouvertes/_components`. Schéma prêt : PartnerLaunch, UserFavorite, PartnerInfoRequest (consentement explicite),
 * SponsoredCampaign et SponsoredCampaignDailyStat (compteurs agrégés, sans personne).
 */
export default async function DecouvertesPage() {
  await requireUser();
  return (
    <div className="space-y-5">
      <ScreenTitle title="Découvertes" subtitle="Les nouveautés des laboratoires, vérifiées avant publication." />
      <SegmentsPreview segments={["À la une", "Marques", "Favoris"]} />
      <ComingSoonCard
        icon={<Compass className="size-6" aria-hidden="true" />}
        title="Les nouveautés des marques, sans le bruit"
        body="Chaque information est relue et validée sur le plan réglementaire avant d'apparaître. Un contenu sponsorisé est toujours signalé comme tel."
        items={["Lancements et nouvelles gammes, en image et en vidéo", "Les fiches des marques partenaires", "Vos favoris, pour retrouver une gamme au comptoir", "« Être recontacté » : rien n'est transmis sans votre accord explicite"]}
      />
    </div>
  );
}
