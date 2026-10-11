import "server-only";
import type { TenantScope } from "@/server/db/tenant";
import { discoverViewerFor, liveLaunchesFor } from "./discover";
import { loadSponsoredSlot } from "./sponsoring";
import type { SponsoredPlacement } from "@/core/sponsoring/campaign";

/**
 * « Nouveautés partenaires » de l'accueil : d'abord les campagnes sponsorisées de l'accueil (HOME_HERO puis
 * HOME_FEED), signalées « Sponsorisé », puis les nouveautés publiées des marques, signalées « Partenaire ». Une
 * nouveauté déjà mise en avant par une campagne n'est pas répétée.
 */

export type PartnerNewsItem = {
  key: string;
  title: string;
  summary: string | null;
  brandName: string;
  posterUrl: string | null;
  publishedAt: Date | null;
  href: string;
  label: "Sponsorisé" | "Partenaire";
  /** Présent pour une carte sponsorisée : elle compte ses impressions et ses clics. */
  sponsored: { campaignId: string; placement: SponsoredPlacement } | null;
};

export type HomeViewer = {
  scope: Pick<TenantScope, "pharmacyId"> | null;
  user?: { profession: string | null } | null;
  role?: string | null;
};

export async function loadPartnerNews(now: Date, who: HomeViewer | null, limit: number): Promise<PartnerNewsItem[]> {
  const viewer = await discoverViewerFor({ scope: who?.scope ?? null });
  const slotViewer = { viewer, profession: who?.user?.profession ?? null, role: who?.role ?? null };
  const [hero, feed, launches] = await Promise.all([
    loadSponsoredSlot("HOME_HERO", slotViewer, { now, limit: 1 }),
    loadSponsoredSlot("HOME_FEED", slotViewer, { now, limit: 3 }),
    liveLaunchesFor(viewer, now, { take: limit + 6 }),
  ]);

  const items: PartnerNewsItem[] = [];
  const shownLaunches = new Set<string>();
  const shownCampaigns = new Set<string>();
  for (const card of [...hero, ...feed]) {
    if (shownCampaigns.has(card.campaignId)) continue;
    shownCampaigns.add(card.campaignId);
    if (card.launchId) shownLaunches.add(card.launchId);
    items.push({
      key: `c:${card.campaignId}`,
      title: card.title,
      summary: card.summary,
      brandName: card.brandName ?? card.partnerName,
      posterUrl: card.imageUrl,
      publishedAt: null,
      href: card.href,
      label: "Sponsorisé",
      sponsored: { campaignId: card.campaignId, placement: card.placement },
    });
  }
  for (const launch of launches) {
    if (shownLaunches.has(launch.id)) continue;
    items.push({
      key: `l:${launch.id}`,
      title: launch.title,
      summary: launch.summary,
      brandName: launch.brandName,
      posterUrl: launch.posterUrl,
      publishedAt: launch.publishedAt,
      href: `/m/decouvertes/nouveautes/${launch.id}`,
      label: "Partenaire",
      sponsored: null,
    });
  }
  return items.slice(0, limit);
}
