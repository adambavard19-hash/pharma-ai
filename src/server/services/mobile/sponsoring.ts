import "server-only";
import { prisma } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma";
import { brandVisibleTo, partnerInPeriod, type DiscoverViewer } from "@/core/discover/visibility";
import { audienceMatches, campaignIsLive, SPONSORED_FORMAT_LABELS, type SponsoredPlacement } from "@/core/sponsoring/campaign";
import { DedupeMemory, EVENT_COLUMN, dedupeKey, statDay, type SponsoredEvent } from "@/core/sponsoring/stats";
import { isLaunchRowLive, safeHttps } from "./discover";

/**
 * Les emplacements sponsorisés de PharmaBoost Mobile (Accueil, Découvertes, Formations) et leurs compteurs.
 *
 * Une campagne n'apparaît que diffusable (`campaignIsLive` : active, dans sa période, validée sur le plan
 * réglementaire), pour une personne qui voit la marque (préférences de l'officine comprises) et du public visé. Ce
 * qu'elle met en avant (nouveauté, parcours) doit lui-même être en ligne. Toujours signalée « Sponsorisé ».
 *
 * Les compteurs n'écrivent AUCUNE identité : +1 sur la ligne (campagne, emplacement, jour). Le dédoublonnage par
 * session se fait sur une empreinte gardée en mémoire (voir `core/sponsoring/stats`).
 */

export type SponsoredCard = {
  campaignId: string;
  placement: SponsoredPlacement;
  formatLabel: string;
  title: string;
  summary: string | null;
  imageUrl: string | null;
  brandName: string | null;
  brandLogoUrl: string | null;
  partnerName: string;
  /** Où mène la carte ; porte la campagne et l'emplacement pour compter la vue de détail. */
  href: string;
  /** Une nouveauté mise en avant (pour ne pas la montrer deux fois dans le même fil). */
  launchId: string | null;
};

export type SlotViewer = {
  viewer: DiscoverViewer;
  profession: string | null;
  role: string | null;
};

const CAMPAIGN_SELECT = {
  id: true,
  name: true,
  format: true,
  placements: true,
  audiences: true,
  status: true,
  startsAt: true,
  endsAt: true,
  regulatoryCategory: true,
  regulatoryReviewedBy: true,
  regulatoryReviewedAt: true,
  partner: { select: { id: true, name: true, status: true, startsAt: true, endsAt: true, logoUrl: true } },
  brand: { select: { id: true, slug: true, name: true, logoUrl: true, description: true, universes: true, status: true, audience: true } },
  launch: {
    select: {
      id: true,
      title: true,
      summary: true,
      posterUrl: true,
      mediaUrl: true,
      universe: true,
      brandId: true,
      reviewStatus: true,
      publishedAt: true,
      endsAt: true,
      regulatoryCategory: true,
      regulatoryValidatedBy: true,
      regulatoryValidatedAt: true,
      regulatoryMentions: true,
    },
  },
  module: { select: { id: true, slug: true, title: true, summary: true, coverUrl: true, reviewStatus: true, isActive: true, isFreeAccess: true } },
} satisfies Prisma.SponsoredCampaignSelect;

type CampaignRow = Prisma.SponsoredCampaignGetPayload<{ select: typeof CAMPAIGN_SELECT }>;

export function withCampaign(href: string, campaignId: string, placement: SponsoredPlacement): string {
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}c=${encodeURIComponent(campaignId)}&p=${placement}`;
}

function cardOf(row: CampaignRow, placement: SponsoredPlacement): SponsoredCard | null {
  const brandName = row.brand?.name ?? null;
  const brandLogoUrl = safeHttps(row.brand?.logoUrl ?? row.partner.logoUrl);
  const base = { campaignId: row.id, placement, formatLabel: SPONSORED_FORMAT_LABELS[row.format], brandName, brandLogoUrl, partnerName: row.partner.name };
  if (row.launch) {
    return {
      ...base,
      title: row.launch.title,
      summary: row.launch.summary,
      imageUrl: safeHttps(row.launch.posterUrl),
      href: withCampaign(`/m/decouvertes/nouveautes/${row.launch.id}`, row.id, placement),
      launchId: row.launch.id,
    };
  }
  if (row.module) {
    return { ...base, title: row.module.title, summary: row.module.summary, imageUrl: safeHttps(row.module.coverUrl), href: withCampaign("/m/formations", row.id, placement), launchId: null };
  }
  if (row.brand) {
    return { ...base, title: row.brand.name, summary: row.brand.description, imageUrl: null, href: withCampaign(`/m/decouvertes/marques/${row.brand.slug}`, row.id, placement), launchId: null };
  }
  return null;
}

/** Une campagne est-elle montrable à CETTE personne, dans CET emplacement, maintenant ? */
export function campaignShowable(row: CampaignRow, placement: SponsoredPlacement, who: SlotViewer, now: Date, universe: string | null = null): boolean {
  if (!row.placements.includes(placement)) return false;
  if (!campaignIsLive({ ...row, placements: row.placements }, now)) return false;
  if (!audienceMatches(row.audiences, who.profession, who.role)) return false;
  if (!partnerInPeriod(row.partner, now)) return false;
  if (row.brand) {
    const visible = brandVisibleTo({ id: row.brand.id, status: row.brand.status, audience: row.brand.audience, partnerStatus: row.partner.status, partnerInPeriod: true }, who.viewer);
    if (!visible) return false;
  } else if (row.partner.status !== "ACTIVE") {
    return false;
  }
  if (row.launch && !isLaunchRowLive(row.launch, now)) return false;
  if (row.launch && row.brand && row.launch.brandId !== row.brand.id) return false;
  if (row.module) {
    if (!row.module.isActive || row.module.reviewStatus !== "APPROVED") return false;
    if (who.viewer.kind === "community" && !row.module.isFreeAccess) return false;
  }
  if (placement === "DISCOVER_CATEGORY") {
    if (!universe) return false;
    const universes = [row.launch?.universe, ...(row.brand?.universes ?? [])].filter(Boolean);
    if (!universes.includes(universe)) return false;
  }
  return true;
}

/**
 * Les cartes sponsorisées d'un emplacement. Point d'entrée commun à tous les onglets : l'Académie l'appelle pour
 * TRAINING_FEED / TRAINING_MODULE (`loadSponsoredSlot("TRAINING_FEED", who)`), et affiche les cartes avec le
 * composant `SponsoredImpression` (`decouvertes/_components/sponsored-tracker.tsx`).
 */
export async function loadSponsoredSlot(placement: SponsoredPlacement, who: SlotViewer, options: { now?: Date; universe?: string | null; limit?: number } = {}): Promise<SponsoredCard[]> {
  const now = options.now ?? new Date();
  const rows = await prisma.sponsoredCampaign.findMany({
    where: { status: "ACTIVE", placements: { has: placement }, startsAt: { lte: now }, endsAt: { gt: now }, regulatoryReviewedAt: { not: null } },
    orderBy: [{ startsAt: "desc" }, { createdAt: "asc" }],
    take: 40,
    select: CAMPAIGN_SELECT,
  });
  const cards: SponsoredCard[] = [];
  for (const row of rows) {
    if (!campaignShowable(row, placement, who, now, options.universe ?? null)) continue;
    const card = cardOf(row, placement);
    if (card) cards.push(card);
    if (cards.length >= (options.limit ?? 3)) break;
  }
  return cards;
}

// ---------------------------------------------------------------------------
// Compteurs
// ---------------------------------------------------------------------------

const memory = new DedupeMemory();

/**
 * Compte des événements venus de l'écran. Chacun n'est compté qu'une fois par session et par jour, et seulement pour
 * une campagne diffusable dans cet emplacement (on ne gonfle pas une campagne en pause ou terminée). `sessionSecret`
 * sert à l'empreinte de dédoublonnage, jamais stockée.
 */
export async function recordSponsoredEvents(events: SponsoredEvent[], sessionSecret: string, now = new Date()): Promise<number> {
  if (events.length === 0) return 0;
  const ids = [...new Set(events.map((event) => event.campaignId))];
  const campaigns = await prisma.sponsoredCampaign.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, startsAt: true, endsAt: true, placements: true, regulatoryCategory: true, regulatoryReviewedBy: true, regulatoryReviewedAt: true },
  });
  const byId = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  const day = statDay(now);
  let counted = 0;
  for (const event of events) {
    const campaign = byId.get(event.campaignId);
    if (!campaign || !campaign.placements.includes(event.placement) || !campaignIsLive(campaign, now)) continue;
    if (!memory.firstTime(dedupeKey(sessionSecret, event, day), now.getTime())) continue;
    await incrementStat(event, day);
    counted++;
  }
  return counted;
}

async function incrementStat(event: SponsoredEvent, day: Date): Promise<void> {
  const column = EVENT_COLUMN[event.kind];
  await prisma.sponsoredCampaignDailyStat.upsert({
    where: { campaignId_placement_day: { campaignId: event.campaignId, placement: event.placement, day } },
    create: { campaignId: event.campaignId, placement: event.placement, day, [column]: 1 },
    update: { [column]: { increment: 1 } },
  });
}

/**
 * Pour l'Académie : une formation a été commencée ou terminée. Si un parcours parrainé (campagne PROGRAMME_FORMATION
 * diffusable) contient ce contenu, ou en est le parcours, le compteur de la campagne avance, sans identité. Appeler
 * avec la session (empreinte de dédoublonnage) ; ne lève jamais.
 */
export async function recordSponsoredTrainingEvent(input: { contentId?: string | null; moduleId?: string | null; kind: "training_started" | "training_completed"; sessionSecret: string; now?: Date }): Promise<void> {
  try {
    const now = input.now ?? new Date();
    const moduleIds = new Set<string>();
    if (input.moduleId) moduleIds.add(input.moduleId);
    if (input.contentId) {
      const items = await prisma.trainingModuleItem.findMany({ where: { contentId: input.contentId }, select: { moduleId: true } });
      items.forEach((item) => moduleIds.add(item.moduleId));
    }
    if (moduleIds.size === 0) return;
    const campaigns = await prisma.sponsoredCampaign.findMany({
      where: { status: "ACTIVE", moduleId: { in: [...moduleIds] }, startsAt: { lte: now }, endsAt: { gt: now } },
      select: { id: true, placements: true },
    });
    const events: SponsoredEvent[] = campaigns.map((campaign) => ({
      kind: input.kind,
      campaignId: campaign.id,
      placement: campaign.placements.includes("TRAINING_MODULE") ? "TRAINING_MODULE" : campaign.placements.includes("TRAINING_FEED") ? "TRAINING_FEED" : campaign.placements[0],
    }));
    await recordSponsoredEvents(events.filter((event) => !!event.placement), input.sessionSecret, now);
  } catch {
    // Un compteur ne doit jamais casser une formation.
  }
}

/** Une demande d'information envoyée depuis une campagne : +1 sans identité. */
export async function recordInfoRequestForCampaign(campaignId: string | null, placement: SponsoredPlacement | null, sessionSecret: string, now = new Date()): Promise<void> {
  if (!campaignId || !placement) return;
  await recordSponsoredEvents([{ kind: "info_request", campaignId, placement }], sessionSecret, now).catch(() => 0);
}

/**
 * Une page de détail ouverte depuis une campagne (`?c=…&p=…`) : la campagne existe-t-elle, est-elle diffusable, et
 * porte-t-elle bien sur CE contenu ? Sinon, rien (ni étiquette « Sponsorisé », ni vue comptée).
 */
export async function campaignForDetail(campaignId: unknown, placement: unknown, target: { brandId?: string; launchId?: string }, now = new Date()): Promise<{ campaignId: string; placement: SponsoredPlacement; partnerName: string } | null> {
  if (typeof campaignId !== "string" || !/^[a-z0-9]{8,40}$/i.test(campaignId) || typeof placement !== "string") return null;
  const row = await prisma.sponsoredCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, status: true, startsAt: true, endsAt: true, placements: true, regulatoryCategory: true, regulatoryReviewedBy: true, regulatoryReviewedAt: true, brandId: true, launchId: true, partner: { select: { name: true } } },
  });
  if (!row || !campaignIsLive(row, now)) return null;
  const match = row.placements.find((entry) => entry === placement);
  if (!match) return null;
  if (target.launchId && row.launchId !== target.launchId) return null;
  if (target.brandId && row.brandId !== target.brandId) return null;
  return { campaignId: row.id, placement: match, partnerName: row.partner.name };
}
