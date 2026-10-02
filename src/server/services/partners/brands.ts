import "server-only";
import { prisma } from "@/server/db/client";
import { brandVisibility } from "@/core/partners/visibility";
import { canMovePublication, PUBLICATION_STATUS_LABELS, type Audience, type PublicationStatus } from "@/core/partners/status";
import { isUniverseKey } from "@/config/universes";

/**
 * Les marques partenaires, côté console PharmaBoost.
 *
 * Une marque est une fiche CENTRALE : elle n'est jamais copiée dans les
 * officines. Sa diffusion se décide ici (statut, audience, groupe pilote) et
 * se lit chez chaque officine par `brandVisibility`. Les chiffres de portée
 * affichés en console sont calculés avec cette même règle, sur les vraies
 * officines (actives, hors démonstration) : jamais une estimation à part.
 *
 * Aucune donnée patient : on ne lit des officines que leur nom, leur ville,
 * leur appartenance au groupe pilote et leurs choix sur les marques.
 */

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string; field?: string };

/** Les officines comptées dans la portée d'une marque : réelles et actives. */
export type ReachPharmacy = { id: string; partnerPilot: boolean };

export async function reachPharmacies(): Promise<ReachPharmacy[]> {
  return prisma.pharmacy.findMany({ where: { isDemo: false, isActive: true }, select: { id: true, partnerPilot: true } });
}

export type BrandReachInput = {
  status: PublicationStatus;
  audience: Audience;
  partner: { status: PublicationStatus };
  audiences: { pharmacyId: string }[];
  preferences: { pharmacyId: string; choice: "HIDDEN" | "REFUSED" }[];
};

export type BrandReach = {
  /** Officines qui la voient au catalogue. */
  catalogIds: string[];
  /** Officines où elle peut apparaître au comptoir. */
  counterIds: string[];
  hiddenIds: string[];
  refusedIds: string[];
};

/** La portée d'une marque, officine par officine, avec la règle de diffusion des officines elles-mêmes. */
export function brandReach(brand: BrandReachInput, pharmacies: ReachPharmacy[]): BrandReach {
  const selected = new Set(brand.audiences.map((row) => row.pharmacyId));
  const preferences = new Map(brand.preferences.map((row) => [row.pharmacyId, row.choice]));
  const reach: BrandReach = { catalogIds: [], counterIds: [], hiddenIds: [], refusedIds: [] };
  for (const pharmacy of pharmacies) {
    const preference = preferences.get(pharmacy.id) ?? null;
    if (preference === "HIDDEN") reach.hiddenIds.push(pharmacy.id);
    if (preference === "REFUSED") reach.refusedIds.push(pharmacy.id);
    const visibility = brandVisibility({
      partnerStatus: brand.partner.status,
      brandStatus: brand.status,
      audience: brand.audience,
      selected: selected.has(pharmacy.id),
      pilot: pharmacy.partnerPilot,
      preference,
    });
    if (visibility.catalog) reach.catalogIds.push(pharmacy.id);
    if (visibility.counter) reach.counterIds.push(pharmacy.id);
  }
  return reach;
}

export type ReachCounts = { catalog: number; counter: number; hidden: number; refused: number };

export function reachCounts(reach: BrandReach): ReachCounts {
  return { catalog: reach.catalogIds.length, counter: reach.counterIds.length, hidden: reach.hiddenIds.length, refused: reach.refusedIds.length };
}

/** Ce qu'il faut lire d'une marque pour calculer sa portée (`brandReach`). */
export const REACH_SELECT = {
  status: true,
  audience: true,
  partner: { select: { id: true, name: true, status: true } },
  audiences: { select: { pharmacyId: true } },
  preferences: { select: { pharmacyId: true, choice: true } },
} as const;

// ---------------------------------------------------------------------------
// Liste et groupe pilote
// ---------------------------------------------------------------------------

export type ConsoleBrandRow = {
  id: string;
  slug: string;
  name: string;
  brandKey: string;
  logoUrl: string | null;
  universes: string[];
  status: PublicationStatus;
  audience: Audience;
  partner: { id: string; name: string; status: PublicationStatus };
  ranges: number;
  products: number;
  reach: ReachCounts;
};

export async function listConsoleBrands(): Promise<{ brands: ConsoleBrandRow[]; realPharmacies: number; pilotPharmacies: number }> {
  const [brands, pharmacies] = await Promise.all([
    prisma.partnerBrand.findMany({
      orderBy: [{ partner: { name: "asc" } }, { name: "asc" }],
      select: { id: true, slug: true, name: true, brandKey: true, logoUrl: true, universes: true, ...REACH_SELECT, _count: { select: { ranges: true, products: true } } },
    }),
    reachPharmacies(),
  ]);
  return {
    brands: brands.map((brand) => ({
      id: brand.id,
      slug: brand.slug,
      name: brand.name,
      brandKey: brand.brandKey,
      logoUrl: brand.logoUrl,
      universes: brand.universes,
      status: brand.status,
      audience: brand.audience,
      partner: brand.partner,
      ranges: brand._count.ranges,
      products: brand._count.products,
      reach: reachCounts(brandReach(brand, pharmacies)),
    })),
    realPharmacies: pharmacies.length,
    pilotPharmacies: pharmacies.filter((pharmacy) => pharmacy.partnerPilot).length,
  };
}

export type PilotCandidate = { id: string; name: string; city: string | null; partnerPilot: boolean };

/** Les officines qui peuvent entrer au groupe pilote : réelles et actives. */
export async function listPilotCandidates(): Promise<PilotCandidate[]> {
  return prisma.pharmacy.findMany({
    where: { isDemo: false, isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, city: true, partnerPilot: true },
  });
}

export async function setPharmacyPilot(pharmacyId: string, pilot: boolean): Promise<ServiceResult<{ name: string; changed: boolean }>> {
  const pharmacy = await prisma.pharmacy.findFirst({ where: { id: pharmacyId, isDemo: false, isActive: true }, select: { id: true, name: true, partnerPilot: true } });
  if (!pharmacy) return { ok: false, error: "Officine introuvable (ou de démonstration, ou suspendue)." };
  if (pharmacy.partnerPilot === pilot) return { ok: true, data: { name: pharmacy.name, changed: false } };
  await prisma.pharmacy.update({ where: { id: pharmacy.id }, data: { partnerPilot: pilot } });
  return { ok: true, data: { name: pharmacy.name, changed: true } };
}

export type PartnerOption = { id: string; name: string; status: PublicationStatus };

export async function listPartnerOptions(): Promise<PartnerOption[]> {
  return prisma.partner.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, status: true } });
}

// ---------------------------------------------------------------------------
// Fiche marque
// ---------------------------------------------------------------------------

export type BrandInput = {
  name: string;
  slug: string;
  brandKey: string;
  logoUrl: string | null;
  description: string | null;
  universes: string[];
};

function cleanUniverses(universes: string[]): string[] {
  return [...new Set(universes.filter(isUniverseKey))];
}

async function slugTaken(slug: string, exceptId: string | null): Promise<boolean> {
  const existing = await prisma.partnerBrand.findUnique({ where: { slug }, select: { id: true } });
  return Boolean(existing && existing.id !== exceptId);
}

const SLUG_TAKEN = "Ce slug est déjà pris par une autre marque.";

export async function createBrand(partnerId: string, input: BrandInput): Promise<ServiceResult<{ id: string }>> {
  const partner = await prisma.partner.findFirst({ where: { id: partnerId }, select: { id: true } });
  if (!partner) return { ok: false, error: "Partenaire introuvable.", field: "partnerId" };
  if (await slugTaken(input.slug, null)) return { ok: false, error: SLUG_TAKEN, field: "slug" };
  try {
    const brand = await prisma.partnerBrand.create({
      data: {
        partnerId: partner.id,
        name: input.name,
        slug: input.slug,
        brandKey: input.brandKey,
        logoUrl: input.logoUrl,
        description: input.description,
        universes: cleanUniverses(input.universes),
        status: "DRAFT",
      },
      select: { id: true },
    });
    return { ok: true, data: brand };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { ok: false, error: SLUG_TAKEN, field: "slug" };
    throw error;
  }
}

export async function updateBrand(id: string, input: BrandInput): Promise<ServiceResult<{ id: string }>> {
  const brand = await prisma.partnerBrand.findFirst({ where: { id }, select: { id: true } });
  if (!brand) return { ok: false, error: "Marque introuvable." };
  if (await slugTaken(input.slug, brand.id)) return { ok: false, error: SLUG_TAKEN, field: "slug" };
  try {
    await prisma.partnerBrand.update({
      where: { id: brand.id },
      data: { name: input.name, slug: input.slug, brandKey: input.brandKey, logoUrl: input.logoUrl, description: input.description, universes: cleanUniverses(input.universes) },
    });
    return { ok: true, data: { id: brand.id } };
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return { ok: false, error: SLUG_TAKEN, field: "slug" };
    throw error;
  }
}

export async function changeBrandStatus(id: string, to: PublicationStatus): Promise<ServiceResult<{ name: string; from: PublicationStatus; to: PublicationStatus }>> {
  const brand = await prisma.partnerBrand.findFirst({ where: { id }, select: { id: true, name: true, status: true, publishedAt: true } });
  if (!brand) return { ok: false, error: "Marque introuvable." };
  if (!canMovePublication(brand.status, to)) {
    return { ok: false, error: `Passage de « ${PUBLICATION_STATUS_LABELS[brand.status]} » à « ${PUBLICATION_STATUS_LABELS[to]} » impossible.` };
  }
  await prisma.partnerBrand.update({
    where: { id: brand.id },
    // La première mise en ligne est datée une fois pour toutes.
    data: { status: to, ...(to === "ACTIVE" && !brand.publishedAt ? { publishedAt: new Date() } : {}) },
  });
  return { ok: true, data: { name: brand.name, from: brand.status, to } };
}

/**
 * L'audience d'une marque. La sélection d'officines n'est réécrite que pour
 * l'audience « Officines sélectionnées » ; pour les autres, elle est gardée
 * telle quelle (et ignorée par la règle de diffusion) afin de pouvoir y revenir.
 */
export async function updateBrandAudience(id: string, audience: Audience, pharmacyIds: string[]): Promise<ServiceResult<{ name: string; selected: number }>> {
  const brand = await prisma.partnerBrand.findFirst({ where: { id }, select: { id: true, name: true } });
  if (!brand) return { ok: false, error: "Marque introuvable." };

  if (audience !== "SELECTED_PHARMACIES") {
    await prisma.partnerBrand.update({ where: { id: brand.id }, data: { audience } });
    return { ok: true, data: { name: brand.name, selected: 0 } };
  }

  const unique = [...new Set(pharmacyIds)];
  const pharmacies = await prisma.pharmacy.findMany({ where: { id: { in: unique }, isActive: true }, select: { id: true } });
  if (pharmacies.length !== unique.length) return { ok: false, error: "Une officine cochée est introuvable ou suspendue : rechargez la page." };
  if (pharmacies.length === 0) return { ok: false, error: "Cochez au moins une officine.", field: "pharmacyIds" };
  const ids = pharmacies.map((pharmacy) => pharmacy.id);

  await prisma.$transaction([
    prisma.partnerBrand.update({ where: { id: brand.id }, data: { audience } }),
    prisma.partnerBrandAudience.deleteMany({ where: { brandId: brand.id, pharmacyId: { notIn: ids } } }),
    prisma.partnerBrandAudience.createMany({ data: ids.map((pharmacyId) => ({ brandId: brand.id, pharmacyId })), skipDuplicates: true }),
  ]);
  return { ok: true, data: { name: brand.name, selected: ids.length } };
}

export type ConsoleRange = {
  id: string;
  name: string;
  description: string | null;
  universe: string | null;
  status: PublicationStatus;
  sortOrder: number;
  products: number;
};

export type ConsoleDocument = { id: string; title: string; kind: string; url: string; isActive: boolean; createdAt: string };

export type ConsoleBrandDetail = {
  id: string;
  slug: string;
  name: string;
  brandKey: string;
  logoUrl: string | null;
  description: string | null;
  universes: string[];
  status: PublicationStatus;
  audience: Audience;
  publishedAt: string | null;
  updatedAt: string;
  partner: { id: string; name: string; status: PublicationStatus };
  ranges: ConsoleRange[];
  documents: ConsoleDocument[];
  selectedPharmacyIds: string[];
  reach: ReachCounts;
  products: { total: number; active: number };
  offers: number;
  realPharmacies: number;
  pilotPharmacies: number;
};

export async function getConsoleBrand(id: string): Promise<ConsoleBrandDetail | null> {
  const [brand, pharmacies] = await Promise.all([
    prisma.partnerBrand.findFirst({
      where: { id },
      select: {
        id: true,
        slug: true,
        name: true,
        brandKey: true,
        logoUrl: true,
        description: true,
        universes: true,
        publishedAt: true,
        updatedAt: true,
        ...REACH_SELECT,
        ranges: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true, description: true, universe: true, status: true, sortOrder: true, _count: { select: { products: true } } },
        },
        documents: { orderBy: { createdAt: "asc" }, select: { id: true, title: true, kind: true, url: true, isActive: true, createdAt: true } },
        _count: { select: { products: true, offers: true } },
      },
    }),
    reachPharmacies(),
  ]);
  if (!brand) return null;
  const activeProducts = await prisma.partnerProduct.count({ where: { brandId: brand.id, isActive: true } });
  return {
    id: brand.id,
    slug: brand.slug,
    name: brand.name,
    brandKey: brand.brandKey,
    logoUrl: brand.logoUrl,
    description: brand.description,
    universes: brand.universes,
    status: brand.status,
    audience: brand.audience,
    publishedAt: brand.publishedAt?.toISOString() ?? null,
    updatedAt: brand.updatedAt.toISOString(),
    partner: brand.partner,
    ranges: brand.ranges.map((range) => ({
      id: range.id,
      name: range.name,
      description: range.description,
      universe: range.universe,
      status: range.status,
      sortOrder: range.sortOrder,
      products: range._count.products,
    })),
    documents: brand.documents.map((document) => ({ ...document, createdAt: document.createdAt.toISOString() })),
    selectedPharmacyIds: brand.audiences.map((row) => row.pharmacyId),
    reach: reachCounts(brandReach(brand, pharmacies)),
    products: { total: brand._count.products, active: activeProducts },
    offers: brand._count.offers,
    realPharmacies: pharmacies.length,
    pilotPharmacies: pharmacies.filter((pharmacy) => pharmacy.partnerPilot).length,
  };
}

export type AudienceCandidate = { id: string; name: string; city: string | null; isDemo: boolean };

/** Les officines qu'on peut retenir pour une diffusion sélective : actives ; les officines de démonstration sont signalées. */
export async function listAudienceCandidates(): Promise<AudienceCandidate[]> {
  return prisma.pharmacy.findMany({
    where: { isActive: true },
    orderBy: [{ isDemo: "asc" }, { name: "asc" }],
    select: { id: true, name: true, city: true, isDemo: true },
  });
}

// ---------------------------------------------------------------------------
// Gammes
// ---------------------------------------------------------------------------

export type RangeInput = { name: string; description: string | null; universe: string | null; sortOrder: number };

function nameKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Crée (en brouillon) ou modifie une gamme. Deux gammes d'une même marque ne
 * portent pas le même nom : l'import de catalogue s'y réfère par son nom.
 */
export async function saveRange(brandId: string, rangeId: string | null, input: RangeInput): Promise<ServiceResult<{ id: string; created: boolean }>> {
  const brand = await prisma.partnerBrand.findFirst({ where: { id: brandId }, select: { id: true, ranges: { select: { id: true, name: true } } } });
  if (!brand) return { ok: false, error: "Marque introuvable." };
  if (rangeId && !brand.ranges.some((range) => range.id === rangeId)) return { ok: false, error: "Gamme introuvable." };
  const clash = brand.ranges.find((range) => range.id !== rangeId && nameKey(range.name) === nameKey(input.name));
  if (clash) return { ok: false, error: `La gamme « ${clash.name} » existe déjà pour cette marque.`, field: "name" };

  const universe = input.universe && isUniverseKey(input.universe) ? input.universe : null;
  const data = { name: input.name, description: input.description, universe, sortOrder: input.sortOrder };
  if (rangeId) {
    await prisma.partnerRange.update({ where: { id: rangeId }, data });
    return { ok: true, data: { id: rangeId, created: false } };
  }
  const created = await prisma.partnerRange.create({ data: { ...data, brandId: brand.id, status: "DRAFT" }, select: { id: true } });
  return { ok: true, data: { id: created.id, created: true } };
}

export async function changeRangeStatus(brandId: string, rangeId: string, to: PublicationStatus): Promise<ServiceResult<{ name: string; from: PublicationStatus; to: PublicationStatus }>> {
  const range = await prisma.partnerRange.findFirst({ where: { id: rangeId, brandId }, select: { id: true, name: true, status: true } });
  if (!range) return { ok: false, error: "Gamme introuvable." };
  if (!canMovePublication(range.status, to)) {
    return { ok: false, error: `Passage de « ${PUBLICATION_STATUS_LABELS[range.status]} » à « ${PUBLICATION_STATUS_LABELS[to]} » impossible.` };
  }
  await prisma.partnerRange.update({ where: { id: range.id }, data: { status: to } });
  return { ok: true, data: { name: range.name, from: range.status, to } };
}

// ---------------------------------------------------------------------------
// Documents professionnels
// ---------------------------------------------------------------------------

export type DocumentInput = { title: string; kind: string; url: string };

export async function saveDocument(brandId: string, documentId: string | null, input: DocumentInput): Promise<ServiceResult<{ id: string; created: boolean }>> {
  const brand = await prisma.partnerBrand.findFirst({ where: { id: brandId }, select: { id: true } });
  if (!brand) return { ok: false, error: "Marque introuvable." };
  if (documentId) {
    const document = await prisma.partnerDocument.findFirst({ where: { id: documentId, brandId: brand.id }, select: { id: true } });
    if (!document) return { ok: false, error: "Document introuvable." };
    await prisma.partnerDocument.update({ where: { id: document.id }, data: input });
    return { ok: true, data: { id: document.id, created: false } };
  }
  const created = await prisma.partnerDocument.create({ data: { ...input, brandId: brand.id }, select: { id: true } });
  return { ok: true, data: { id: created.id, created: true } };
}

export async function setDocumentActive(brandId: string, documentId: string, isActive: boolean): Promise<ServiceResult<{ title: string }>> {
  const document = await prisma.partnerDocument.findFirst({ where: { id: documentId, brandId }, select: { id: true, title: true } });
  if (!document) return { ok: false, error: "Document introuvable." };
  await prisma.partnerDocument.update({ where: { id: document.id }, data: { isActive } });
  return { ok: true, data: { title: document.title } };
}
