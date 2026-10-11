import "server-only";
import { prisma } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma";
import type { TenantScope } from "@/server/db/tenant";
import { brandVisibleTo, launchIsLive, partnerInPeriod, rangeVisibleTo, type DiscoverViewer } from "@/core/discover/visibility";
import { matchesSearch, type FavoriteType } from "@/core/discover/content";
import { videoEmbed } from "@/core/training/video";
import { universeLabel } from "@/config/universes";
import { formatDuration } from "@/core/training/content";
import { mobileVisibleTrainingWhere } from "./home";

/**
 * L'onglet Découvertes de PharmaBoost Mobile : marques, nouveautés, vidéos, formations des laboratoires, favoris.
 *
 * Tout ce qui s'affiche passe par la règle de `core/discover/visibility` : le compte gratuit ne voit que les marques
 * actives diffusées à toutes les officines ; le collaborateur d'une officine cliente, ce que la règle centrale laisse
 * passer pour SON officine (lue depuis la session), moins ce que l'officine a masqué ou refusé. Rien ici ne lit ni
 * n'écrit de donnée patient, et rien n'est lu par le moteur de conseil.
 */

export type ViewerSession = {
  scope: Pick<TenantScope, "pharmacyId"> | null;
};

/** Le public de la personne connectée : depuis la session, jamais depuis un paramètre. */
export async function discoverViewerFor(session: ViewerSession): Promise<DiscoverViewer> {
  if (!session.scope) return { kind: "community" };
  const pharmacyId = session.scope.pharmacyId;
  const [pharmacy, audiences, preferences] = await Promise.all([
    prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { partnerPilot: true } }),
    prisma.partnerBrandAudience.findMany({ where: { pharmacyId }, select: { brandId: true } }),
    prisma.pharmacyPartnerPreference.findMany({ where: { pharmacyId }, select: { brandId: true, choice: true } }),
  ]);
  return {
    kind: "staff",
    pharmacyId,
    pilot: pharmacy?.partnerPilot ?? false,
    selectedBrandIds: new Set(audiences.map((row) => row.brandId)),
    preferences: new Map(preferences.map((row) => [row.brandId, row.choice])),
  };
}

/** L'adresse d'un contenu de l'Académie dans l'application (onglet Formations). */
export function trainingHref(contentId: string): string {
  return `/m/formations/${contentId}`;
}

// ---------------------------------------------------------------------------
// Lectures de base
// ---------------------------------------------------------------------------

const LIVE_STATUSES = ["TEST", "ACTIVE"] as const;

const BRAND_SELECT = {
  id: true,
  slug: true,
  name: true,
  logoUrl: true,
  description: true,
  universes: true,
  status: true,
  audience: true,
  partner: { select: { id: true, name: true, logoUrl: true, website: true, status: true, startsAt: true, endsAt: true } },
  ranges: { select: { name: true, universe: true, status: true } },
  products: { where: { isActive: true }, select: { name: true } },
} satisfies Prisma.PartnerBrandSelect;

type BrandRow = Prisma.PartnerBrandGetPayload<{ select: typeof BRAND_SELECT }>;

export type BrandSummary = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  description: string | null;
  partnerId: string;
  partnerName: string;
  universes: string[];
  universeLabels: string[];
  rangeCount: number;
  productCount: number;
};

function brandFacts(brand: Pick<BrandRow, "id" | "status" | "audience" | "partner">, now: Date) {
  return { id: brand.id, status: brand.status, audience: brand.audience, partnerStatus: brand.partner.status, partnerInPeriod: partnerInPeriod(brand.partner, now) };
}

function summarize(brand: BrandRow, viewer: DiscoverViewer): BrandSummary {
  const ranges = brand.ranges.filter((range) => rangeVisibleTo(range.status, viewer));
  const universes = [...new Set([...brand.universes, ...ranges.map((range) => range.universe).filter((u): u is string => !!u)])];
  return {
    id: brand.id,
    slug: brand.slug,
    name: brand.name,
    logoUrl: brand.logoUrl ?? brand.partner.logoUrl,
    description: brand.description,
    partnerId: brand.partner.id,
    partnerName: brand.partner.name,
    universes,
    universeLabels: universes.map((u) => universeLabel(u)),
    rangeCount: ranges.length,
    productCount: brand.products.length,
  };
}

/** Les marques que cette personne peut voir, avec ce qu'il faut pour chercher dedans. */
async function visibleBrandRows(viewer: DiscoverViewer, now: Date): Promise<BrandRow[]> {
  const rows = await prisma.partnerBrand.findMany({
    where: { status: { in: [...LIVE_STATUSES] }, partner: { status: { in: [...LIVE_STATUSES] } } },
    orderBy: { name: "asc" },
    select: BRAND_SELECT,
  });
  return rows.filter((brand) => brandVisibleTo(brandFacts(brand, now), viewer));
}

export async function visibleBrandIds(viewer: DiscoverViewer, now = new Date()): Promise<Set<string>> {
  return new Set((await visibleBrandRows(viewer, now)).map((brand) => brand.id));
}

const LAUNCH_SELECT = {
  id: true,
  title: true,
  summary: true,
  body: true,
  mediaUrl: true,
  posterUrl: true,
  orientation: true,
  universe: true,
  regulatoryCategory: true,
  regulatoryMentions: true,
  regulatoryValidatedBy: true,
  regulatoryValidatedAt: true,
  reviewStatus: true,
  publishedAt: true,
  endsAt: true,
  productCodes: true,
  brandId: true,
  brand: { select: { id: true, slug: true, name: true, logoUrl: true, universes: true, partner: { select: { id: true, name: true } } } },
} satisfies Prisma.PartnerLaunchSelect;

type LaunchRow = Prisma.PartnerLaunchGetPayload<{ select: typeof LAUNCH_SELECT }>;

/** Ce que la base peut déjà écarter ; le reste est jugé par `launchIsLive`. */
export function liveLaunchWhere(now: Date): Prisma.PartnerLaunchWhereInput {
  return {
    reviewStatus: "APPROVED",
    regulatoryValidatedAt: { not: null },
    regulatoryValidatedBy: { not: null },
    publishedAt: { lte: now },
    OR: [{ endsAt: null }, { endsAt: { gt: now } }],
  };
}

export function isLaunchRowLive(row: Pick<LaunchRow, "reviewStatus" | "publishedAt" | "endsAt" | "regulatoryCategory" | "regulatoryValidatedBy" | "regulatoryValidatedAt" | "regulatoryMentions">, now: Date): boolean {
  return launchIsLive(
    {
      reviewStatus: row.reviewStatus,
      publishedAt: row.publishedAt,
      endsAt: row.endsAt,
      regulatoryCategory: row.regulatoryCategory,
      validatedBy: row.regulatoryValidatedBy,
      validatedAt: row.regulatoryValidatedAt,
      mentions: row.regulatoryMentions,
    },
    now,
  );
}

export type MediaKind = "embed" | "video" | "image" | null;

export type LaunchSummary = {
  id: string;
  title: string;
  summary: string | null;
  posterUrl: string | null;
  mediaKind: MediaKind;
  brandId: string;
  brandSlug: string;
  brandName: string;
  brandLogoUrl: string | null;
  partnerName: string;
  universe: string | null;
  universeLabel: string | null;
  publishedAt: Date | null;
  regulatoryCategory: LaunchRow["regulatoryCategory"];
};

const VIDEO_FILE = /\.(mp4|webm|m4v|mov)(\?|#|$)/i;
const IMAGE_FILE = /\.(png|jpe?g|webp|gif|avif|svg)(\?|#|$)/i;

/** Une adresse https uniquement : on n'affiche jamais un média en clair (http) ni un schéma inconnu. */
export function safeHttps(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function mediaKindOf(mediaUrl: string | null): MediaKind {
  const url = safeHttps(mediaUrl);
  if (!url) return null;
  if (videoEmbed(url)) return "embed";
  if (VIDEO_FILE.test(url)) return "video";
  if (IMAGE_FILE.test(url)) return "image";
  return null;
}

function launchSummary(row: LaunchRow): LaunchSummary {
  const mediaKind = mediaKindOf(row.mediaUrl);
  const poster = safeHttps(row.posterUrl) ?? (mediaKind === "image" ? safeHttps(row.mediaUrl) : null);
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    posterUrl: poster,
    mediaKind,
    brandId: row.brand.id,
    brandSlug: row.brand.slug,
    brandName: row.brand.name,
    brandLogoUrl: safeHttps(row.brand.logoUrl),
    partnerName: row.brand.partner.name,
    universe: row.universe,
    universeLabel: row.universe ? universeLabel(row.universe) : null,
    publishedAt: row.publishedAt,
    regulatoryCategory: row.regulatoryCategory,
  };
}

/** Les nouveautés en ligne, des marques visibles pour cette personne (les plus récentes d'abord). */
export async function liveLaunchesFor(viewer: DiscoverViewer, now: Date, options: { brandIds?: Set<string>; brandId?: string; take?: number } = {}): Promise<LaunchSummary[]> {
  const brandIds = options.brandIds ?? (await visibleBrandIds(viewer, now));
  const rows = await prisma.partnerLaunch.findMany({
    where: { ...liveLaunchWhere(now), brandId: options.brandId ?? { in: [...brandIds] } },
    orderBy: { publishedAt: "desc" },
    take: options.take ?? 60,
    select: LAUNCH_SELECT,
  });
  return rows.filter((row) => brandIds.has(row.brandId) && isLaunchRowLive(row, now)).map(launchSummary);
}

export type TrainingSummary = {
  id: string;
  title: string;
  summary: string | null;
  kindLabel: string;
  durationLabel: string | null;
  posterUrl: string | null;
  partnerId: string | null;
  partnerName: string | null;
  isSponsored: boolean;
  authorName: string | null;
  reviewedAt: Date | null;
  universe: string | null;
  href: string;
};

const KIND_WORDS: Record<string, string> = { VIDEO: "Vidéo", MICRO_VIDEO: "Micro-vidéo", SHEET: "Fiche", DOCUMENT: "Document", EXTERNAL_LINK: "Lien officiel", QUIZ: "Quiz" };

/**
 * Les formations proposées par des laboratoires (TrainingContent.partnerId), telles que l'Académie les publie : relues,
 * actives, ouvertes à ce public. Lecture seule : l'Académie reste maîtresse de ses contenus.
 */
export async function partnerTrainingsFor(viewer: DiscoverViewer, scope: Pick<TenantScope, "pharmacyId"> | null, now: Date, options: { partnerIds: Set<string>; take?: number }): Promise<TrainingSummary[]> {
  if (options.partnerIds.size === 0) return [];
  return trainingSummaries({ partnerId: { in: [...options.partnerIds] } }, scope, now, options.take ?? 30);
}

/** Des contenus de l'Académie visibles pour ce public, par identifiant (favoris). */
export async function trainingsByIds(ids: string[], scope: Pick<TenantScope, "pharmacyId"> | null, now: Date): Promise<TrainingSummary[]> {
  if (ids.length === 0) return [];
  return trainingSummaries({ id: { in: ids } }, scope, now, ids.length);
}

async function trainingSummaries(where: Prisma.TrainingContentWhereInput, scope: Pick<TenantScope, "pharmacyId"> | null, now: Date, take: number): Promise<TrainingSummary[]> {
  const rows = await prisma.trainingContent.findMany({
    where: { AND: [mobileVisibleTrainingWhere(scope, now), where] },
    orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take,
    select: {
      id: true,
      title: true,
      summary: true,
      kind: true,
      durationMinutes: true,
      durationSeconds: true,
      posterUrl: true,
      isSponsored: true,
      authorName: true,
      reviewedAt: true,
      universe: true,
      laboratory: true,
      partner: { select: { id: true, name: true, status: true } },
    },
  });
  return rows
    // Un contenu de laboratoire dont le partenaire n'est plus en ligne ne s'affiche plus ici.
    .filter((row) => !row.partner || row.partner.status === "ACTIVE" || row.partner.status === "TEST")
    .map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      kindLabel: KIND_WORDS[row.kind] ?? "Formation",
      durationLabel: row.durationSeconds ? (row.durationSeconds < 90 ? `${row.durationSeconds} s` : formatDuration(Math.round(row.durationSeconds / 60))) : formatDuration(row.durationMinutes),
      posterUrl: safeHttps(row.posterUrl),
      partnerId: row.partner?.id ?? null,
      partnerName: row.partner?.name ?? row.laboratory ?? null,
      isSponsored: row.isSponsored,
      authorName: row.authorName,
      reviewedAt: row.reviewedAt,
      universe: row.universe,
      href: trainingHref(row.id),
    }));
}

// ---------------------------------------------------------------------------
// L'onglet
// ---------------------------------------------------------------------------

export type DiscoverFilters = { query: string; universe: string | null };

export type DiscoverFeed = {
  brands: BrandSummary[];
  launches: LaunchSummary[];
  videos: LaunchSummary[];
  trainings: TrainingSummary[];
  /** Les univers présents dans ce que la personne peut voir (pour les filtres). */
  universes: { key: string; label: string }[];
  favorites: Set<string>;
};

export function favoriteKey(type: FavoriteType, id: string): string {
  return `${type}:${id}`;
}

export async function favoriteKeysOf(userId: string): Promise<Set<string>> {
  const rows = await prisma.userFavorite.findMany({ where: { userId, targetType: { in: ["BRAND", "LAUNCH", "TRAINING", "PRODUCT"] } }, select: { targetType: true, targetId: true } });
  return new Set(rows.map((row) => favoriteKey(row.targetType as FavoriteType, row.targetId)));
}

export async function loadDiscoverFeed(input: { userId: string; viewer: DiscoverViewer; scope: Pick<TenantScope, "pharmacyId"> | null; filters: DiscoverFilters; now?: Date }): Promise<DiscoverFeed> {
  const now = input.now ?? new Date();
  const { query, universe } = input.filters;
  const brandRows = await visibleBrandRows(input.viewer, now);
  const brandIds = new Set(brandRows.map((brand) => brand.id));
  const partnerIds = new Set(brandRows.map((brand) => brand.partner.id));
  const [launches, trainings, favorites] = await Promise.all([
    liveLaunchesFor(input.viewer, now, { brandIds }),
    partnerTrainingsFor(input.viewer, input.scope, now, { partnerIds }),
    favoriteKeysOf(input.userId),
  ]);

  const summaries = brandRows.map((brand) => ({ row: brand, summary: summarize(brand, input.viewer) }));
  const allUniverses = new Set<string>();
  for (const { summary } of summaries) summary.universes.forEach((u) => allUniverses.add(u));
  for (const launch of launches) if (launch.universe) allUniverses.add(launch.universe);

  const brandUniverses = new Map(summaries.map(({ summary }) => [summary.id, summary.universes]));
  const brandMatches = summaries.filter(({ row, summary }) =>
    (!universe || summary.universes.includes(universe)) &&
    matchesSearch(query, [row.name, row.partner.name, row.description, ...row.ranges.filter((r) => rangeVisibleTo(r.status, input.viewer)).map((r) => r.name), ...row.products.map((p) => p.name), ...summary.universeLabels]),
  );
  const launchMatches = launches.filter(
    (launch) =>
      (!universe || launch.universe === universe || (!launch.universe && (brandUniverses.get(launch.brandId) ?? []).includes(universe))) &&
      matchesSearch(query, [launch.title, launch.summary, launch.brandName, launch.partnerName, launch.universeLabel]),
  );
  const trainingMatches = trainings.filter((training) => (!universe || training.universe === universe) && matchesSearch(query, [training.title, training.summary, training.partnerName, training.authorName]));

  return {
    brands: brandMatches.map(({ summary }) => summary),
    launches: launchMatches,
    videos: launchMatches.filter((launch) => launch.mediaKind === "embed" || launch.mediaKind === "video"),
    trainings: trainingMatches,
    universes: [...allUniverses].map((key) => ({ key, label: universeLabel(key) })).sort((a, b) => a.label.localeCompare(b.label, "fr")),
    favorites,
  };
}

// ---------------------------------------------------------------------------
// Une marque
// ---------------------------------------------------------------------------

export type BrandPage = BrandSummary & {
  website: string | null;
  ranges: { id: string; name: string; description: string | null; universeLabel: string | null; products: ProductSummary[] }[];
  /** Produits hors gamme. */
  otherProducts: ProductSummary[];
  launches: LaunchSummary[];
  trainings: TrainingSummary[];
};

export type ProductSummary = { id: string; name: string; description: string | null; imageUrl: string | null; packaging: string | null };

export async function loadBrandPage(input: { viewer: DiscoverViewer; scope: Pick<TenantScope, "pharmacyId"> | null; slug: string; now?: Date }): Promise<BrandPage | null> {
  const now = input.now ?? new Date();
  const brand = await prisma.partnerBrand.findUnique({
    where: { slug: input.slug },
    select: {
      ...BRAND_SELECT,
      ranges: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, description: true, universe: true, status: true } },
      products: { where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, description: true, imageUrl: true, packaging: true, rangeId: true } },
    },
  });
  if (!brand || !brandVisibleTo(brandFacts(brand, now), input.viewer)) return null;

  const ranges = brand.ranges.filter((range) => rangeVisibleTo(range.status, input.viewer));
  const rangeIds = new Set(ranges.map((range) => range.id));
  const product = (row: (typeof brand.products)[number]): ProductSummary => ({ id: row.id, name: row.name, description: row.description, imageUrl: safeHttps(row.imageUrl), packaging: row.packaging });
  const [launches, trainings] = await Promise.all([
    liveLaunchesFor(input.viewer, now, { brandIds: new Set([brand.id]), brandId: brand.id, take: 20 }),
    partnerTrainingsFor(input.viewer, input.scope, now, { partnerIds: new Set([brand.partner.id]), take: 12 }),
  ]);
  const universes = [...new Set([...brand.universes, ...ranges.map((range) => range.universe).filter((u): u is string => !!u)])];

  return {
    id: brand.id,
    slug: brand.slug,
    name: brand.name,
    logoUrl: safeHttps(brand.logoUrl ?? brand.partner.logoUrl),
    description: brand.description,
    partnerId: brand.partner.id,
    partnerName: brand.partner.name,
    universes,
    universeLabels: universes.map((u) => universeLabel(u)),
    rangeCount: ranges.length,
    productCount: brand.products.filter((p) => !p.rangeId || rangeIds.has(p.rangeId)).length,
    website: safeHttps(brand.partner.website),
    ranges: ranges.map((range) => ({
      id: range.id,
      name: range.name,
      description: range.description,
      universeLabel: range.universe ? universeLabel(range.universe) : null,
      products: brand.products.filter((p) => p.rangeId === range.id).map(product),
    })),
    otherProducts: brand.products.filter((p) => !p.rangeId).map(product),
    launches,
    trainings,
  };
}

// ---------------------------------------------------------------------------
// Une nouveauté
// ---------------------------------------------------------------------------

export type LaunchDetail = LaunchSummary & {
  body: string;
  mediaUrl: string | null;
  embedUrl: string | null;
  orientation: LaunchRow["orientation"];
  regulatoryMentions: string | null;
  regulatoryValidatedAt: Date | null;
  products: ProductSummary[];
};

export async function loadLaunchDetail(input: { viewer: DiscoverViewer; id: string; now?: Date }): Promise<LaunchDetail | null> {
  const now = input.now ?? new Date();
  const row = await prisma.partnerLaunch.findUnique({ where: { id: input.id }, select: { ...LAUNCH_SELECT, brand: { select: { ...LAUNCH_SELECT.brand.select, status: true, audience: true, partner: { select: { id: true, name: true, status: true, startsAt: true, endsAt: true } } } } } });
  if (!row || !isLaunchRowLive(row, now)) return null;
  if (!brandVisibleTo({ id: row.brand.id, status: row.brand.status, audience: row.brand.audience, partnerStatus: row.brand.partner.status, partnerInPeriod: partnerInPeriod(row.brand.partner, now) }, input.viewer)) return null;

  const codes = row.productCodes.filter(Boolean);
  const products = codes.length
    ? await prisma.partnerProduct.findMany({
        where: { brandId: row.brandId, isActive: true, OR: [{ ean: { in: codes } }, { cip13: { in: codes } }] },
        select: { id: true, name: true, description: true, imageUrl: true, packaging: true },
        take: 12,
      })
    : [];
  const media = safeHttps(row.mediaUrl);
  return {
    ...launchSummary(row as unknown as LaunchRow),
    body: row.body,
    mediaUrl: media,
    embedUrl: videoEmbed(media)?.embedUrl ?? null,
    orientation: row.orientation,
    regulatoryMentions: row.regulatoryMentions,
    regulatoryValidatedAt: row.regulatoryValidatedAt,
    products: products.map((p) => ({ ...p, imageUrl: safeHttps(p.imageUrl) })),
  };
}

// ---------------------------------------------------------------------------
// Favoris
// ---------------------------------------------------------------------------

export type FavoritesView = {
  brands: BrandSummary[];
  launches: LaunchSummary[];
  trainings: TrainingSummary[];
  products: (ProductSummary & { brandSlug: string; brandName: string })[];
};

/** Les favoris de la personne, relus : ce qui n'est plus visible (marque refusée, nouveauté échue) ne s'affiche plus. */
export async function loadFavorites(input: { userId: string; viewer: DiscoverViewer; scope: Pick<TenantScope, "pharmacyId"> | null; now?: Date }): Promise<FavoritesView> {
  const now = input.now ?? new Date();
  const rows = await prisma.userFavorite.findMany({ where: { userId: input.userId }, orderBy: { createdAt: "desc" }, select: { targetType: true, targetId: true } });
  const ids = (type: string) => rows.filter((row) => row.targetType === type).map((row) => row.targetId);
  const order = (type: string) => new Map(ids(type).map((id, index) => [id, index]));

  const brandRows = await visibleBrandRows(input.viewer, now);
  const brandIds = new Set(brandRows.map((brand) => brand.id));
  const favoriteBrandIds = new Set(ids("BRAND"));
  const launchOrder = order("LAUNCH");
  const trainingOrder = order("TRAINING");

  const [launchRows, trainingRows, productRows] = await Promise.all([
    launchOrder.size ? prisma.partnerLaunch.findMany({ where: { id: { in: [...launchOrder.keys()] }, ...liveLaunchWhere(now) }, select: LAUNCH_SELECT }) : Promise.resolve([]),
    trainingsByIds([...trainingOrder.keys()], input.scope, now),
    ids("PRODUCT").length
      ? prisma.partnerProduct.findMany({
          where: { id: { in: ids("PRODUCT") }, isActive: true, brandId: { in: [...brandIds] } },
          select: { id: true, name: true, description: true, imageUrl: true, packaging: true, brand: { select: { slug: true, name: true } }, range: { select: { status: true } } },
        })
      : Promise.resolve([]),
  ]);

  return {
    brands: brandRows.filter((brand) => favoriteBrandIds.has(brand.id)).map((brand) => summarize(brand, input.viewer)),
    launches: launchRows
      .filter((row) => brandIds.has(row.brandId) && isLaunchRowLive(row, now))
      .sort((a, b) => (launchOrder.get(a.id) ?? 0) - (launchOrder.get(b.id) ?? 0))
      .map(launchSummary),
    trainings: trainingRows.filter((t) => trainingOrder.has(t.id)).sort((a, b) => (trainingOrder.get(a.id) ?? 0) - (trainingOrder.get(b.id) ?? 0)),
    products: productRows
      .filter((row) => !row.range || rangeVisibleTo(row.range.status, input.viewer))
      .map((row) => ({ id: row.id, name: row.name, description: row.description, imageUrl: safeHttps(row.imageUrl), packaging: row.packaging, brandSlug: row.brand.slug, brandName: row.brand.name })),
  };
}

/** Une cible de favori existe-t-elle ET est-elle visible pour cette personne ? (On n'enregistre rien d'invisible.) */
export async function favoriteTargetVisible(viewer: DiscoverViewer, scope: Pick<TenantScope, "pharmacyId"> | null, type: FavoriteType, id: string, now = new Date()): Promise<boolean> {
  if (type === "BRAND") {
    const brand = await prisma.partnerBrand.findUnique({ where: { id }, select: { id: true, status: true, audience: true, partner: { select: { status: true, startsAt: true, endsAt: true } } } });
    return !!brand && brandVisibleTo({ id: brand.id, status: brand.status, audience: brand.audience, partnerStatus: brand.partner.status, partnerInPeriod: partnerInPeriod(brand.partner, now) }, viewer);
  }
  const brandIds = await visibleBrandIds(viewer, now);
  if (type === "LAUNCH") {
    const launch = await prisma.partnerLaunch.findFirst({ where: { id, ...liveLaunchWhere(now) }, select: LAUNCH_SELECT });
    return !!launch && brandIds.has(launch.brandId) && isLaunchRowLive(launch, now);
  }
  if (type === "PRODUCT") {
    const product = await prisma.partnerProduct.findFirst({ where: { id, isActive: true }, select: { brandId: true, range: { select: { status: true } } } });
    return !!product && brandIds.has(product.brandId) && (!product.range || rangeVisibleTo(product.range.status, viewer));
  }
  // TRAINING : un contenu de l'Académie visible pour ce public (laboratoire ou non).
  const training = await prisma.trainingContent.findFirst({ where: { AND: [mobileVisibleTrainingWhere(scope, now), { id }] }, select: { id: true } });
  return !!training;
}

export async function setFavorite(userId: string, type: FavoriteType, targetId: string, on: boolean): Promise<void> {
  if (on) {
    await prisma.userFavorite.upsert({ where: { userId_targetType_targetId: { userId, targetType: type, targetId } }, update: {}, create: { userId, targetType: type, targetId } });
  } else {
    await prisma.userFavorite.deleteMany({ where: { userId, targetType: type, targetId } });
  }
}
