import type { Metadata } from "next";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listCampaigns } from "@/server/services/partner-emails";
import { UNIVERSES } from "@/config/universes";
import { PartnerEmailsPanel } from "./panel";

export const metadata: Metadata = { title: "E-mails patients · Partenaires" };

export const dynamic = "force-dynamic";

/**
 * Les e-mails partenaires aux patients (17 oct. 2026) : les patients qui l'ont accepté depuis leur bilan reçoivent les offres des marques
 * partenaires correspondant à leurs achats, avec un lien d'affiliation (PharmaBoost touche une commission). Au plus un par semaine
 * et par patient ; jamais de médicament.
 */
export default async function PartnerEmailsPage({ searchParams }: { searchParams: Promise<{ marque?: string }> }) {
  const { marque } = await searchParams;
  await requirePlatformSession();
  const data = await listCampaigns();
  return (
    <PartnerEmailsPanel
      initialBrandId={typeof marque === "string" ? marque.slice(0, 40) : ""}
      consents={data.consents}
      brands={data.brands.map((brand) => ({ id: brand.id, name: brand.name }))}
      universes={UNIVERSES.filter((universe) => universe.key !== "VETERINAIRE").map((universe) => ({ key: universe.key, label: universe.label }))}
      campaigns={data.campaigns.map((c) => ({ ...c, sentAt: c.sentAt ? c.sentAt.toISOString() : null, createdAt: c.createdAt.toISOString() }))}
    />
  );
}
