import "server-only";
import { prisma } from "@/server/db/client";
import { TIME_ZONE } from "@/config/constants";
import { normalizeSearchText } from "@/core/reference/search";
import {
  DEFAULT_SHORT_DATE_THRESHOLDS,
  daysUntil,
  expiryLevel,
  nearestShortDate,
  normalizeThresholds,
  type ExpiryLevel,
  type ShortDate,
  type ShortDateThresholds,
} from "@/core/stock/expiry";
import {
  addDays,
  calendarDate,
  lotIdentityKey,
  normalizeLotNumber,
  toIsoDay,
  toPharmacyDay,
  type ExpiryPrecision,
  type LotResolution,
} from "@/core/stock/expiry-input";

/**
 * Dates courtes : les lots que l'officine suit, et leur date de péremption.
 *
 * Une couche À PART du stock. Un lot ne modifie JAMAIS une quantité : le
 * logiciel de gestion reste la référence de ce qui est en rayon. Le lot dit
 * seulement « ces boîtes-là périment tel jour ». Le sortir du suivi (vendu,
 * retourné, détruit) ne décrémente rien non plus.
 *
 * Tout est cloisonné par officine : chaque requête porte `scope.pharmacyId`,
 * et tout identifiant venu du client est revérifié dans l'officine avant
 * d'être lu ou modifié.
 */

export type LotScope = { pharmacyId: string; userId: string };

export type LotKind = "PRODUCT" | "DRUG";

export type LotView = {
  id: string;
  kind: LotKind;
  productId: string | null;
  presentationId: string | null;
  /** Nom figé à la saisie. */
  label: string;
  /** Marque, ou CIP et conditionnement d'un médicament. */
  detail: string | null;
  lotNumber: string | null;
  quantity: number | null;
  /** « 2027-03-31 ». */
  expiresOn: string;
  precision: ExpiryPrecision;
  daysLeft: number;
  level: ExpiryLevel;
  source: "MANUAL" | "IMPORT" | "SCAN";
  note: string | null;
  /** Fiche du produit ou du médicament ; null si le produit a été supprimé. */
  href: string | null;
};

export type LotCounts = Record<ExpiryLevel | "ALL", number>;

type PharmacyLotSettings = { thresholds: ShortDateThresholds; timeZone: string };

async function loadSettings(pharmacyId: string): Promise<PharmacyLotSettings> {
  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: pharmacyId },
    select: { shortDateSoonDays: true, shortDateUrgentDays: true, timezone: true },
  });
  if (!pharmacy) return { thresholds: DEFAULT_SHORT_DATE_THRESHOLDS, timeZone: TIME_ZONE };
  return {
    thresholds: normalizeThresholds(pharmacy.shortDateSoonDays, pharmacy.shortDateUrgentDays),
    timeZone: pharmacy.timezone || TIME_ZONE,
  };
}

function asPrecision(value: string): ExpiryPrecision {
  return value === "MONTH" ? "MONTH" : "DAY";
}

/**
 * Le jour de l'officine, à minuit UTC. Accepte un instant (`new Date()`) comme
 * un jour déjà calculé ; une date absente ou invalide vaut « maintenant ».
 */
function officeDay(value: Date | null | undefined, timeZone: string): Date {
  const base = value && !Number.isNaN(value.getTime()) ? value : new Date();
  return toPharmacyDay(base, timeZone);
}

/** Le jour de l'officine (dans son fuseau), à minuit UTC. */
export async function todayFor(pharmacyId: string, now = new Date()): Promise<Date> {
  const settings = await loadSettings(pharmacyId);
  return calendarDate(now, settings.timeZone);
}

export async function getThresholds(scope: LotScope): Promise<ShortDateThresholds> {
  return (await loadSettings(scope.pharmacyId)).thresholds;
}

export async function updateThresholds(scope: LotScope, input: { soonDays: number; urgentDays: number }): Promise<ShortDateThresholds> {
  if (!Number.isFinite(input.soonDays) || !Number.isFinite(input.urgentDays)) return getThresholds(scope);
  const thresholds = normalizeThresholds(input.soonDays, input.urgentDays);
  await prisma.pharmacy.update({
    where: { id: scope.pharmacyId },
    data: { shortDateSoonDays: thresholds.soonDays, shortDateUrgentDays: thresholds.urgentDays },
  });
  return thresholds;
}

const LIST_LIMIT = 1000;

/**
 * Les lots encore suivis (non sortis), du plus urgent au plus lointain, avec
 * les compteurs par niveau. `level` filtre la liste, jamais les compteurs.
 */
export async function listLots(
  scope: LotScope,
  options: { level?: ExpiryLevel | null; query?: string | null; productId?: string | null; presentationId?: string | null; today?: Date } = {},
): Promise<{ lots: LotView[]; counts: LotCounts; thresholds: ShortDateThresholds; today: string; truncated: boolean }> {
  const settings = await loadSettings(scope.pharmacyId);
  const today = officeDay(options.today, settings.timeZone);
  const query = options.query?.trim().slice(0, 80) ?? "";

  const rows = await prisma.stockLot.findMany({
    where: {
      pharmacyId: scope.pharmacyId,
      resolvedAt: null,
      ...(options.productId ? { productId: options.productId } : {}),
      ...(options.presentationId ? { presentationId: options.presentationId } : {}),
      ...(query
        ? {
            OR: [
              { label: { contains: query, mode: "insensitive" as const } },
              { lotNumber: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ expiresOn: "asc" }, { label: "asc" }],
    take: LIST_LIMIT + 1,
    select: {
      id: true,
      productId: true,
      presentationId: true,
      label: true,
      lotNumber: true,
      quantity: true,
      expiresOn: true,
      expiryPrecision: true,
      source: true,
      note: true,
      product: { select: { brand: true, deletedAt: true } },
    },
  });
  const truncated = rows.length > LIST_LIMIT;
  const kept = rows.slice(0, LIST_LIMIT);

  // Le catalogue national est partagé : seul le libellé de la boîte y est lu.
  const presentationIds = [...new Set(kept.map((row) => row.presentationId).filter((id): id is string => Boolean(id)))];
  const presentations = presentationIds.length
    ? await prisma.drugPresentation.findMany({ where: { id: { in: presentationIds } }, select: { id: true, cip13: true, label: true } })
    : [];
  const presentationById = new Map(presentations.map((presentation) => [presentation.id, presentation]));

  const counts: LotCounts = { ALL: 0, EXPIRED: 0, URGENT: 0, SOON: 0, OK: 0 };
  const lots: LotView[] = [];
  for (const row of kept) {
    const daysLeft = daysUntil(row.expiresOn, today);
    const level = expiryLevel(daysLeft, settings.thresholds);
    counts.ALL += 1;
    counts[level] += 1;
    if (options.level && level !== options.level) continue;

    const presentation = row.presentationId ? presentationById.get(row.presentationId) : undefined;
    const kind: LotKind = row.productId ? "PRODUCT" : "DRUG";
    lots.push({
      id: row.id,
      kind,
      productId: row.productId,
      presentationId: row.presentationId,
      label: row.label,
      detail: kind === "PRODUCT" ? (row.product?.brand ?? null) : presentation ? `CIP ${presentation.cip13} · ${presentation.label.replace(/\s+/g, " ")}` : null,
      lotNumber: row.lotNumber,
      quantity: row.quantity,
      expiresOn: toIsoDay(row.expiresOn),
      precision: asPrecision(row.expiryPrecision),
      daysLeft,
      level,
      source: row.source,
      note: row.note,
      href:
        kind === "PRODUCT"
          ? row.product && !row.product.deletedAt
            ? `/stock/${row.productId}`
            : null
          : presentation
            ? `/stock/medicaments?q=${presentation.cip13}`
            : null,
    });
  }

  return { lots, counts, thresholds: settings.thresholds, today: toIsoDay(today), truncated };
}

/** Ce qui demande un geste : lots urgents et lots expirés encore en rayon. */
export async function countLotsNeedingAction(scope: LotScope): Promise<{ urgent: number; expired: number }> {
  const settings = await loadSettings(scope.pharmacyId);
  const today = calendarDate(new Date(), settings.timeZone);
  const [expired, urgent] = await Promise.all([
    prisma.stockLot.count({ where: { pharmacyId: scope.pharmacyId, resolvedAt: null, expiresOn: { lt: today } } }),
    prisma.stockLot.count({
      where: { pharmacyId: scope.pharmacyId, resolvedAt: null, expiresOn: { gte: today, lte: addDays(today, settings.thresholds.urgentDays) } },
    }),
  ]);
  return { urgent, expired };
}

export type SaveLotInput = {
  /** Présent : modification d'un lot existant (sa référence ne change pas). */
  id?: string | null;
  productId?: string | null;
  presentationId?: string | null;
  lotNumber?: string | null;
  expiresOn: Date;
  precision: ExpiryPrecision;
  quantity?: number | null;
  note?: string | null;
};

export type LotResult<T> = { ok: true; data: T } | { ok: false; error: string };

type SavedLot = { id: string; created: boolean; label: string; productId: string | null; presentationId: string | null; expiresOn: Date; precision: ExpiryPrecision };

function cleanQuantity(quantity: number | null | undefined): number | null {
  if (quantity === null || quantity === undefined || !Number.isFinite(quantity)) return null;
  const rounded = Math.round(quantity);
  return rounded > 0 ? Math.min(rounded, 99_999) : null;
}

function cleanNote(note: string | null | undefined): string | null {
  const value = (note ?? "").trim().slice(0, 300);
  return value || null;
}

/**
 * Enregistre un lot : un produit du catalogue de l'officine OU un médicament
 * de son stock. Le nom est figé à la saisie. Un lot identique déjà suivi
 * (même référence, même numéro, même date) est mis à jour, pas dupliqué.
 */
export async function saveLot(scope: LotScope, input: SaveLotInput): Promise<LotResult<SavedLot>> {
  const lotNumber = normalizeLotNumber(input.lotNumber);
  const quantity = cleanQuantity(input.quantity);
  const note = cleanNote(input.note);

  if (input.id) {
    const existing = await prisma.stockLot.findFirst({
      where: { id: input.id, pharmacyId: scope.pharmacyId },
      select: { id: true, label: true, productId: true, presentationId: true, resolvedAt: true },
    });
    if (!existing) return { ok: false, error: "Lot introuvable dans cette officine." };
    if (existing.resolvedAt) return { ok: false, error: "Ce lot est déjà sorti du suivi." };
    // Une correction ne doit pas créer un doublon d'un lot déjà suivi.
    const twin = await prisma.stockLot.findFirst({
      where: {
        pharmacyId: scope.pharmacyId,
        id: { not: existing.id },
        resolvedAt: null,
        productId: existing.productId,
        presentationId: existing.presentationId,
        lotNumber,
        expiresOn: input.expiresOn,
      },
      select: { id: true },
    });
    if (twin) return { ok: false, error: "Ce lot (même numéro, même date) est déjà suivi : supprimez plutôt cette saisie." };
    await prisma.stockLot.update({
      where: { id: existing.id },
      data: { lotNumber, expiresOn: input.expiresOn, expiryPrecision: input.precision, quantity, note },
    });
    return {
      ok: true,
      data: { id: existing.id, created: false, label: existing.label, productId: existing.productId, presentationId: existing.presentationId, expiresOn: input.expiresOn, precision: input.precision },
    };
  }

  if (Boolean(input.productId) === Boolean(input.presentationId)) {
    return { ok: false, error: "Choisissez un produit ou un médicament de votre stock." };
  }

  let label: string;
  if (input.productId) {
    const product = await prisma.product.findFirst({
      where: { id: input.productId, pharmacyId: scope.pharmacyId, deletedAt: null },
      select: { name: true },
    });
    if (!product) return { ok: false, error: "Produit introuvable dans cette officine." };
    label = product.name;
  } else {
    const line = await prisma.pharmacyDrugStock.findFirst({
      where: { pharmacyId: scope.pharmacyId, presentationId: input.presentationId as string },
      select: { presentation: { select: { specialty: { select: { name: true } } } } },
    });
    if (!line) return { ok: false, error: "Ce médicament n'est pas dans le stock de l'officine." };
    label = line.presentation.specialty.name;
  }

  const target = input.productId ? { productId: input.productId } : { presentationId: input.presentationId as string };
  const duplicate = await prisma.stockLot.findFirst({
    where: { pharmacyId: scope.pharmacyId, ...target, lotNumber, expiresOn: input.expiresOn, resolvedAt: null },
    select: { id: true },
  });
  if (duplicate) {
    await prisma.stockLot.update({
      where: { id: duplicate.id },
      data: { expiryPrecision: input.precision, ...(quantity !== null ? { quantity } : {}), ...(note ? { note } : {}) },
    });
    return {
      ok: true,
      data: { id: duplicate.id, created: false, label, productId: input.productId ?? null, presentationId: input.presentationId ?? null, expiresOn: input.expiresOn, precision: input.precision },
    };
  }

  const created = await prisma.stockLot.create({
    data: {
      pharmacyId: scope.pharmacyId,
      ...target,
      label,
      lotNumber,
      expiresOn: input.expiresOn,
      expiryPrecision: input.precision,
      quantity,
      note,
      source: "MANUAL",
      createdByUserId: scope.userId,
    },
    select: { id: true },
  });
  return {
    ok: true,
    data: { id: created.id, created: true, label, productId: input.productId ?? null, presentationId: input.presentationId ?? null, expiresOn: input.expiresOn, precision: input.precision },
  };
}

type LotRef = { id: string; label: string; productId: string | null; presentationId: string | null };

/** Sort un lot du suivi : vendu, retourné ou détruit. La quantité du stock n'est pas touchée. */
export async function resolveLot(scope: LotScope, id: string, resolution: LotResolution): Promise<LotResult<LotRef>> {
  const lot = await prisma.stockLot.findFirst({
    where: { id, pharmacyId: scope.pharmacyId },
    select: { id: true, label: true, productId: true, presentationId: true, resolvedAt: true },
  });
  if (!lot) return { ok: false, error: "Lot introuvable dans cette officine." };
  if (lot.resolvedAt) return { ok: false, error: "Ce lot est déjà sorti du suivi." };
  await prisma.stockLot.update({ where: { id: lot.id }, data: { resolvedAt: new Date(), resolution } });
  return { ok: true, data: { id: lot.id, label: lot.label, productId: lot.productId, presentationId: lot.presentationId } };
}

/** Supprime une saisie erronée. Pour une boîte partie, on la sort du suivi (resolveLot). */
export async function deleteLot(scope: LotScope, id: string): Promise<LotResult<LotRef>> {
  const lot = await prisma.stockLot.findFirst({
    where: { id, pharmacyId: scope.pharmacyId },
    select: { id: true, label: true, productId: true, presentationId: true },
  });
  if (!lot) return { ok: false, error: "Lot introuvable dans cette officine." };
  await prisma.stockLot.delete({ where: { id: lot.id } });
  return { ok: true, data: lot };
}

/**
 * La date courte de chaque référence de l'officine, pour le moteur de conseil
 * et la carte du comptoir. Clés : « p:<productId> » et « d:<presentationId> ».
 *
 * N'y figurent que les références qui ont un lot NON PÉRIMÉ dans le seuil
 * « bientôt » (niveau URGENT ou SOON) : une référence absente n'a pas de date
 * courte connue — ce n'est jamais « 0 jour ». Un lot périmé n'y entre jamais :
 * il sort du conseil, il ne le départage pas. Un lot à quantité nulle non plus.
 *
 * `today` peut être un instant (`new Date()`) : il est ramené au jour de
 * l'officine dans son fuseau. Un lot qui périme aujourd'hui reste donc une
 * date courte (« 0 j ») jusqu'à minuit, heure de l'officine.
 *
 * `pharmacyId` vient TOUJOURS de la session de l'appelant (`session.scope`).
 */
export async function nearestShortDatesFor(pharmacyId: string, todayOrNow: Date): Promise<Map<string, ShortDate>> {
  const settings = await loadSettings(pharmacyId);
  const today = officeDay(todayOrNow, settings.timeZone);
  const lots = await prisma.stockLot.findMany({
    where: {
      pharmacyId,
      resolvedAt: null,
      expiresOn: { gte: today, lte: addDays(today, settings.thresholds.soonDays) },
      OR: [{ quantity: null }, { quantity: { gt: 0 } }],
    },
    select: { productId: true, presentationId: true, expiresOn: true },
  });

  const byReference = new Map<string, { expiresOn: Date }[]>();
  for (const lot of lots) {
    const key = lot.productId ? `p:${lot.productId}` : lot.presentationId ? `d:${lot.presentationId}` : null;
    if (!key) continue;
    const group = byReference.get(key) ?? [];
    group.push({ expiresOn: lot.expiresOn });
    byReference.set(key, group);
  }

  const result = new Map<string, ShortDate>();
  for (const [key, group] of byReference) {
    const shortDate = nearestShortDate(group, today, settings.thresholds);
    if (shortDate) result.set(key, shortDate);
  }
  return result;
}

export type ImportedLotInput = {
  productId?: string | null;
  presentationId?: string | null;
  label: string;
  lotNumber?: string | null;
  expiresOn: Date;
  precision?: ExpiryPrecision;
  quantity?: number | null;
};

/**
 * PRÉPARÉ, NON BRANCHÉ : pour un futur import de péremptions (fichier CSV, ou
 * une édition LGPI qui porterait les dates — l'édition d'inventaire actuelle
 * n'en contient pas). Rien ne l'appelle aujourd'hui.
 *
 * Un lot déjà suivi (même référence, même numéro, même date) voit sa quantité
 * mise à jour ; sinon il est créé avec la source IMPORT. Une ligne dont la
 * référence n'appartient pas à l'officine, ou à quantité nulle, est ignorée.
 * Aucune quantité de stock n'est modifiée.
 */
export async function upsertImportedLots(
  pharmacyId: string,
  lots: ImportedLotInput[],
  importJobId: string,
): Promise<{ created: number; updated: number; skipped: number }> {
  const job = await prisma.importJob.findFirst({ where: { id: importJobId, pharmacyId }, select: { id: true } });
  if (!job) throw new Error("Import introuvable dans cette officine.");

  const productIds = [...new Set(lots.map((lot) => lot.productId).filter((id): id is string => Boolean(id)))];
  const presentationIds = [...new Set(lots.map((lot) => lot.presentationId).filter((id): id is string => Boolean(id)))];
  const [products, drugLines] = await Promise.all([
    productIds.length ? prisma.product.findMany({ where: { pharmacyId, id: { in: productIds }, deletedAt: null }, select: { id: true } }) : [],
    presentationIds.length ? prisma.pharmacyDrugStock.findMany({ where: { pharmacyId, presentationId: { in: presentationIds } }, select: { presentationId: true } }) : [],
  ]);
  const ownedProducts = new Set(products.map((product) => product.id));
  const ownedPresentations = new Set(drugLines.map((line) => line.presentationId));

  return prisma.$transaction(async (tx) => {
    const existing = await tx.stockLot.findMany({
      where: {
        pharmacyId,
        resolvedAt: null,
        OR: [{ productId: { in: [...ownedProducts] } }, { presentationId: { in: [...ownedPresentations] } }],
      },
      select: { id: true, productId: true, presentationId: true, lotNumber: true, expiresOn: true },
    });
    const existingByKey = new Map(existing.map((lot) => [lotIdentityKey(lot), lot.id]));

    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const lot of lots) {
      const owned = lot.productId ? ownedProducts.has(lot.productId) && !lot.presentationId : lot.presentationId ? ownedPresentations.has(lot.presentationId) : false;
      const quantity = lot.quantity === null || lot.quantity === undefined ? null : Math.round(lot.quantity);
      if (!owned || Number.isNaN(lot.expiresOn.getTime()) || (quantity !== null && quantity <= 0)) {
        skipped += 1;
        continue;
      }
      const lotNumber = normalizeLotNumber(lot.lotNumber);
      const key = lotIdentityKey({ ...lot, lotNumber });
      const existingId = existingByKey.get(key);
      if (existingId) {
        await tx.stockLot.update({ where: { id: existingId }, data: { ...(quantity !== null ? { quantity } : {}), importJobId } });
        updated += 1;
        continue;
      }
      const createdLot = await tx.stockLot.create({
        data: {
          pharmacyId,
          ...(lot.productId ? { productId: lot.productId } : { presentationId: lot.presentationId as string }),
          label: lot.label.trim().slice(0, 200) || "Sans nom",
          lotNumber,
          expiresOn: lot.expiresOn,
          expiryPrecision: lot.precision ?? "DAY",
          quantity,
          source: "IMPORT",
          importJobId,
        },
        select: { id: true },
      });
      existingByKey.set(key, createdLot.id);
      created += 1;
    }
    return { created, updated, skipped };
  });
}

export type StockItemChoice = {
  kind: LotKind;
  /** productId pour un produit, presentationId pour un médicament. */
  id: string;
  label: string;
  detail: string | null;
  quantity: number;
};

/** Pour la saisie d'un lot : retrouver un produit ou un médicament DU STOCK de l'officine. */
export async function searchStockItems(scope: LotScope, rawQuery: string): Promise<StockItemChoice[]> {
  const query = rawQuery.trim().slice(0, 80);
  if (query.length < 2) return [];
  const digits = query.replace(/\D/g, "");
  const numeric = digits.length >= 4 && digits.length === query.replace(/\s/g, "").length;

  const [products, drugLines] = await Promise.all([
    prisma.product.findMany({
      where: {
        pharmacyId: scope.pharmacyId,
        deletedAt: null,
        OR: numeric
          ? [{ ean: { contains: digits } }, { reference: { contains: digits } }]
          : [
              { name: { contains: query, mode: "insensitive" as const } },
              { brand: { contains: query, mode: "insensitive" as const } },
              { reference: { contains: query, mode: "insensitive" as const } },
            ],
      },
      orderBy: { name: "asc" },
      take: 8,
      select: { id: true, name: true, brand: true, ean: true, stockItem: { select: { quantity: true } } },
    }),
    prisma.pharmacyDrugStock.findMany({
      where: {
        pharmacyId: scope.pharmacyId,
        presentation: numeric
          ? { cip13: { contains: digits } }
          : {
              OR: [
                { specialty: { searchName: { contains: normalizeSearchText(query) } } },
                { specialty: { name: { contains: query, mode: "insensitive" as const } } },
              ],
            },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { quantity: true, presentation: { select: { id: true, cip13: true, label: true, specialty: { select: { name: true } } } } },
    }),
  ]);

  return [
    ...products.map((product) => ({
      kind: "PRODUCT" as const,
      id: product.id,
      label: product.name,
      detail: [product.brand, product.ean ? `EAN ${product.ean}` : null].filter(Boolean).join(" · ") || null,
      quantity: product.stockItem?.quantity ?? 0,
    })),
    ...drugLines.map((line) => ({
      kind: "DRUG" as const,
      id: line.presentation.id,
      label: line.presentation.specialty.name,
      detail: `CIP ${line.presentation.cip13} · ${line.presentation.label.replace(/\s+/g, " ")}`,
      quantity: line.quantity,
    })),
  ];
}
