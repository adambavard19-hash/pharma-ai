import "server-only";
import { prisma } from "@/server/db/client";
import { normalizeSearchText } from "@/core/reference/search";
import {
  drugStockState,
  readScannedCode,
  SCAN_REJECTION_MESSAGES,
  type DrugStockState,
  type ScannedCode,
} from "@/core/stock";

/**
 * La recherche unique du comptoir.
 *
 * Un seul champ, trois façons de s'en servir : passer une douchette sur la
 * boîte, taper un nom de médicament, taper une substance. Le catalogue national
 * est partagé ; ce qui change d'une officine à l'autre, c'est uniquement la
 * ligne de stock qu'on lui joint ici.
 */

export type DrugCatalogResult = {
  presentationId: string;
  cip13: string;
  cip7: string;
  /** Libellé de la boîte : « plaquette(s) de 30 comprimé(s) ». */
  label: string;
  specialtyName: string;
  pharmaceuticalForm: string | null;
  administrationRoutes: string[];
  /** L'officine peut-elle encore se la procurer ? */
  marketed: boolean;
  /** Substances actives telles qu'écrites sur la boîte. */
  substances: string[];
  prescriptionConditions: string[];
  priceCents: number | null;
  reimbursementRateRaw: string | null;
  stock: DrugStockLine | null;
  state: DrugStockState;
};

export type DrugStockLine = {
  id: string;
  quantity: number;
  alertThreshold: number;
  location: string | null;
  lastCountedAt: Date | null;
};

const MARKETED = "Déclaration de commercialisation";

const presentationSelect = {
  id: true,
  cip13: true,
  cip7: true,
  label: true,
  marketingStatus: true,
  priceCents: true,
  reimbursementRateRaw: true,
  specialty: {
    select: {
      name: true,
      pharmaceuticalForm: true,
      administrationRoutes: true,
      compositions: {
        // « SA » : la substance telle qu'elle figure sur la boîte. La fraction
        // thérapeutique intéresse le moteur de conseil, pas le comptoir.
        where: { nature: "SA" },
        select: { substanceLabel: true },
      },
      prescriptionConditions: { select: { label: true } },
    },
  },
} as const;

type PresentationRow = {
  id: string;
  cip13: string;
  cip7: string;
  label: string;
  marketingStatus: string | null;
  priceCents: number | null;
  reimbursementRateRaw: string | null;
  specialty: {
    name: string;
    pharmaceuticalForm: string | null;
    administrationRoutes: string[];
    compositions: { substanceLabel: string }[];
    prescriptionConditions: { label: string }[];
  };
};

function toResult(row: PresentationRow, stock: DrugStockLine | null): DrugCatalogResult {
  return {
    presentationId: row.id,
    cip13: row.cip13,
    cip7: row.cip7,
    label: row.label,
    specialtyName: row.specialty.name,
    pharmaceuticalForm: row.specialty.pharmaceuticalForm,
    administrationRoutes: row.specialty.administrationRoutes,
    marketed: row.marketingStatus === MARKETED,
    substances: [...new Set(row.specialty.compositions.map((item) => item.substanceLabel))],
    prescriptionConditions: row.specialty.prescriptionConditions.map((item) => item.label),
    priceCents: row.priceCents,
    reimbursementRateRaw: row.reimbursementRateRaw,
    stock,
    state: drugStockState(stock),
  };
}

/** Joint à chaque présentation la ligne de stock de CETTE officine, s'il y en a une. */
async function withStock(
  pharmacyId: string,
  rows: PresentationRow[],
): Promise<DrugCatalogResult[]> {
  if (rows.length === 0) return [];

  const stocks = await prisma.pharmacyDrugStock.findMany({
    where: { pharmacyId, presentationId: { in: rows.map((row) => row.id) } },
    select: {
      id: true,
      presentationId: true,
      quantity: true,
      alertThreshold: true,
      location: true,
      lastCountedAt: true,
    },
  });
  const byPresentation = new Map(stocks.map(({ presentationId, ...line }) => [presentationId, line]));

  return rows.map((row) => toResult(row, byPresentation.get(row.id) ?? null));
}

/**
 * Les conditions de recherche textuelle sur une présentation.
 *
 * Deux formes du texte sont cherchées, et c'est délibéré :
 *
 *   • la forme normalisée (sans accents, en majuscules), qui est celle que le
 *     pharmacien tape — elle vit dans une colonne dérivée remplie à l'import ;
 *   • le libellé officiel tel quel, qui reste la seule forme disponible tant
 *     qu'un catalogue importé avant l'ajout de cette colonne n'a pas été
 *     resynchronisé.
 *
 * La seconde n'est pas une redondance : sans elle, un catalogue déjà en place
 * cesserait de répondre du jour au lendemain, sans le moindre message.
 */
function drugTextFilters(text: string) {
  const raw = { contains: text, mode: "insensitive" as const };
  const normalized = { contains: normalizeSearchText(text), mode: "insensitive" as const };

  return [
    { specialty: { searchName: normalized } },
    { specialty: { name: raw } },
    { specialty: { compositions: { some: { substance: { searchLabel: normalized } } } } },
    { specialty: { compositions: { some: { substance: { label: raw } } } } },
  ];
}

export type DrugSearchOptions = {
  pharmacyId: string;
  query: string;
  limit?: number;
  /** Ne rend que ce que l'officine détient réellement. */
  onlyInStock?: boolean;
};

const DEFAULT_LIMIT = 25;

/**
 * Recherche par nom de médicament, par substance ou par code.
 *
 * Les présentations retirées de la source sont écartées : proposer d'ajouter au
 * stock une boîte qui n'existe plus n'aiderait personne. Celles que l'officine
 * détient déjà restent visibles par la liste de stock, qui ne filtre pas.
 */
export async function searchDrugCatalog(
  options: DrugSearchOptions,
): Promise<DrugCatalogResult[]> {
  const query = options.query.trim();
  if (query.length < 2) return [];

  const scanned = readScannedCode(query);
  const limit = options.limit ?? DEFAULT_LIMIT;

  if (scanned.kind === "CIP13" || scanned.kind === "CIP7") {
    const row = await prisma.drugPresentation.findUnique({
      where: { cip13: scanned.cip13 },
      select: presentationSelect,
    });
    return row ? withStock(options.pharmacyId, [row]) : [];
  }

  const text = scanned.kind === "TEXT" ? scanned.query : query;

  const where = {
    withdrawnAt: null,
    ...(options.onlyInStock
      ? { pharmacyStocks: { some: { pharmacyId: options.pharmacyId, quantity: { gt: 0 } } } }
      : {}),
    OR: drugTextFilters(text),
  };
  const orderBy = [{ specialty: { name: "asc" as const } }, { cip13: "asc" as const }];

  // Deux passes plutôt qu'un tri sur le libellé du statut : « Déclaration
  // d'arrêt de commercialisation » se classe AVANT « Déclaration de
  // commercialisation » dans tous les ordres alphabétiques, ce qui remonterait
  // en tête ce que l'officine ne peut plus commander. On demande donc d'abord
  // ce qui est commercialisé, puis on complète.
  const marketed = await prisma.drugPresentation.findMany({
    where: { ...where, marketingStatus: MARKETED },
    select: presentationSelect,
    orderBy,
    take: limit,
  });

  const rest =
    marketed.length >= limit
      ? []
      : await prisma.drugPresentation.findMany({
          where: { ...where, marketingStatus: { not: MARKETED } },
          select: presentationSelect,
          orderBy,
          take: limit - marketed.length,
        });

  return withStock(options.pharmacyId, [...marketed, ...rest]);
}

export type ScanOutcome =
  | { kind: "DRUG"; result: DrugCatalogResult; scanned: ScannedCode }
  /** Code de médicament bien formé, mais absent du catalogue national. */
  | { kind: "DRUG_UNKNOWN"; cip13: string }
  /** Code-barres de parapharmacie : c'est le catalogue de l'officine qui répond. */
  | { kind: "PRODUCT"; productId: string; name: string; quantity: number }
  | { kind: "PRODUCT_UNKNOWN"; ean13: string }
  | { kind: "INVALID"; message: string }
  | { kind: "TEXT"; results: DrugCatalogResult[] };

/**
 * Le point d'entrée unique du champ de recherche.
 *
 * Un code-barres hors catalogue médicament n'est pas une erreur : c'est un
 * produit de parapharmacie, et l'officine en tient déjà la liste. Les deux
 * catalogues restent séparés en base ; c'est ici, et seulement ici, qu'ils se
 * rejoignent pour le pharmacien.
 */
export async function resolveScannedInput(
  pharmacyId: string,
  raw: string,
): Promise<ScanOutcome> {
  const scanned = readScannedCode(raw);

  switch (scanned.kind) {
    case "CIP13":
    case "CIP7": {
      const row = await prisma.drugPresentation.findUnique({
        where: { cip13: scanned.cip13 },
        select: presentationSelect,
      });
      if (!row) return { kind: "DRUG_UNKNOWN", cip13: scanned.cip13 };
      const [result] = await withStock(pharmacyId, [row]);
      return { kind: "DRUG", result, scanned };
    }

    case "EAN13": {
      const product = await prisma.product.findFirst({
        where: { pharmacyId, ean: scanned.ean13, deletedAt: null },
        select: { id: true, name: true, stockItem: { select: { quantity: true } } },
      });
      return product
        ? {
            kind: "PRODUCT",
            productId: product.id,
            name: product.name,
            quantity: product.stockItem?.quantity ?? 0,
          }
        : { kind: "PRODUCT_UNKNOWN", ean13: scanned.ean13 };
    }

    case "INVALID":
      return { kind: "INVALID", message: SCAN_REJECTION_MESSAGES[scanned.reason] };

    case "TEXT":
      return { kind: "TEXT", results: await searchDrugCatalog({ pharmacyId, query: scanned.query }) };
  }
}

export type DrugStockSummary = {
  /** Lignes référencées par l'officine, quelle que soit la quantité. */
  referenced: number;
  /** Lignes réellement détenues — les seules proposables. */
  inStock: number;
  /** Référencées mais épuisées. */
  empty: number;
  /** Sous le seuil d'alerte fixé par l'officine. */
  low: number;
};

export async function getDrugStockSummary(pharmacyId: string): Promise<DrugStockSummary> {
  const [referenced, inStock, low] = await Promise.all([
    prisma.pharmacyDrugStock.count({ where: { pharmacyId } }),
    prisma.pharmacyDrugStock.count({ where: { pharmacyId, quantity: { gt: 0 } } }),
    // Un seuil à zéro veut dire « pas d'alerte » : la comparaison ne doit pas
    // faire passer tout le stock épuisé pour une alerte de réassort.
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint AS count
      FROM "pharmacy_drug_stocks"
      WHERE "pharmacyId" = ${pharmacyId}
        AND "alertThreshold" > 0
        AND "quantity" <= "alertThreshold"
    `,
  ]);

  return {
    referenced,
    inStock,
    empty: referenced - inStock,
    low: Number(low[0]?.count ?? 0),
  };
}

export type DrugStockListOptions = {
  pharmacyId: string;
  query?: string;
  page?: number;
  pageSize?: number;
  onlyLow?: boolean;
};

export async function listDrugStock(options: DrugStockListOptions): Promise<{
  results: DrugCatalogResult[];
  total: number;
}> {
  const pageSize = options.pageSize ?? 30;
  const page = Math.max(1, options.page ?? 1);
  const query = (options.query ?? "").trim();

  const where = {
    pharmacyId: options.pharmacyId,
    ...(options.onlyLow ? { quantity: { lte: 0 } } : {}),
    ...(query
      ? {
          presentation: {
            OR: [{ cip13: { startsWith: query } }, ...drugTextFilters(query)],
          },
        }
      : {}),
  };

  const [lines, total] = await Promise.all([
    prisma.pharmacyDrugStock.findMany({
      where,
      select: {
        id: true,
        quantity: true,
        alertThreshold: true,
        location: true,
        lastCountedAt: true,
        presentation: { select: presentationSelect },
      },
      orderBy: [{ quantity: "asc" }, { updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.pharmacyDrugStock.count({ where }),
  ]);

  return {
    results: lines.map(({ presentation, ...line }) => toResult(presentation, line)),
    total,
  };
}

/**
 * Ce que l'officine détient des médicaments PRESCRITS.
 *
 * C'est la question que le pharmacien se pose en premier — « est-ce que je
 * l'ai ? » — et à laquelle Pharma.ai ne savait pas répondre : le catalogue
 * national et le stock de l'officine existaient côte à côte sans se parler.
 *
 * La réponse porte sur la SPÉCIALITÉ, pas sur la boîte : une officine qui
 * détient une autre présentation du même médicament peut délivrer. Les
 * présentations réellement détenues sont rendues pour que le pharmacien voie
 * laquelle.
 */
export type PrescribedAvailability = {
  lineId: string;
  state: DrugStockState | "UNKNOWN";
  /** Quantité totale, toutes présentations de la spécialité confondues. */
  quantity: number;
  presentations: { cip13: string; label: string; quantity: number }[];
};

export async function loadPrescribedAvailability(
  pharmacyId: string,
  prescriptionId: string,
): Promise<Map<string, PrescribedAvailability>> {
  const lines = await prisma.prescriptionLine.findMany({
    where: { prescriptionId },
    select: { id: true, drugSpecialtyId: true },
  });

  const result = new Map<string, PrescribedAvailability>();
  const specialtyIds = [
    ...new Set(lines.map((line) => line.drugSpecialtyId).filter((id): id is string => id !== null)),
  ];

  for (const line of lines) {
    result.set(line.id, {
      lineId: line.id,
      // Une ligne non rattachée n'est pas « hors stock » : on ne sait pas.
      // Confondre les deux ferait croire à une rupture inexistante.
      state: line.drugSpecialtyId ? "NOT_REFERENCED" : "UNKNOWN",
      quantity: 0,
      presentations: [],
    });
  }

  if (specialtyIds.length === 0) return result;

  const stocks = await prisma.pharmacyDrugStock.findMany({
    where: { pharmacyId, presentation: { specialtyId: { in: specialtyIds } } },
    select: {
      quantity: true,
      presentation: { select: { cip13: true, label: true, specialtyId: true } },
    },
  });

  const bySpecialty = new Map<string, typeof stocks>();
  for (const stock of stocks) {
    const list = bySpecialty.get(stock.presentation.specialtyId) ?? [];
    list.push(stock);
    bySpecialty.set(stock.presentation.specialtyId, list);
  }

  for (const line of lines) {
    if (!line.drugSpecialtyId) continue;
    const held = bySpecialty.get(line.drugSpecialtyId) ?? [];
    if (held.length === 0) continue;

    const quantity = held.reduce((sum, stock) => sum + stock.quantity, 0);
    result.set(line.id, {
      lineId: line.id,
      state: drugStockState({ quantity }),
      quantity,
      presentations: held.map((stock) => ({
        cip13: stock.presentation.cip13,
        label: stock.presentation.label,
        quantity: stock.quantity,
      })),
    });
  }

  return result;
}
