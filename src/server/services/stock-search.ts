import "server-only";
import { ProductCategory, type Prisma } from "@/generated/prisma";
import { prisma } from "@/server/db/client";
import { parseSearchQuery, scoreMatch, sqlStartPattern, sqlTermPattern, sqlTypedPattern, sqlWordPattern, type ParsedQuery } from "@/core/search/tolerant-search";
import { drugKey } from "@/core/ai/engines/associations";
import { stockStatus } from "./catalog";

/**
 * La recherche tolérante dans ce que l'officine détient, et dans le catalogue national.
 *
 * Trois sources, trois tables : les PRODUITS de l'officine (parapharmacie, produits conseil — `products`), les MÉDICAMENTS
 * de son stock (rangés à part : `pharmacy_drug_stocks`, rattachés aux présentations du catalogue national), et le catalogue
 * national lui-même. La base fait un premier tri large (motifs de `sqlTermPattern` : accents tolérés, sous-chaîne), puis
 * `scoreMatch` garde ce qui contient VRAIMENT chaque mot tapé et le classe. Tout ce qui touche au stock est borné par
 * `pharmacyId`, passé par l'appelant depuis la session — jamais depuis le client.
 *
 * Chaque requête est un texte FIXE : les mots tapés y entrent comme UN paramètre lié (un tableau de motifs, `text[]`),
 * « chaque motif doit répondre » s'écrivant `~* ALL(…)` ou en comptant les motifs trouvés. Aucun fragment SQL n'est
 * assemblé à l'exécution.
 *
 * Coût mesuré sur la pharmacie d'essai (2 373 produits, 1 934 médicaments en stock, 15 957 spécialités) : 5 à 30 ms par
 * requête, sans index ni colonne de plus.
 */

/* Les requêtes rendent au plus 300 lignes avant le classement fin (LIMIT 300) : bien plus que ce qu'on affiche. */
const MARKETED_SPECIALTY = "Commercialisée";
const CATEGORIES = new Set<string>(Object.values(ProductCategory));

/** Les motifs du premier tri, un par mot tapé (sans casse, accents tolérés) : chacun doit répondre. */
const patternsOf = (query: ParsedQuery): string[] => query.terms.map(sqlTermPattern);

/** Le meilleur d'abord, puis ce qui est en stock, puis le nom le plus court (le plus proche de la demande). */
const byRelevance = <T extends { score: number; quantity: number | null; name: string }>(a: T, b: T): number =>
  b.score - a.score || Number((b.quantity ?? 0) > 0) - Number((a.quantity ?? 0) > 0) || a.name.length - b.name.length || a.name.localeCompare(b.name, "fr");

// ---------------------------------------------------------------------------------------------------------------
// Les produits de l'officine
// ---------------------------------------------------------------------------------------------------------------

export type ProductHit = {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  reference: string;
  imageUrl: string | null;
  salePriceCents: number;
  quantity: number;
  status: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
  claims: string[];
  score: number;
};

const productInclude = { stockItem: { select: { quantity: true, alertThreshold: true } } } as const;
type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

const hitOf = (product: ProductRow, score: number): ProductHit => ({
  id: product.id,
  name: product.name,
  brand: product.brand,
  category: product.category,
  reference: product.reference,
  imageUrl: product.imageUrl,
  salePriceCents: product.salePriceCents,
  quantity: product.stockItem?.quantity ?? 0,
  status: stockStatus(product.stockItem?.quantity ?? 0, product.stockItem?.alertThreshold ?? 0),
  claims: product.commercialClaims,
  score,
});

/**
 * Les produits actifs de l'officine qui répondent à la recherche, les plus pertinents d'abord. Sans mot significatif : les
 * premiers par ordre alphabétique (l'écran de vente ouvre la liste avant la première lettre). Un code lu à la douchette
 * (EAN, code appris au comptoir, référence) qui désigne exactement un produit ne rend que lui : « Entrée » l'ajoute sans clic.
 */
export async function searchPharmacyProducts(pharmacyId: string, raw: string, options: { category?: string | null; limit?: number } = {}): Promise<ProductHit[]> {
  const limit = options.limit ?? 20;
  const category = options.category ?? null;
  if (category && !CATEGORIES.has(category)) return [];
  const base = { pharmacyId, deletedAt: null, isActive: true, ...(category ? { category: category as ProductCategory } : {}) };
  const query = parseSearchQuery(raw);

  if (query.terms.length === 0) {
    const products = await prisma.product.findMany({ where: base, include: productInclude, orderBy: { name: "asc" }, take: limit });
    return products.map((product) => hitOf(product, 0));
  }

  if (query.code) {
    const exact = await prisma.product.findMany({
      where: { ...base, OR: [{ ean: query.code }, { reference: query.code }, { barcodes: { some: { pharmacyId, code: query.code } } }] },
      include: productInclude,
      orderBy: { name: "asc" },
      take: limit,
    });
    if (exact.length > 0) return exact.map((product) => hitOf(product, 100));
  }

  const ranked = await rankPharmacyProducts(pharmacyId, query, category, limit);
  if (ranked.length === 0) return [];
  const products = await prisma.product.findMany({ where: { pharmacyId, id: { in: ranked.map((hit) => hit.id) } }, include: productInclude });
  const byId = new Map(products.map((product) => [product.id, product]));
  return ranked.flatMap((hit) => {
    const product = byId.get(hit.id);
    return product ? [hitOf(product, hit.score)] : [];
  });
}

async function rankPharmacyProducts(pharmacyId: string, query: ParsedQuery, category: string | null, limit: number): Promise<{ id: string; score: number }[]> {
  const rows = await prisma.$queryRaw<{ id: string; name: string; brand: string | null; reference: string; ean: string | null; tags: string[]; quantity: number }[]>`
    SELECT p."id", p."name", p."brand", p."reference", p."ean", p."matchingTags" AS "tags", coalesce(si."quantity", 0)::int AS "quantity"
    FROM "products" p
    LEFT JOIN "stock_items" si ON si."productId" = p."id"
    CROSS JOIN LATERAL (SELECT p."name" || ' ' || coalesce(p."brand", '') || ' ' || p."reference" || ' ' || coalesce(p."ean", '') || ' ' || array_to_string(p."matchingTags", ' ') AS "text") t
    WHERE p."pharmacyId" = ${pharmacyId}
      AND p."deletedAt" IS NULL
      AND p."isActive" = true
      AND (${category}::text IS NULL OR p."category"::text = ${category}::text)
      AND t."text" ~* ALL(${patternsOf(query)}::text[])
    ORDER BY (p."name" ~* ${sqlStartPattern(query.terms[0])}) DESC,
             (t."text" ~* ALL(${query.terms.map(sqlWordPattern)}::text[])) DESC,
             (p."name" ~* ALL(${query.terms.map(sqlTypedPattern)}::text[])) DESC,
             p."name" ASC
    LIMIT 300`;
  // Un produit se trouve aussi par un mot collé dans son libellé (« biafine » → « CICABIAFINE »), classé après : le tri de la
  // base est déjà une sous-chaîne, seule la comparaison fine s'élargit. La base lit d'abord le nom qui commence par le premier
  // mot, puis chaque mot au début d'un mot, puis chaque mot dans le NOM : les 300 lignes lues gardent d'abord les vraies
  // réponses, avant ce qu'une étiquette ou une abréviation d'une lettre ramène. Les médicaments, eux, restent au début d'un mot.
  return rows
    .flatMap((row) => {
      const score = scoreMatch(query, row.name, [row.brand, row.reference, row.ean, ...row.tags], { inside: true });
      return score === null ? [] : [{ id: row.id, name: row.name, quantity: row.quantity, score }];
    })
    .sort(byRelevance)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------------------------------------------
// Les médicaments du stock de l'officine, et ceux du catalogue national
// ---------------------------------------------------------------------------------------------------------------

/** Un médicament, tel que l'écran « Mes associations » le propose : la spécialité (toutes ses formes), pas la boîte. */
export type DrugHit = {
  specialtyId: string;
  name: string;
  /** Le conditionnement détenu qui répond le mieux (« … de 15 comprimé(s) ») ; absent hors du stock. */
  label: string | null;
  substances: string[];
  /** Le total des boîtes détenues de cette spécialité ; `null` hors du stock. */
  quantity: number | null;
  marketed: boolean;
  score: number;
};

const substancesOf = (joined: string | null): string[] => (joined ? [...new Set(joined.split("\u001f").filter(Boolean))] : []);

/**
 * Les médicaments que l'officine détient (quantité comprise, même à zéro), regroupés par spécialité. Un mot répond par le
 * nom, le conditionnement ou le code de la boîte, ou par une substance (n'importe quelle nature : SA ou FT) — la cétirizine
 * trouve ZYRTEC. On compte, pour chaque boîte, les mots qui ont répondu : il les faut tous.
 */
export async function searchStockDrugs(pharmacyId: string, query: ParsedQuery, limit = 12): Promise<DrugHit[]> {
  return (await rankStockDrugs(pharmacyId, query)).slice(0, limit);
}

/** Tous les médicaments détenus qui répondent (au plus 300 boîtes lues), classés : « Autres médicaments » s'en sert en entier. */
async function rankStockDrugs(pharmacyId: string, query: ParsedQuery): Promise<DrugHit[]> {
  if (query.terms.length === 0) return [];
  const patterns = patternsOf(query);
  const rows = await prisma.$queryRaw<{ specialtyId: string; name: string; marketingStatus: string | null; label: string; cip13: string; cip7: string; quantity: number; substances: string | null }[]>`
    WITH pats AS (SELECT t."p", t."ord" FROM unnest(${patterns}::text[]) WITH ORDINALITY AS t("p", "ord")),
    held AS MATERIALIZED (
      SELECT s."id" AS "stockId", s."quantity", pr."label", pr."cip13", pr."cip7", sp."id" AS "specialtyId", sp."name", sp."marketingStatus",
             sp."name" || ' ' || pr."label" || ' ' || pr."cip13" || ' ' || pr."cip7" AS "text"
      FROM "pharmacy_drug_stocks" s
      JOIN "drug_presentations" pr ON pr."id" = s."presentationId"
      JOIN "drug_specialties" sp ON sp."id" = pr."specialtyId"
      WHERE s."pharmacyId" = ${pharmacyId}
    ),
    hits AS (
      SELECT h."stockId", pats."ord" FROM held h JOIN pats ON h."text" ~* pats."p"
      UNION
      SELECT h."stockId", pats."ord" FROM pats
      JOIN "drug_substances" su ON su."label" ~* pats."p"
      JOIN "drug_compositions" c ON c."substanceId" = su."id"
      JOIN held h ON h."specialtyId" = c."specialtyId"
    )
    SELECT h."specialtyId", h."name", h."marketingStatus", h."label", h."cip13", h."cip7", h."quantity",
           (SELECT string_agg(DISTINCT su."label", chr(31)) FROM "drug_compositions" c JOIN "drug_substances" su ON su."id" = c."substanceId" WHERE c."specialtyId" = h."specialtyId") AS "substances"
    FROM held h
    WHERE h."stockId" IN (SELECT "stockId" FROM hits GROUP BY "stockId" HAVING count(DISTINCT "ord") = ${patterns.length}::int)
    ORDER BY (h."name" ~* ${sqlStartPattern(query.terms[0])}) DESC, h."name" ASC
    LIMIT 300`;

  const bySpecialty = new Map<string, DrugHit>();
  for (const row of rows) {
    const substances = substancesOf(row.substances);
    const score = scoreMatch(query, row.name, [row.label, row.cip13, row.cip7, ...substances]);
    if (score === null) continue;
    const known = bySpecialty.get(row.specialtyId);
    if (!known) {
      bySpecialty.set(row.specialtyId, { specialtyId: row.specialtyId, name: row.name, label: row.label, substances, quantity: row.quantity, marketed: row.marketingStatus === MARKETED_SPECIALTY, score });
      continue;
    }
    // Plusieurs boîtes de la même spécialité : une seule ligne, le total détenu, le conditionnement qui répond le mieux.
    known.quantity = (known.quantity ?? 0) + row.quantity;
    if (score > known.score) Object.assign(known, { label: row.label, score });
  }
  return [...bySpecialty.values()].sort(byRelevance);
}

/**
 * Les spécialités du catalogue national (nom ou substance), hors retirées. Un nombre seul (« boîte de 15 ») peut désigner le
 * conditionnement : il est vérifié sur les présentations, pas exigé dans le nom. Un code CIP désigne sa spécialité.
 */
export async function searchCatalogDrugs(query: ParsedQuery, limit = 10): Promise<DrugHit[]> {
  if (query.code) {
    const presentation = await prisma.drugPresentation.findFirst({
      where: { OR: [{ cip13: query.code }, { cip7: query.code }] },
      select: { label: true, specialty: { select: { id: true, name: true, marketingStatus: true, withdrawnAt: true } } },
    });
    if (presentation && !presentation.specialty.withdrawnAt) {
      const { specialty } = presentation;
      return [{ specialtyId: specialty.id, name: specialty.name, label: presentation.label, substances: [], quantity: null, marketed: specialty.marketingStatus === MARKETED_SPECIALTY, score: 100 }];
    }
  }
  const named = query.terms.filter((term) => !term.bareNumber);
  if (named.length === 0) return [];

  const patterns = named.map(sqlTermPattern);
  const rows = await prisma.$queryRaw<{ id: string; name: string; marketingStatus: string | null; substances: string | null }[]>`
    WITH pats AS (SELECT t."p", t."ord" FROM unnest(${patterns}::text[]) WITH ORDINALITY AS t("p", "ord")),
    hits AS (
      SELECT sp."id", pats."ord" FROM "drug_specialties" sp JOIN pats ON sp."name" ~* pats."p" WHERE sp."withdrawnAt" IS NULL
      UNION
      SELECT c."specialtyId" AS "id", pats."ord" FROM pats
      JOIN "drug_substances" su ON su."label" ~* pats."p"
      JOIN "drug_compositions" c ON c."substanceId" = su."id"
    )
    SELECT sp."id", sp."name", sp."marketingStatus",
           (SELECT string_agg(DISTINCT su."label", chr(31)) FROM "drug_compositions" c JOIN "drug_substances" su ON su."id" = c."substanceId" WHERE c."specialtyId" = sp."id") AS "substances"
    FROM "drug_specialties" sp
    WHERE sp."withdrawnAt" IS NULL
      AND sp."id" IN (SELECT "id" FROM hits GROUP BY "id" HAVING count(DISTINCT "ord") = ${patterns.length}::int)
    ORDER BY (sp."name" ~* ${sqlStartPattern(named[0])}) DESC, (sp."marketingStatus" = ${MARKETED_SPECIALTY}) DESC, sp."name" ASC
    LIMIT 300`;
  if (rows.length === 0) return [];

  const needsLabels = query.terms.some((term) => term.bareNumber);
  const labels = new Map<string, string[]>();
  if (needsLabels) {
    const presentations = await prisma.drugPresentation.findMany({ where: { specialtyId: { in: rows.map((row) => row.id) }, withdrawnAt: null }, select: { specialtyId: true, label: true } });
    for (const presentation of presentations) labels.set(presentation.specialtyId, [...(labels.get(presentation.specialtyId) ?? []), presentation.label]);
  }

  return rows
    .flatMap((row): DrugHit[] => {
      const substances = substancesOf(row.substances);
      const score = scoreMatch(query, row.name, [...substances, ...(labels.get(row.id) ?? [])]);
      return score === null ? [] : [{ specialtyId: row.id, name: row.name, label: null, substances, quantity: null, marketed: row.marketingStatus === MARKETED_SPECIALTY, score }];
    })
    .sort((a, b) => b.score - a.score || Number(b.marketed) - Number(a.marketed) || a.name.length - b.name.length || a.name.localeCompare(b.name, "fr"))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------------------------------------------
// Le déclencheur d'une association : un seul champ, trois sources
// ---------------------------------------------------------------------------------------------------------------

export type TriggerOption =
  | { kind: "DRUG"; specialtyId: string; name: string; label: string | null; substances: string[]; quantity: number | null; marketed: boolean }
  | { kind: "PRODUCT"; productId: string; name: string; brand: string | null; quantity: number; status: ProductHit["status"] };

export type TriggerSearch = {
  /** Ce que l'officine détient : ses médicaments et ses produits, mêlés par pertinence. */
  stock: TriggerOption[];
  /** Les autres médicaments du catalogue national (Coryzalia se lit par son code CIP : il n'est pas toujours dans le stock). */
  catalogue: TriggerOption[];
};

const STOCK_SHOWN = 12;
const CATALOGUE_SHOWN = 8;
/** Les spécialités du catalogue lues pour en garder huit : celles que l'officine détient en sortent. */
const CATALOGUE_READ = 40;

/** « Quand ce produit ou ce médicament est dans la vente » : une recherche, les résultats groupés. */
export async function searchAssociationTriggers(pharmacyId: string, raw: string): Promise<TriggerSearch> {
  const query = parseSearchQuery(raw);
  if (query.terms.length === 0) return { stock: [], catalogue: [] };
  const [found, products, catalogue] = await Promise.all([
    rankStockDrugs(pharmacyId, query),
    searchPharmacyProducts(pharmacyId, raw, { limit: STOCK_SHOWN }),
    searchCatalogDrugs(query, CATALOGUE_READ),
  ]);
  // Une association vaut pour toutes les formes d'un médicament (`drugKey` : le nom sans la forme) : « Autres médicaments »
  // ne repropose ni un médicament détenu, sous cette forme ou une autre, ni deux fois le même nom. « Détenu » se juge sur
  // TOUT ce que le stock a rendu (pas seulement les douze affichés), puis, pour ce qui reste du catalogue, dans le stock
  // lui-même : un médicament détenu passe dans « Dans mon stock » avec sa quantité, jamais en « catalogue national ».
  const held = new Set(found.map((hit) => drugKey(hit.name)));
  const missed = await heldAmong(pharmacyId, catalogue.filter((hit) => !held.has(drugKey(hit.name))));
  for (const hit of missed) held.add(drugKey(hit.name));
  const drugs = [...found, ...missed];
  const others = catalogue.filter((hit) => {
    const key = drugKey(hit.name);
    if (held.has(key)) return false;
    held.add(key);
    return true;
  });
  const stock = [
    ...drugs.map((hit) => ({ option: drugOption(hit), score: hit.score, quantity: hit.quantity, name: hit.name })),
    ...products.map((hit) => ({ option: productOption(hit), score: hit.score, quantity: hit.quantity, name: hit.name })),
  ];
  return {
    stock: stock.sort(byRelevance).slice(0, STOCK_SHOWN).map((entry) => entry.option),
    catalogue: others.slice(0, CATALOGUE_SHOWN).map(drugOption),
  };
}

/**
 * Ce que l'officine détient parmi des spécialités du catalogue — elles-mêmes ou une autre forme du même médicament (même
 * `drugKey`) —, lu dans SON stock par identifiant et par nom sans la forme. Rattrape ce que la recherche dans le stock n'a pas
 * rendu : « boîte de 15 » quand seule la boîte de 30 est détenue, ou au-delà des 300 boîtes lues. Une ligne par spécialité
 * détenue, le total de ses boîtes, le libellé de la plus fournie ; la pertinence est celle de la spécialité du catalogue.
 */
async function heldAmong(pharmacyId: string, candidates: DrugHit[]): Promise<DrugHit[]> {
  if (candidates.length === 0) return [];
  const byKey = new Map(candidates.map((hit) => [drugKey(hit.name), hit]));
  const ids = candidates.map((hit) => hit.specialtyId);
  const names = [...new Set(candidates.map((hit) => hit.name.split(",")[0].trim()))];
  const rows = await prisma.$queryRaw<{ specialtyId: string; name: string; marketingStatus: string | null; label: string; quantity: number }[]>`
    SELECT sp."id" AS "specialtyId", sp."name", sp."marketingStatus", pr."label", s."quantity"
    FROM "pharmacy_drug_stocks" s
    JOIN "drug_presentations" pr ON pr."id" = s."presentationId"
    JOIN "drug_specialties" sp ON sp."id" = pr."specialtyId"
    WHERE s."pharmacyId" = ${pharmacyId}
      AND (sp."id" = ANY(${ids}::text[]) OR btrim(split_part(sp."name", ',', 1)) = ANY(${names}::text[]))
    ORDER BY s."quantity" DESC`;
  const held = new Map<string, DrugHit>();
  for (const row of rows) {
    const candidate = byKey.get(drugKey(row.name));
    if (!candidate) continue;
    const known = held.get(row.specialtyId);
    if (known) known.quantity = (known.quantity ?? 0) + row.quantity;
    else held.set(row.specialtyId, { specialtyId: row.specialtyId, name: row.name, label: row.label, substances: candidate.substances, quantity: row.quantity, marketed: row.marketingStatus === MARKETED_SPECIALTY, score: candidate.score });
  }
  return [...held.values()];
}

const drugOption = (hit: DrugHit): TriggerOption => ({ kind: "DRUG", specialtyId: hit.specialtyId, name: hit.name, label: hit.label, substances: hit.substances, quantity: hit.quantity, marketed: hit.marketed });
const productOption = (hit: ProductHit): TriggerOption => ({ kind: "PRODUCT", productId: hit.id, name: hit.name, brand: hit.brand, quantity: hit.quantity, status: hit.status });
