import "server-only";
import { prisma } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma";
import { regulatoryProblem, REGULATORY_CATEGORIES, type RegulatoryCategory } from "@/core/discover/visibility";
import {
  BILLING_STATUSES,
  checkCampaignTransition,
  SPONSORED_FORMATS,
  SPONSORED_PLACEMENTS,
  TRANSITION_REFUSAL_MESSAGES,
  type BillingStatus,
  type CampaignStatus,
  type SponsoredFormat,
  type SponsoredPlacement,
} from "@/core/sponsoring/campaign";
import { groupTotals, periodStart, totalsOf, type StatPeriodKey, type StatRow, type StatTotals } from "@/core/sponsoring/stats";

/**
 * La console des Découvertes : nouveautés des marques, campagnes sponsorisées (cycle de vie, validation
 * réglementaire, facturation saisie par l'équipe), statistiques agrégées, demandes d'information. Appelé seulement
 * depuis les actions et pages de la console (session administrateur plateforme).
 *
 * Aucun tarif n'est inventé : les montants restent vides tant que l'équipe ne les saisit pas.
 */

type Result<T = null> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const text = (value: string | null | undefined, max: number): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

function httpsOrNull(value: string | null | undefined): { value: string | null; error: boolean } {
  const trimmed = value?.trim();
  if (!trimmed) return { value: null, error: false };
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? { value: url.toString(), error: false } : { value: null, error: true };
  } catch {
    return { value: null, error: true };
  }
}

function dateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ---------------------------------------------------------------------------
// Cibles (partenaires, marques, nouveautés, parcours)
// ---------------------------------------------------------------------------

export type SponsoringTargets = {
  partners: { id: string; name: string; status: string; brands: { id: string; name: string }[] }[];
  launches: { id: string; title: string; brandId: string; partnerId: string }[];
  modules: { id: string; title: string; partnerId: string | null }[];
};

export async function sponsoringTargets(): Promise<SponsoringTargets> {
  const [partners, launches, modules] = await Promise.all([
    prisma.partner.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true, status: true, brands: { where: { status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } } } }),
    prisma.partnerLaunch.findMany({ where: { reviewStatus: { not: "ARCHIVED" } }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, title: true, brandId: true, partnerId: true } }),
    prisma.trainingModule.findMany({ where: { isActive: true }, orderBy: { title: "asc" }, take: 200, select: { id: true, title: true, partnerId: true } }),
  ]);
  return { partners, launches, modules };
}

// ---------------------------------------------------------------------------
// Nouveautés
// ---------------------------------------------------------------------------

export type LaunchAdminRow = {
  id: string;
  title: string;
  summary: string | null;
  body: string;
  mediaUrl: string | null;
  posterUrl: string | null;
  orientation: "VERTICAL" | "HORIZONTAL" | null;
  productCodes: string[];
  universe: string | null;
  regulatoryCategory: RegulatoryCategory;
  regulatoryMentions: string | null;
  regulatoryValidatedBy: string | null;
  regulatoryValidatedAt: Date | null;
  reviewStatus: "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "ARCHIVED";
  publishedAt: Date | null;
  endsAt: Date | null;
  partner: { id: string; name: string };
  brand: { id: string; name: string; slug: string };
  infoRequests: number;
};

export async function listLaunchesAdmin(): Promise<LaunchAdminRow[]> {
  const rows = await prisma.partnerLaunch.findMany({
    orderBy: [{ updatedAt: "desc" }],
    take: 300,
    select: {
      id: true,
      title: true,
      summary: true,
      body: true,
      mediaUrl: true,
      posterUrl: true,
      orientation: true,
      productCodes: true,
      universe: true,
      regulatoryCategory: true,
      regulatoryMentions: true,
      regulatoryValidatedBy: true,
      regulatoryValidatedAt: true,
      reviewStatus: true,
      publishedAt: true,
      endsAt: true,
      partner: { select: { id: true, name: true } },
      brand: { select: { id: true, name: true, slug: true } },
      _count: { select: { infoRequests: true } },
    },
  });
  return rows.map(({ _count, ...row }) => ({ ...row, infoRequests: _count.infoRequests }));
}

export type LaunchInput = {
  id: string | null;
  brandId: string;
  title: string;
  summary: string | null;
  body: string;
  mediaUrl: string | null;
  posterUrl: string | null;
  orientation: string | null;
  productCodes: string;
  universe: string | null;
  regulatoryCategory: string;
  regulatoryMentions: string | null;
  endsAt: string | null;
};

/**
 * Créer ou modifier une nouveauté. Toute modification la repasse en BROUILLON et efface sa validation
 * réglementaire : ce qui est en ligne est toujours exactement ce qui a été validé.
 */
export async function saveLaunch(input: LaunchInput, adminId: string): Promise<Result<{ id: string; created: boolean }>> {
  const fieldErrors: Record<string, string> = {};
  const title = text(input.title, 160);
  const body = text(input.body, 6000);
  if (!title) fieldErrors.title = "Indiquez un titre.";
  if (!body) fieldErrors.body = "Indiquez le texte de la nouveauté.";
  const category = REGULATORY_CATEGORIES.find((entry) => entry === input.regulatoryCategory);
  if (!category) fieldErrors.regulatoryCategory = "Choisissez la catégorie réglementaire.";
  const media = httpsOrNull(input.mediaUrl);
  if (media.error) fieldErrors.mediaUrl = "Adresse https:// uniquement.";
  const poster = httpsOrNull(input.posterUrl);
  if (poster.error) fieldErrors.posterUrl = "Adresse https:// uniquement.";
  const endsAt = input.endsAt ? dateOrNull(input.endsAt) : null;
  if (input.endsAt && !endsAt) fieldErrors.endsAt = "Date invalide.";
  const codes = input.productCodes
    .split(/[\s,;]+/)
    .map((code) => code.trim())
    .filter(Boolean);
  if (codes.some((code) => !/^\d{7,14}$/.test(code))) fieldErrors.productCodes = "Codes CIP13 ou EAN (chiffres seulement), séparés par des virgules.";
  const brand = await prisma.partnerBrand.findUnique({ where: { id: input.brandId }, select: { id: true, partnerId: true } });
  if (!brand) fieldErrors.brandId = "Choisissez une marque.";
  if (Object.keys(fieldErrors).length > 0 || !brand || !category) return { ok: false, error: "Vérifiez les champs signalés.", fieldErrors };

  const data = {
    partnerId: brand.partnerId,
    brandId: brand.id,
    title: title!,
    summary: text(input.summary, 400),
    body: body!,
    mediaUrl: media.value,
    posterUrl: poster.value,
    orientation: input.orientation === "VERTICAL" || input.orientation === "HORIZONTAL" ? (input.orientation as "VERTICAL" | "HORIZONTAL") : null,
    productCodes: [...new Set(codes)].slice(0, 40),
    universe: text(input.universe, 60),
    regulatoryCategory: category,
    regulatoryMentions: text(input.regulatoryMentions, 3000),
    endsAt,
    // Ce qui est en ligne = ce qui a été validé : toute modification repart en brouillon.
    reviewStatus: "DRAFT" as const,
    regulatoryValidatedBy: null,
    regulatoryValidatedAt: null,
  };
  if (input.id) {
    const updated = await prisma.partnerLaunch.updateMany({ where: { id: input.id }, data });
    if (updated.count === 0) return { ok: false, error: "Nouveauté introuvable." };
    return { ok: true, data: { id: input.id, created: false } };
  }
  const created = await prisma.partnerLaunch.create({ data: { ...data, createdByAdminId: adminId }, select: { id: true } });
  return { ok: true, data: { id: created.id, created: true } };
}

/** La validation réglementaire d'une nouveauté : un nom (qualité comprise) et la date du jour. */
export async function validateLaunchRegulatory(id: string, validatorName: string, now = new Date()): Promise<Result> {
  const name = text(validatorName, 160);
  if (!name) return { ok: false, error: "Indiquez le nom et la qualité de la personne qui valide.", fieldErrors: { validator: "Obligatoire." } };
  const launch = await prisma.partnerLaunch.findUnique({ where: { id }, select: { regulatoryCategory: true, regulatoryMentions: true, reviewStatus: true } });
  if (!launch) return { ok: false, error: "Nouveauté introuvable." };
  if (launch.reviewStatus === "ARCHIVED") return { ok: false, error: "Nouveauté archivée." };
  if (launch.regulatoryCategory === "MEDICINE" && !launch.regulatoryMentions?.trim()) {
    return { ok: false, error: "Un médicament doit porter ses mentions obligatoires avant validation." };
  }
  await prisma.partnerLaunch.update({ where: { id }, data: { regulatoryValidatedBy: name, regulatoryValidatedAt: now } });
  return { ok: true, data: null };
}

export const LAUNCH_REVIEW_STATUSES = ["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED", "ARCHIVED"] as const;
export type LaunchReviewStatus = (typeof LAUNCH_REVIEW_STATUSES)[number];

/** Publier (APPROVED), retirer, archiver. Publier exige la validation réglementaire. */
export async function setLaunchReview(id: string, status: LaunchReviewStatus, now = new Date()): Promise<Result> {
  const launch = await prisma.partnerLaunch.findUnique({
    where: { id },
    select: { regulatoryCategory: true, regulatoryMentions: true, regulatoryValidatedBy: true, regulatoryValidatedAt: true, publishedAt: true },
  });
  if (!launch) return { ok: false, error: "Nouveauté introuvable." };
  if (status === "APPROVED") {
    const problem = regulatoryProblem({ regulatoryCategory: launch.regulatoryCategory, validatedBy: launch.regulatoryValidatedBy, validatedAt: launch.regulatoryValidatedAt, mentions: launch.regulatoryMentions });
    if (problem) return { ok: false, error: problem === "MEDICINE_MENTIONS_MISSING" ? "Un médicament doit porter ses mentions obligatoires." : "Validez d'abord la nouveauté sur le plan réglementaire (nom et date)." };
  }
  await prisma.partnerLaunch.update({ where: { id }, data: { reviewStatus: status, publishedAt: status === "APPROVED" ? (launch.publishedAt ?? now) : launch.publishedAt } });
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Campagnes
// ---------------------------------------------------------------------------

const CAMPAIGN_ADMIN_SELECT = {
  id: true,
  name: true,
  format: true,
  placements: true,
  audiences: true,
  startsAt: true,
  endsAt: true,
  status: true,
  regulatoryCategory: true,
  regulatoryReviewedBy: true,
  regulatoryReviewedAt: true,
  regulatoryNotes: true,
  priceNote: true,
  budgetCents: true,
  billedCents: true,
  billingReference: true,
  contractReference: true,
  billingStatus: true,
  paidAt: true,
  createdAt: true,
  updatedAt: true,
  partner: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true, slug: true } },
  launch: { select: { id: true, title: true, reviewStatus: true, regulatoryValidatedAt: true } },
  module: { select: { id: true, title: true } },
} satisfies Prisma.SponsoredCampaignSelect;

export type CampaignAdminRow = Prisma.SponsoredCampaignGetPayload<{ select: typeof CAMPAIGN_ADMIN_SELECT }>;

export async function listCampaignsAdmin(): Promise<CampaignAdminRow[]> {
  return prisma.sponsoredCampaign.findMany({ orderBy: [{ updatedAt: "desc" }], take: 300, select: CAMPAIGN_ADMIN_SELECT });
}

export async function campaignAdmin(id: string): Promise<CampaignAdminRow | null> {
  return prisma.sponsoredCampaign.findUnique({ where: { id }, select: CAMPAIGN_ADMIN_SELECT });
}

export type CampaignInput = {
  id: string | null;
  partnerId: string;
  brandId: string | null;
  launchId: string | null;
  moduleId: string | null;
  name: string;
  format: string;
  placements: string[];
  audiences: string[];
  startsAt: string;
  endsAt: string;
  regulatoryCategory: string | null;
};

const AUDIENCES = ["ALL", "NEW_STAFF", "STUDENT", "TECHNICIAN", "PHARMACIST", "OWNER"] as const;

/**
 * Créer ou modifier une campagne. Le contenu (cible, emplacements, période, public) ne se modifie qu'en brouillon ou
 * après un refus ; toute modification efface la validation réglementaire.
 */
export async function saveCampaign(input: CampaignInput, adminId: string): Promise<Result<{ id: string; created: boolean }>> {
  const fieldErrors: Record<string, string> = {};
  const name = text(input.name, 160);
  if (!name) fieldErrors.name = "Donnez un nom à la campagne.";
  const format = SPONSORED_FORMATS.find((entry) => entry === input.format) as SponsoredFormat | undefined;
  if (!format) fieldErrors.format = "Choisissez un format.";
  const placements = [...new Set(input.placements)].filter((p): p is SponsoredPlacement => (SPONSORED_PLACEMENTS as readonly string[]).includes(p));
  if (placements.length === 0) fieldErrors.placements = "Choisissez au moins un emplacement.";
  const audiences = [...new Set(input.audiences)].filter((a) => (AUDIENCES as readonly string[]).includes(a));
  const startsAt = dateOrNull(input.startsAt);
  const endsAt = dateOrNull(input.endsAt);
  if (!startsAt) fieldErrors.startsAt = "Date de début invalide.";
  if (!endsAt) fieldErrors.endsAt = "Date de fin invalide.";
  if (startsAt && endsAt && endsAt <= startsAt) fieldErrors.endsAt = "La fin doit suivre le début.";
  const category = input.regulatoryCategory ? (REGULATORY_CATEGORIES.find((entry) => entry === input.regulatoryCategory) ?? null) : null;
  if (input.regulatoryCategory && !category) fieldErrors.regulatoryCategory = "Catégorie inconnue.";

  const partner = await prisma.partner.findUnique({ where: { id: input.partnerId }, select: { id: true } });
  if (!partner) fieldErrors.partnerId = "Choisissez un partenaire.";
  const brand = input.brandId ? await prisma.partnerBrand.findFirst({ where: { id: input.brandId, partnerId: input.partnerId }, select: { id: true } }) : null;
  if (input.brandId && !brand) fieldErrors.brandId = "Cette marque n'appartient pas au partenaire.";
  const launch = input.launchId ? await prisma.partnerLaunch.findFirst({ where: { id: input.launchId, partnerId: input.partnerId }, select: { id: true, brandId: true, regulatoryCategory: true } }) : null;
  if (input.launchId && !launch) fieldErrors.launchId = "Cette nouveauté n'appartient pas au partenaire.";
  if (launch && brand && launch.brandId !== brand.id) fieldErrors.launchId = "Cette nouveauté est d'une autre marque.";
  const trainingModule = input.moduleId ? await prisma.trainingModule.findUnique({ where: { id: input.moduleId }, select: { id: true } }) : null;
  if (input.moduleId && !trainingModule) fieldErrors.moduleId = "Parcours introuvable.";
  if (!brand && !launch && !trainingModule) fieldErrors.brandId = "Choisissez ce qui est mis en avant : une marque, une nouveauté ou un parcours.";
  if (format === "PROGRAMME_FORMATION" && !trainingModule) fieldErrors.moduleId = "Un programme de formation met en avant un parcours de l'Académie.";
  if (format === "LANCEMENT" && !launch) fieldErrors.launchId = "Un lancement met en avant une nouveauté publiée.";

  if (Object.keys(fieldErrors).length > 0 || !format || !startsAt || !endsAt) return { ok: false, error: "Vérifiez les champs signalés.", fieldErrors };

  const data = {
    partnerId: input.partnerId,
    brandId: brand?.id ?? launch?.brandId ?? null,
    launchId: launch?.id ?? null,
    moduleId: trainingModule?.id ?? null,
    name: name!,
    format,
    placements,
    audiences,
    startsAt,
    endsAt,
    // Une nouveauté porte déjà sa catégorie ; sinon celle choisie.
    regulatoryCategory: category ?? launch?.regulatoryCategory ?? null,
    regulatoryReviewedBy: null,
    regulatoryReviewedAt: null,
  };
  if (input.id) {
    const current = await prisma.sponsoredCampaign.findUnique({ where: { id: input.id }, select: { status: true } });
    if (!current) return { ok: false, error: "Campagne introuvable." };
    if (current.status !== "DRAFT" && current.status !== "REJECTED") return { ok: false, error: "Repassez la campagne en brouillon pour modifier son contenu." };
    await prisma.sponsoredCampaign.update({ where: { id: input.id }, data: { ...data, status: "DRAFT" } });
    return { ok: true, data: { id: input.id, created: false } };
  }
  const created = await prisma.sponsoredCampaign.create({ data: { ...data, status: "DRAFT", createdByAdminId: adminId }, select: { id: true } });
  return { ok: true, data: { id: created.id, created: true } };
}

/** La validation réglementaire d'une campagne (avant approbation). */
export async function validateCampaignRegulatory(id: string, input: { validator: string; notes: string | null; category: string | null }, now = new Date()): Promise<Result> {
  const validator = text(input.validator, 160);
  if (!validator) return { ok: false, error: "Indiquez le nom et la qualité de la personne qui valide.", fieldErrors: { validator: "Obligatoire." } };
  const campaign = await prisma.sponsoredCampaign.findUnique({ where: { id }, select: { status: true, regulatoryCategory: true, launch: { select: { regulatoryValidatedAt: true, regulatoryCategory: true } } } });
  if (!campaign) return { ok: false, error: "Campagne introuvable." };
  if (campaign.status !== "DRAFT" && campaign.status !== "IN_REVIEW") return { ok: false, error: "La validation se fait en brouillon ou en relecture." };
  const category = input.category ? (REGULATORY_CATEGORIES.find((entry) => entry === input.category) ?? null) : campaign.regulatoryCategory;
  if (!category) return { ok: false, error: "Indiquez la catégorie réglementaire de ce qui est promu.", fieldErrors: { category: "Obligatoire." } };
  if (campaign.launch && !campaign.launch.regulatoryValidatedAt) return { ok: false, error: "Validez d'abord la nouveauté mise en avant (Partenaires → Nouveautés)." };
  await prisma.sponsoredCampaign.update({ where: { id }, data: { regulatoryReviewedBy: validator, regulatoryReviewedAt: now, regulatoryNotes: text(input.notes, 2000), regulatoryCategory: category } });
  return { ok: true, data: null };
}

export async function transitionCampaign(id: string, to: CampaignStatus, now = new Date()): Promise<Result> {
  const campaign = await prisma.sponsoredCampaign.findUnique({
    where: { id },
    select: { status: true, startsAt: true, endsAt: true, placements: true, regulatoryCategory: true, regulatoryReviewedBy: true, regulatoryReviewedAt: true, launch: { select: { reviewStatus: true, regulatoryValidatedAt: true } } },
  });
  if (!campaign) return { ok: false, error: "Campagne introuvable." };
  const refusal = checkCampaignTransition(campaign, to, now);
  if (refusal) return { ok: false, error: TRANSITION_REFUSAL_MESSAGES[refusal] };
  if ((to === "APPROVED" || to === "ACTIVE") && campaign.launch && (campaign.launch.reviewStatus !== "APPROVED" || !campaign.launch.regulatoryValidatedAt)) {
    return { ok: false, error: "La nouveauté mise en avant doit être publiée et validée avant." };
  }
  // Repasser en brouillon efface la validation : on revalidera ce qui sera modifié.
  const reset = to === "DRAFT" ? { regulatoryReviewedBy: null, regulatoryReviewedAt: null } : {};
  await prisma.sponsoredCampaign.update({ where: { id }, data: { status: to, ...reset } });
  return { ok: true, data: null };
}

export type BillingInput = {
  billingStatus: string;
  priceNote: string | null;
  budgetCents: number | null;
  billedCents: number | null;
  billingReference: string | null;
  contractReference: string | null;
};

/** Devis, signature, facture, paiement : saisis par l'équipe. Aucun montant par défaut. */
export async function setCampaignBilling(id: string, input: BillingInput, now = new Date()): Promise<Result> {
  const status = BILLING_STATUSES.find((entry) => entry === input.billingStatus) as BillingStatus | undefined;
  if (!status) return { ok: false, error: "Étape de facturation inconnue." };
  for (const [key, value] of [["budgetCents", input.budgetCents], ["billedCents", input.billedCents]] as const) {
    if (value !== null && (!Number.isInteger(value) || value < 0 || value > 1_000_000_00)) return { ok: false, error: "Montant invalide.", fieldErrors: { [key]: "Montant invalide." } };
  }
  if ((status === "INVOICED" || status === "PAID") && input.billedCents === null) return { ok: false, error: "Indiquez le montant facturé.", fieldErrors: { billedCents: "Obligatoire une fois facturé." } };
  const current = await prisma.sponsoredCampaign.findUnique({ where: { id }, select: { paidAt: true } });
  if (!current) return { ok: false, error: "Campagne introuvable." };
  await prisma.sponsoredCampaign.update({
    where: { id },
    data: {
      billingStatus: status,
      priceNote: text(input.priceNote, 300),
      budgetCents: input.budgetCents,
      billedCents: input.billedCents,
      billingReference: text(input.billingReference, 120),
      contractReference: text(input.contractReference, 120),
      paidAt: status === "PAID" ? (current.paidAt ?? now) : null,
    },
  });
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Statistiques (agrégats seulement)
// ---------------------------------------------------------------------------

export type CampaignStatsOverview = {
  totals: StatTotals;
  byPlacement: { placement: SponsoredPlacement; totals: StatTotals }[];
  byCampaign: Map<string, StatTotals>;
  byPartner: { partnerId: string; partnerName: string; totals: StatTotals }[];
};

async function statRows(where: Prisma.SponsoredCampaignDailyStatWhereInput): Promise<(StatRow & { partnerId: string; partnerName: string })[]> {
  const rows = await prisma.sponsoredCampaignDailyStat.findMany({
    where,
    orderBy: { day: "asc" },
    select: { campaignId: true, placement: true, day: true, impressions: true, clicks: true, views: true, trainingsStarted: true, trainingsCompleted: true, infoRequests: true, campaign: { select: { partner: { select: { id: true, name: true } } } } },
  });
  return rows.map(({ campaign, ...row }) => ({ ...row, partnerId: campaign.partner.id, partnerName: campaign.partner.name }));
}

export async function campaignStatsOverview(period: StatPeriodKey, now = new Date()): Promise<CampaignStatsOverview> {
  const start = periodStart(period, now);
  const rows = await statRows(start ? { day: { gte: start } } : {});
  const partnerNames = new Map(rows.map((row) => [row.partnerId, row.partnerName]));
  return {
    totals: totalsOf(rows),
    byPlacement: groupTotals(rows, (row) => row.placement).map(({ key, totals }) => ({ placement: key, totals })),
    byCampaign: new Map(groupTotals(rows, (row) => row.campaignId).map(({ key, totals }) => [key, totals])),
    byPartner: groupTotals(rows as StatRow[], (row) => (row as StatRow & { partnerId: string }).partnerId).map(({ key, totals }) => ({ partnerId: key, partnerName: partnerNames.get(key) ?? "", totals })),
  };
}

export type CampaignStatsDetail = {
  totals: StatTotals;
  byPlacement: { placement: SponsoredPlacement; totals: StatTotals }[];
  byDay: { day: Date; totals: StatTotals }[];
};

export async function campaignStatsDetail(campaignId: string, period: StatPeriodKey, now = new Date()): Promise<CampaignStatsDetail> {
  const start = periodStart(period, now);
  const rows = await statRows({ campaignId, ...(start ? { day: { gte: start } } : {}) });
  return {
    totals: totalsOf(rows),
    byPlacement: groupTotals(rows, (row) => row.placement).map(({ key, totals }) => ({ placement: key, totals })),
    byDay: groupTotals(rows, (row) => row.day.toISOString().slice(0, 10)).map(({ key, totals }) => ({ day: new Date(`${key}T00:00:00Z`), totals })),
  };
}

// ---------------------------------------------------------------------------
// Demandes d'information
// ---------------------------------------------------------------------------

export const INFO_REQUEST_STATUSES = ["NEW", "TRANSMITTED", "HANDLED", "CANCELLED"] as const;
export type InfoRequestStatus = (typeof INFO_REQUEST_STATUSES)[number];

export async function listInfoRequests(filter: { status: InfoRequestStatus | null }) {
  return prisma.partnerInfoRequest.findMany({
    where: filter.status ? { status: filter.status } : {},
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      message: true,
      consentText: true,
      consentAt: true,
      status: true,
      transmittedAt: true,
      handledAt: true,
      createdAt: true,
      user: { select: { firstName: true, lastName: true, email: true, profession: true } },
      partner: { select: { id: true, name: true, contacts: { where: { email: { not: null } }, select: { id: true }, take: 1 } } },
      brand: { select: { name: true } },
      launch: { select: { title: true } },
      pharmacy: { select: { name: true } },
    },
  });
}

export async function setInfoRequestStatus(id: string, status: InfoRequestStatus, adminId: string, now = new Date()): Promise<Result> {
  const request = await prisma.partnerInfoRequest.findUnique({ where: { id }, select: { transmittedAt: true } });
  if (!request) return { ok: false, error: "Demande introuvable." };
  await prisma.partnerInfoRequest.update({
    where: { id },
    data: {
      status,
      transmittedAt: status === "TRANSMITTED" ? (request.transmittedAt ?? now) : request.transmittedAt,
      handledAt: status === "HANDLED" ? now : null,
      handledByAdminId: status === "HANDLED" ? adminId : null,
    },
  });
  return { ok: true, data: null };
}
