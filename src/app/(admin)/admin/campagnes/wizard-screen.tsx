import Link from "next/link";
import { getMessagingProvider } from "@/server/ai/registry";
import { activeReferralOffer } from "@/server/services/referral-offers";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { calendarDay } from "@/core/challenges/dates";
import { TIME_ZONE } from "@/config/constants";
import { loadSelectionOptions } from "./loaders";
import { CampaignWizard, type WizardCampaign } from "./wizard";
import { parseAudienceParams, stateFromCampaign } from "./wizard-logic";

type EditableCampaign = Parameters<typeof stateFromCampaign>[0] & { id: string; status: "DRAFT" | "SCHEDULED"; scheduledFor: Date | null };

/**
 * L'écran de l'assistant, commun à la création et à la modification : l'en-tête,
 * puis l'assistant avec ce que le serveur sait (officines et partenaires à
 * choisir, état de la messagerie, offre de parrainage en cours). La session est
 * exigée par la page qui l'appelle.
 */
export async function WizardScreen({ campaign, adminEmail }: { campaign: EditableCampaign | null; adminEmail: string }) {
  const now = new Date();
  const selected = campaign ? parseAudienceParams(campaign.audienceParams) : { pharmacyIds: [], partnerIds: [] };
  const [options, offer] = await Promise.all([loadSelectionOptions(selected), activeReferralOffer(now)]);

  const wizardCampaign: WizardCampaign | null = campaign
    ? { id: campaign.id, status: campaign.status, scheduledOn: campaign.scheduledFor ? calendarDay(campaign.scheduledFor, TIME_ZONE) : null, state: stateFromCampaign(campaign) }
    : null;

  return (
    <>
      <AdminPageHeader
        space={{ label: "Communication", href: "/admin/communications" }}
        parent={{ label: "Campagnes", href: "/admin/campagnes" }}
        title={campaign ? "Modifier la campagne" : "Nouvelle campagne"}
        description="Une étape à la fois. Un brouillon ne contacte personne : rien ne part avant la confirmation de la dernière étape."
        actions={
          <Button asChild variant="ghost" size="md">
            <Link href={campaign ? `/admin/campagnes/${campaign.id}` : "/admin/campagnes"}>Quitter</Link>
          </Button>
        }
      />
      <CampaignWizard
        campaign={wizardCampaign}
        pharmacies={options.pharmacies}
        partners={options.partners}
        truncated={options.truncated}
        // Aucun secret : seulement « la messagerie envoie-t-elle réellement ? ».
        messagingLive={getMessagingProvider().info.capability === "LIVE"}
        adminEmail={adminEmail}
        activeOffer={offer ? { label: offer.label, amountCents: offer.amountCents, endsAt: offer.endsAt ? offer.endsAt.toISOString() : null } : null}
        nowIso={now.toISOString()}
      />
    </>
  );
}
