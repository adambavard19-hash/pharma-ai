import "server-only";
import { prisma } from "@/server/db/client";
import type { TenantScope } from "@/server/db/tenant";
import { itemVisible } from "@/core/partners/visibility";
import { b2bLinkFor } from "@/core/partners/attribution";
import { modeAllowsOrder } from "@/core/partners/connector";
import type { IntegrationMode } from "@/core/partners/status";
import { brandKey, productMatchesBrand } from "@/core/catalog/brand";
import { normalizeProductCode } from "@/core/training/match";
import { isSafeHttpUrl } from "@/core/training/content";
import { UNIVERSES, universeLabel } from "@/config/universes";
import { listTrainings, type TrainingCard } from "@/server/services/training";
import { brandsForPharmacy, isPartnerPilot, visibleBrandBySlug, type VisibleBrand } from "./visibility";

/**
 * PharmaBoost Partenaires, côté officine : le catalogue des gammes
 * partenaires, la page d'une marque, et les choix de l'officine (masquer,
 * refuser, rétablir).
 *
 * Les données partenaires sont centrales ; ce qu'une officine en voit se
 * décide dans `brandsForPharmacy` (src/server/services/partners/visibility.ts),
 * jamais réécrit ici. Tout ce qui est propre à l'officine — son stock, ses
 * formations, ses préférences — est lu et écrit avec `scope.pharmacyId`, qui
 * vient de la session. Un identifiant de marque ou de produit venu du client
 * est toujours revérifié : marque visible pour CETTE officine, produit
 * appartenant à CETTE marque et publié pour elle.
 *
 * Rien ici n'est lu par le moteur de conseil, et rien ici ne lit de patient.
 */

export type PartnerScope = Pick<TenantScope, "pharmacyId" | "userId">;

export type PreferenceChoice = "HIDDEN" | "REFUSED";

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------

export type CatalogBrand = {
  id: string;
  slug: string;
  name: string;
  partnerName: string;
  logoUrl: string | null;
  description: string | null;
  /** Univers de la marque et de ses gammes publiées pour l'officine. */
  universes: string[];
  preference: PreferenceChoice | null;
};

export type PartnerCatalog = {
  /** Marques visibles (ni masquées ni refusées), par univers, dans l'ordre des univers. */
  groups: { key: string; label: string; brands: CatalogBrand[] }[];
  /** Nombre de marques visibles (une marque à plusieurs univers ne compte qu'une fois). */
  visibleCount: number;
  hidden: CatalogBrand[];
  refused: CatalogBrand[];
};

function toCatalogBrand(brand: VisibleBrand): CatalogBrand {
  return {
    id: brand.id,
    slug: brand.slug,
    name: brand.name,
    partnerName: brand.partner.name,
    logoUrl: safeImage(brand.logoUrl) ?? safeImage(brand.partner.logoUrl),
    description: brand.description,
    universes: [...new Set([...brand.universes, ...brand.rangeUniverses])],
    preference: brand.preference,
  };
}

/** Une image saisie par URL dans la console : https ou http seulement, jamais `javascript:` ni `data:`. */
function safeImage(url: string | null): string | null {
  return url && isSafeHttpUrl(url) ? url.trim() : null;
}

const UNIVERSE_ORDER = new Map(UNIVERSES.map((universe, index) => [universe.key, index]));
const OTHER_GROUP = "AUTRES";

/** Le catalogue partenaire de l'officine, groupé par univers. */
export async function partnerCatalog(scope: PartnerScope): Promise<PartnerCatalog> {
  const brands = await brandsForPharmacy(scope);
  const visible = brands.filter((brand) => brand.visibility.catalog && brand.preference !== "HIDDEN").map(toCatalogBrand);
  const hidden = brands.filter((brand) => brand.visibility.catalog && brand.preference === "HIDDEN").map(toCatalogBrand);
  // « Refusée » : la marque serait visible sans le refus de l'officine (les autres raisons ne la concernent pas).
  const refused = brands.filter((brand) => brand.visibility.reason === "REFUSED_BY_PHARMACY").map(toCatalogBrand);

  const byUniverse = new Map<string, CatalogBrand[]>();
  for (const brand of visible) {
    const keys = brand.universes.length > 0 ? brand.universes : [OTHER_GROUP];
    for (const key of keys) byUniverse.set(key, [...(byUniverse.get(key) ?? []), brand]);
  }
  const groups = [...byUniverse.entries()]
    .sort(([a], [b]) => (UNIVERSE_ORDER.get(a) ?? 999) - (UNIVERSE_ORDER.get(b) ?? 999) || a.localeCompare(b, "fr"))
    .map(([key, list]) => ({
      key,
      label: key === OTHER_GROUP ? "Autres univers" : universeLabel(key),
      brands: list.sort((a, b) => a.name.localeCompare(b.name, "fr")),
    }));

  return { groups, visibleCount: visible.length, hidden, refused };
}

// ---------------------------------------------------------------------------
// Vérification d'une marque venue du client
// ---------------------------------------------------------------------------

/**
 * Une marque, par son identifiant, si elle est consultable par CETTE officine
 * (`includeRefused` : aussi si elle ne l'est plus qu'à cause du refus de
 * l'officine, pour pouvoir revenir sur ce choix). Null sinon.
 */
export async function brandForPharmacy(scope: PartnerScope, brandId: string, options: { includeRefused?: boolean } = {}): Promise<VisibleBrand | null> {
  const brands = await brandsForPharmacy(scope);
  const brand = brands.find((candidate) => candidate.id === brandId);
  if (!brand) return null;
  if (brand.visibility.catalog) return brand;
  if (options.includeRefused && brand.visibility.reason === "REFUSED_BY_PHARMACY") return brand;
  return null;
}

export type PreferenceResult =
  | { ok: true; brand: { id: string; slug: string; name: string }; previous: PreferenceChoice | null; choice: PreferenceChoice | null }
  | { ok: false; error: string };

/**
 * Masquer (absente du comptoir, toujours au catalogue), refuser (absente
 * partout) ou rétablir (`choice` null) une marque pour l'officine.
 */
export async function setBrandPreference(scope: PartnerScope, brandId: string, choice: PreferenceChoice | null, reason: string | null): Promise<PreferenceResult> {
  const brand = await brandForPharmacy(scope, brandId, { includeRefused: true });
  if (!brand) return { ok: false, error: "Cette gamme n'est pas proposée à votre officine." };
  const summary = { id: brand.id, slug: brand.slug, name: brand.name };

  if (choice === null) {
    await prisma.pharmacyPartnerPreference.deleteMany({ where: { pharmacyId: scope.pharmacyId, brandId: brand.id } });
  } else {
    const data = { choice, reason: choice === "REFUSED" ? reason?.trim() || null : null, userId: scope.userId };
    await prisma.pharmacyPartnerPreference.upsert({
      where: { pharmacyId_brandId: { pharmacyId: scope.pharmacyId, brandId: brand.id } },
      create: { pharmacyId: scope.pharmacyId, brandId: brand.id, ...data },
      update: data,
    });
  }
  return { ok: true, brand: summary, previous: brand.preference, choice };
}

// ---------------------------------------------------------------------------
// Page d'une marque
// ---------------------------------------------------------------------------

export type BrandPageProduct = {
  id: string;
  name: string;
  /** EAN, sinon CIP13. */
  code: string | null;
  packaging: string | null;
  description: string | null;
  proPriceCents: number | null;
  publicPriceCents: number | null;
  rangeId: string | null;
};

export type BrandPageRange = { id: string | null; name: string; description: string | null; universe: string | null; products: BrandPageProduct[] };

export type BrandPageStockProduct = { id: string; name: string; quantity: number | null; matchedBy: "BRAND" | "CODE" };

export type BrandPageOffer = {
  id: string;
  title: string;
  conditions: string;
  discountPercent: number | null;
  minimumOrderCents: number | null;
  validTo: Date | null;
  rangeName: string | null;
};

export type BrandPageDocument = { id: string; title: string; kind: string; url: string };

/** Ce que l'officine peut faire avec ce partenaire, selon la première intégration active. */
export type BrandPageIntegration = {
  mode: IntegrationMode;
  /** Un lien https utilisable (portail B2B ou formulaire) est configuré. */
  linkReady: boolean;
  /** Le mode permet de commander depuis PharmaBoost. */
  canOrder: boolean;
} | null;

export type BrandPage = {
  brand: {
    id: string;
    slug: string;
    name: string;
    /** Marque normalisée : relie la marque au stock et aux formations. */
    brandKey: string;
    logoUrl: string | null;
    description: string | null;
    universes: string[];
    preference: PreferenceChoice | null;
  };
  partner: { id: string; name: string; description: string | null; website: string | null; logoUrl: string | null };
  /** Gammes publiées pour l'officine ; les produits sans gamme forment un groupe à part (id null). */
  ranges: BrandPageRange[];
  productCount: number;
  inStock: { products: BrandPageStockProduct[]; total: number };
  offers: BrandPageOffer[];
  documents: BrandPageDocument[];
  integration: BrandPageIntegration;
};

const STOCK_DISPLAY_LIMIT = 40;

/** Les produits publiés d'une marque pour l'officine : actifs, sans gamme ou dans une gamme publiée pour elle. */
async function publishedCatalog(brandId: string, pilot: boolean) {
  const [ranges, products] = await Promise.all([
    prisma.partnerRange.findMany({
      where: { brandId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, description: true, universe: true, status: true },
    }),
    prisma.partnerProduct.findMany({
      where: { brandId, isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        rangeId: true,
        name: true,
        ean: true,
        cip13: true,
        description: true,
        packaging: true,
        proPriceCents: true,
        publicPriceCents: true,
        externalRef: true,
      },
    }),
  ]);
  const visibleRanges = ranges.filter((range) => itemVisible(range.status, pilot));
  const visibleRangeIds = new Set(visibleRanges.map((range) => range.id));
  const visibleProducts = products.filter((product) => product.rangeId === null || visibleRangeIds.has(product.rangeId));
  return { ranges: visibleRanges, products: visibleProducts };
}

/** La première intégration active du partenaire (la plus ancienne). */
export async function activeIntegrationOf(partnerId: string) {
  return prisma.partnerIntegration.findFirst({
    where: { partnerId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, mode: true, b2bUrlTemplate: true, formUrl: true, orderEmail: true },
  });
}

/** Un lien de redirection est-il utilisable ? On l'essaie avec un identifiant de forme valide, sans rien créer. */
export function redirectLinkReady(integration: { mode: IntegrationMode; b2bUrlTemplate: string | null; formUrl: string | null }): boolean {
  const probe = "PB-2222-2222";
  if (integration.mode === "B2B_LINK") return !!integration.b2bUrlTemplate && b2bLinkFor(integration.b2bUrlTemplate.trim(), probe) !== null;
  if (integration.mode === "FORM") {
    const raw = integration.formUrl?.trim();
    if (!raw) return false;
    if (raw.includes("{code}")) return b2bLinkFor(raw, probe) !== null;
    try {
      return new URL(raw).protocol === "https:";
    } catch {
      return false;
    }
  }
  return false;
}

function decimalToNumber(value: { toString(): string } | null): number | null {
  if (value === null) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Les formes sous lesquelles un code produit peut figurer dans le stock : tel
 * que saisi (chiffres seuls) et normalisé (CIP7 → CIP13, EAN à 12 ou 14
 * chiffres). La comparaison reste exacte : jamais un préfixe ni une partie.
 */
function codeForms(raw: string | null): string[] {
  if (!raw) return [];
  const digits = raw.replace(/[\s.-]/g, "");
  return [...new Set([digits, normalizeProductCode(raw)])].filter((code): code is string => !!code && /^\d{7,14}$/.test(code));
}

/** Les produits du stock de l'officine de cette marque, ou dont le code correspond à un produit partenaire. */
async function stockMatches(scope: PartnerScope, key: string, codes: string[]): Promise<{ products: BrandPageStockProduct[]; total: number }> {
  const select = { id: true, name: true, brand: true, stockItem: { select: { quantity: true } } } as const;
  const [all, byCode] = await Promise.all([
    // Toutes les références actives de l'officine : la marque se reconnaît au
    // même critère que partout ailleurs (productMatchesBrand), pas par un LIKE
    // qui manquerait les accents et les traits d'union.
    prisma.product.findMany({ where: { pharmacyId: scope.pharmacyId, deletedAt: null, isActive: true }, select }),
    codes.length > 0
      ? prisma.product.findMany({
          where: { pharmacyId: scope.pharmacyId, deletedAt: null, OR: [{ ean: { in: codes } }, { barcodes: { some: { code: { in: codes } } } }] },
          select,
        })
      : Promise.resolve([]),
  ]);
  const found = new Map<string, BrandPageStockProduct>();
  for (const product of byCode) found.set(product.id, { id: product.id, name: product.name, quantity: product.stockItem?.quantity ?? null, matchedBy: "CODE" });
  for (const product of all) {
    if (found.has(product.id) || !productMatchesBrand(product, key)) continue;
    found.set(product.id, { id: product.id, name: product.name, quantity: product.stockItem?.quantity ?? null, matchedBy: "BRAND" });
  }
  const sorted = [...found.values()].sort((a, b) => (b.quantity ?? 0) - (a.quantity ?? 0) || a.name.localeCompare(b.name, "fr"));
  return { products: sorted.slice(0, STOCK_DISPLAY_LIMIT), total: sorted.length };
}

/** La page d'une marque pour l'officine ; null si la marque n'est pas consultable par elle. */
export async function partnerBrandPage(scope: PartnerScope, slug: string, now = new Date()): Promise<BrandPage | null> {
  const brand = await visibleBrandBySlug(scope, slug);
  if (!brand) return null;
  const pilot = await isPartnerPilot(scope.pharmacyId);

  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);

  const [partner, catalog, offers, documents, integration] = await Promise.all([
    prisma.partner.findUnique({
      where: { id: brand.partner.id },
      // Jamais les notes internes ni les contrats : seulement la présentation publique.
      select: { id: true, name: true, description: true, website: true, logoUrl: true },
    }),
    publishedCatalog(brand.id, pilot),
    prisma.partnerOffer.findMany({
      where: {
        partnerId: brand.partner.id,
        OR: [{ brandId: brand.id }, { brandId: null }],
        status: { in: ["TEST", "ACTIVE"] },
        AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, { OR: [{ validTo: null }, { validTo: { gte: startOfDay } }] }],
      },
      orderBy: [{ validTo: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        title: true,
        conditions: true,
        discountPercent: true,
        minimumOrderCents: true,
        validTo: true,
        status: true,
        range: { select: { name: true, status: true, brandId: true } },
      },
    }),
    prisma.partnerDocument.findMany({
      where: { brandId: brand.id, isActive: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, kind: true, url: true },
    }),
    activeIntegrationOf(brand.partner.id),
  ]);
  if (!partner) return null;

  const codes = [...new Set(catalog.products.flatMap((product) => [...codeForms(product.ean), ...codeForms(product.cip13)]))];
  const inStock = await stockMatches(scope, brandKey(brand.brandKey), codes);

  const toProduct = (product: (typeof catalog.products)[number]): BrandPageProduct => ({
    id: product.id,
    name: product.name,
    code: product.ean ?? product.cip13,
    packaging: product.packaging,
    description: product.description,
    proPriceCents: product.proPriceCents,
    publicPriceCents: product.publicPriceCents,
    rangeId: product.rangeId,
  });
  const ranges: BrandPageRange[] = catalog.ranges
    .map((range) => ({
      id: range.id,
      name: range.name,
      description: range.description,
      universe: range.universe,
      products: catalog.products.filter((product) => product.rangeId === range.id).map(toProduct),
    }))
    .filter((range) => range.products.length > 0 || range.description);
  const loose = catalog.products.filter((product) => product.rangeId === null).map(toProduct);
  if (loose.length > 0) ranges.push({ id: null, name: ranges.length > 0 ? "Autres produits" : "Produits", description: null, universe: null, products: loose });

  return {
    brand: {
      id: brand.id,
      slug: brand.slug,
      name: brand.name,
      brandKey: brand.brandKey,
      logoUrl: safeImage(brand.logoUrl) ?? safeImage(partner.logoUrl),
      description: brand.description,
      universes: [...new Set([...brand.universes, ...brand.rangeUniverses])],
      preference: brand.preference,
    },
    partner: {
      id: partner.id,
      name: partner.name,
      description: partner.description,
      website: partner.website && isSafeHttpUrl(partner.website) ? partner.website.trim() : null,
      logoUrl: safeImage(partner.logoUrl),
    },
    ranges,
    productCount: catalog.products.length,
    inStock,
    offers: offers
      .filter((offer) => itemVisible(offer.status, pilot))
      // Une offre rattachée à une gamme suit la gamme : d'une autre marque ou non publiée, elle n'apparaît pas.
      .filter((offer) => !offer.range || (offer.range.brandId === brand.id && itemVisible(offer.range.status, pilot)))
      .map((offer) => ({
        id: offer.id,
        title: offer.title,
        conditions: offer.conditions,
        discountPercent: decimalToNumber(offer.discountPercent),
        minimumOrderCents: offer.minimumOrderCents,
        validTo: offer.validTo,
        rangeName: offer.range?.name ?? null,
      })),
    documents: documents.filter((document) => isSafeHttpUrl(document.url)).map((document) => ({ ...document, url: document.url.trim() })),
    integration: integration
      ? { mode: integration.mode, linkReady: redirectLinkReady(integration), canOrder: modeAllowsOrder(integration.mode) && catalog.products.length > 0 }
      : null,
  };
}

/**
 * Les formations de la marque visibles par l'officine : les contenus
 * PharmaBoost et ceux de l'officine (règle de `listTrainings`), reliés à la
 * marque par sa marque normalisée.
 */
export async function brandTrainings(scope: PartnerScope, key: string): Promise<TrainingCard[]> {
  const normalized = brandKey(key);
  if (!normalized) return [];
  const catalog = await listTrainings(scope);
  return catalog.items.filter((item) => item.brandKey && brandKey(item.brandKey) === normalized).slice(0, 12);
}

/** Les coordonnées de l'officine transmises au partenaire : jamais de patient. */
export async function pharmacyIdentity(pharmacyId: string): Promise<{ name: string; city: string | null; finess: string | null; email: string | null; phone: string | null }> {
  const pharmacy = await prisma.pharmacy.findUniqueOrThrow({
    where: { id: pharmacyId },
    select: { name: true, city: true, finessNumber: true, email: true, phone: true },
  });
  return { name: pharmacy.name, city: pharmacy.city, finess: pharmacy.finessNumber, email: pharmacy.email, phone: pharmacy.phone };
}
