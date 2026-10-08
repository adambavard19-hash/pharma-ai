import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { loadCampaign } from "@/server/services/admin/campaigns";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { WizardScreen } from "../../wizard-screen";
import { campaignStatusLabel } from "../../view";

export const metadata: Metadata = { title: "Modifier la campagne" };

/** L'envoi part aussi d'ici : voir la page de création. */
export const maxDuration = 60;

/** Modifier un brouillon ou une campagne programmée. Une campagne partie, terminée ou annulée ne se modifie plus. */
export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlatformSession();
  const { id } = await params;
  const campaign = await loadCampaign(id);
  if (!campaign) notFound();

  if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") {
    return (
      <>
        <AdminPageHeader space={{ label: "Gestion", href: "/admin/conseils" }} parent={{ label: "Campagnes", href: "/admin/campagnes" }} title="Modifier la campagne" />
        <Alert
          tone="warning"
          title={`Cette campagne n'est plus modifiable : ${campaignStatusLabel(campaign).label.toLowerCase()}`}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/campagnes/${campaign.id}`}>Voir la campagne</Link>
            </Button>
          }
        >
          Seul un brouillon, ou une campagne programmée, se modifie : le message déjà envoyé, lui, ne change plus.
        </Alert>
      </>
    );
  }

  return <WizardScreen campaign={{ ...campaign, status: campaign.status }} adminEmail={session.admin.email} />;
}
