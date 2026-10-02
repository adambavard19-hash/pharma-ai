import "server-only";
import { Prisma } from "@/generated/prisma";
import type { LabChallengeCountMode, LabChallengeStatus } from "@/generated/prisma";
import { prisma } from "@/server/db/client";
import { activityScope } from "@/server/db/demo-scope";
import { brandKey as toBrandKey, brandLabelOf, productMatchesBrand } from "@/core/catalog/brand";
import { calendarDay, challengeWindow, dayKeyToDate, safeTimeZone, toDayKey, type DayKey } from "@/core/challenges/dates";
import { computeChallengeProgress, type ChallengeProgress, type ChallengeSaleLine } from "@/core/challenges/progress";
import { parseTiers, rewardModeOf, validateManualEntry, type ChallengeTier, type RewardMode } from "@/core/challenges/terms";

/**
 * Les challenges laboratoires d'une officine.
 *
 * Un challenge est un accord COMMERCIAL avec un laboratoire (« 100 unités de la
 * gamme X d'ici fin décembre, 1,50 € par unité »). Ce service le range, et
 * mesure sa progression à partir de faits : les ventes enregistrées dans
 * PharmaBoost pour les produits concernés, sur la période, et les unités que
 * le titulaire saisit lui-même. Il ne lit ni n'écrit rien du moteur de
 * conseil, et rien de ce qu'il calcule n'est envoyé au comptoir.
 *
 * Cloisonnement : chaque fonction reçoit le `scope` de la session en premier
 * paramètre et filtre TOUTES ses requêtes par `scope.pharmacyId`. Un
 * identifiant venu du client n'est utilisé qu'après avoir été retrouvé dans
 * cette officine. Seule `listChallengesForPlatform` lit toutes les officines :
 * elle n'est appelée que derrière `requirePlatformSession` et ne renvoie que
 * des agrégats.
 */

export type ChallengeScope = { readonly pharmacyId: string; readonly userId: string };

export type ChallengeRow = {
  id: string;
  title: string;
  laboratory: string;
  /** Clé de marque normalisée, et son libellé tel qu'il figure au stock. */
  brandKey: string | null;
  brandLabel: string | null;
  universe: string | null;
  /** Produits choisis un par un. Vide : toute la marque. */
  productIds: string[];
  /** Ces produits, nommés (ceux retirés du catalogue de l'officine n'y figurent plus). */
  selectedProducts: { id: string; name: string; brand: string | null; isActive: boolean }[];
  /** Références actives de l'officine couvertes par le challenge. */
  coveredProducts: number;
  startsOn: DayKey;
  endsOn: DayKey;
  status: LabChallengeStatus;
  countMode: LabChallengeCountMode;
  targetUnits: number | null;
  bonusPerUnitCents: number | null;
  tiers: ChallengeTier[];
  rewardMode: RewardMode;
  notes: string | null;
  dataSource: string;
  progress: ChallengeProgress;
};

export type ChallengeProductOption = {
  id: string;
  name: string;
  brand: string | null;
  inStock: number | null;
  isActive: boolean;
};

export type ChallengeEntryRow = {
  id: string;
  units: number;
  occurredOn: DayKey;
  note: string | null;
  source: string;
  createdAt: string;
  author: string | null;
};

export type ChallengeProductSales = {
  key: string;
  name: string;
  brand: string | null;
  units: number;
  attributedUnits: number;
  counted: number;
};

export type ChallengeDetail = {
  challenge: ChallengeRow;
  entries: ChallengeEntryRow[];
  salesByProduct: ChallengeProductSales[];
  today: DayKey;
};

export type BrandSuggestion = { label: string; references: number };

export type ChallengeInput = {
  title: string;
  laboratory: string;
  /** Marque telle qu'au stock ; vide : celle du laboratoire. */
  brand: string | null;
  universe: string | null;
  productIds: string[];
  startsOn: DayKey;
  endsOn: DayKey;
  targetUnits: number | null;
  rewardMode: RewardMode;
  bonusPerUnitCents: number | null;
  tiers: ChallengeTier[];
  countMode: LabChallengeCountMode;
  notes: string | null;
};

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const CHALLENGE_SELECT = {
  id: true,
  title: true,
  laboratory: true,
  brandKey: true,
  universe: true,
  productIds: true,
  startsAt: true,
  endsAt: true,
  targetUnits: true,
  bonusPerUnitCents: true,
  tiers: true,
  status: true,
  countMode: true,
  dataSource: true,
  notes: true,
  entries: { select: { units: true, occurredOn: true, pharmacyId: true } },
} satisfies Prisma.LabChallengeSelect;

type ChallengeRecord = Prisma.LabChallengeGetPayload<{ select: typeof CHALLENGE_SELECT }>;

type CatalogProduct = { id: string; name: string; brand: string | null; deletedAt: Date | null; isActive: boolean };

type Clock = { timeZone: string; today: DayKey };

async function pharmacyClock(pharmacyId: string, now: Date): Promise<Clock> {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { timezone: true } });
  const timeZone = safeTimeZone(pharmacy?.timezone);
  return { timeZone, today: calendarDay(now, timeZone) };
}

/** Tout le catalogue de l'officine, supprimés compris : une vente passée d'un produit retiré compte encore. */
async function loadCatalog(pharmacyId: string): Promise<CatalogProduct[]> {
  return prisma.product.findMany({
    where: { pharmacyId },
    select: { id: true, name: true, brand: true, deletedAt: true, isActive: true },
  });
}

/** Les produits couverts : la liste choisie (restreinte à l'officine), sinon toute la marque. */
function coverage(record: Pick<ChallengeRecord, "productIds" | "brandKey">, catalog: CatalogProduct[]): CatalogProduct[] {
  if (record.productIds.length > 0) {
    const wanted = new Set(record.productIds);
    return catalog.filter((product) => wanted.has(product.id));
  }
  if (!record.brandKey) return [];
  const key = record.brandKey;
  return catalog.filter((product) => productMatchesBrand(product, key));
}

function brandLabelFor(key: string | null, catalog: CatalogProduct[]): string | null {
  if (!key) return null;
  for (const product of catalog) {
    const label = brandLabelOf(product.name, product.brand);
    if (label && toBrandKey(label) === key) return label;
  }
  return key.toUpperCase();
}

async function loadSaleLines(pharmacyId: string, productIds: string[], window: { from: Date; until: Date }): Promise<ChallengeSaleLine[]> {
  if (productIds.length === 0) return [];
  const rows = await prisma.saleLine.findMany({
    where: {
      productId: { in: productIds },
      sale: { pharmacyId, ...activityScope(), createdAt: { gte: window.from, lt: window.until } },
    },
    select: {
      productId: true,
      presentationId: true,
      quantity: true,
      recommendationId: true,
      sale: { select: { userId: true, createdAt: true } },
    },
  });
  return rows.map((row) => ({
    productId: row.productId,
    presentationId: row.presentationId,
    quantity: row.quantity,
    userId: row.sale.userId,
    createdAt: row.sale.createdAt,
    attributed: row.recommendationId !== null,
  }));
}

async function buildRow(pharmacyId: string, record: ChallengeRecord, catalog: CatalogProduct[], clock: Clock): Promise<{ row: ChallengeRow; covered: CatalogProduct[] }> {
  const covered = coverage(record, catalog);
  const byId = new Map(catalog.map((product) => [product.id, product]));
  const window = challengeWindow(record.startsAt, record.endsAt, clock.timeZone);
  const lines = await loadSaleLines(pharmacyId, covered.map((product) => product.id), window);
  const tiers = parseTiers(record.tiers);
  const progress = computeChallengeProgress({
    terms: {
      startsOn: record.startsAt,
      endsOn: record.endsAt,
      status: record.status,
      countMode: record.countMode,
      targetUnits: record.targetUnits,
      bonusPerUnitCents: record.bonusPerUnitCents,
      tiers,
      timeZone: clock.timeZone,
    },
    lines,
    // Une saisie appartient à l'officine du challenge ; on ne compte jamais
    // celle d'une autre, même rattachée par erreur.
    entries: record.entries.filter((entry) => entry.pharmacyId === pharmacyId),
    today: clock.today,
  });
  return {
    covered,
    row: {
      id: record.id,
      title: record.title,
      laboratory: record.laboratory,
      brandKey: record.brandKey,
      brandLabel: brandLabelFor(record.brandKey, catalog),
      universe: record.universe,
      productIds: record.productIds,
      selectedProducts: record.productIds
        .map((productId) => byId.get(productId))
        .filter((product): product is CatalogProduct => !!product)
        .map((product) => ({ id: product.id, name: product.name, brand: product.brand, isActive: product.isActive && !product.deletedAt })),
      coveredProducts: covered.filter((product) => !product.deletedAt).length,
      startsOn: toDayKey(record.startsAt),
      endsOn: toDayKey(record.endsAt),
      status: record.status,
      countMode: record.countMode,
      targetUnits: record.targetUnits,
      bonusPerUnitCents: record.bonusPerUnitCents,
      tiers,
      rewardMode: rewardModeOf({ bonusPerUnitCents: record.bonusPerUnitCents, tiers }),
      notes: record.notes,
      dataSource: record.dataSource,
      progress,
    },
  };
}

async function buildRows(pharmacyId: string, records: ChallengeRecord[], clock: Clock): Promise<ChallengeRow[]> {
  if (records.length === 0) return [];
  const catalog = await loadCatalog(pharmacyId);
  const built = await Promise.all(records.map((record) => buildRow(pharmacyId, record, catalog, clock)));
  return built.map((item) => item.row);
}

/** Tous les challenges de l'officine, avec leur progression. */
export async function listChallenges(scope: ChallengeScope, now: Date = new Date()): Promise<{ rows: ChallengeRow[]; today: DayKey }> {
  const [clock, records] = await Promise.all([
    pharmacyClock(scope.pharmacyId, now),
    prisma.labChallenge.findMany({
      where: { pharmacyId: scope.pharmacyId },
      orderBy: [{ endsAt: "asc" }, { createdAt: "asc" }],
      select: CHALLENGE_SELECT,
    }),
  ]);
  return { rows: await buildRows(scope.pharmacyId, records, clock), today: clock.today };
}

/** Un challenge, sa progression, ses ventes par produit et ses saisies. Null s'il n'est pas à cette officine. */
export async function getChallengeDetail(scope: ChallengeScope, id: string, now: Date = new Date()): Promise<ChallengeDetail | null> {
  const record = await prisma.labChallenge.findFirst({ where: { id, pharmacyId: scope.pharmacyId }, select: CHALLENGE_SELECT });
  if (!record) return null;

  const [clock, catalog, entries, members] = await Promise.all([
    pharmacyClock(scope.pharmacyId, now),
    loadCatalog(scope.pharmacyId),
    prisma.labChallengeEntry.findMany({
      where: { challengeId: record.id, pharmacyId: scope.pharmacyId },
      orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
      select: { id: true, units: true, occurredOn: true, note: true, source: true, createdAt: true, createdByUserId: true },
    }),
    prisma.membership.findMany({
      where: { pharmacyId: scope.pharmacyId },
      select: { user: { select: { id: true, firstName: true, lastName: true } } },
    }),
  ]);

  const { row } = await buildRow(scope.pharmacyId, record, catalog, clock);
  const byId = new Map(catalog.map((product) => [product.id, product]));
  const names = new Map(members.map((member) => [member.user.id, `${member.user.firstName} ${member.user.lastName.toUpperCase()}`.trim()]));

  return {
    challenge: row,
    today: clock.today,
    entries: entries.map((entry) => ({
      id: entry.id,
      units: entry.units,
      occurredOn: toDayKey(entry.occurredOn),
      note: entry.note,
      source: entry.source,
      createdAt: entry.createdAt.toISOString(),
      author: entry.createdByUserId ? (names.get(entry.createdByUserId) ?? null) : null,
    })),
    salesByProduct: row.progress.byProduct.map((item) => {
      const product = byId.get(item.key);
      return {
        key: item.key,
        name: product?.name ?? "Produit retiré du catalogue",
        brand: product?.brand ?? null,
        units: item.units,
        attributedUnits: item.attributedUnits,
        counted: item.counted,
      };
    }),
  };
}

/** Les marques du stock, pour proposer la saisie du laboratoire sans la taper de mémoire. */
export async function listStockBrands(scope: ChallengeScope): Promise<BrandSuggestion[]> {
  const products = await prisma.product.findMany({
    where: { pharmacyId: scope.pharmacyId, deletedAt: null, isActive: true },
    select: { name: true, brand: true },
  });
  const counts = new Map<string, number>();
  for (const product of products) {
    const label = brandLabelOf(product.name, product.brand);
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, references]) => ({ label, references }))
    .sort((a, b) => b.references - a.references || a.label.localeCompare(b.label, "fr"))
    .slice(0, 400);
}

/**
 * Les produits de l'officine qu'on peut rattacher à un challenge : ceux de la
 * marque, filtrés par un mot du libellé. Sans marque ni recherche, rien : on
 * ne déverse pas tout le catalogue.
 */
export async function searchChallengeProducts(
  scope: ChallengeScope,
  params: { brand?: string | null; query?: string | null; limit?: number },
): Promise<{ total: number; items: ChallengeProductOption[] }> {
  const key = params.brand?.trim() ? toBrandKey(params.brand) : "";
  const needle = params.query?.trim() ? toBrandKey(params.query) : "";
  if (!key && !needle) return { total: 0, items: [] };

  const products = await prisma.product.findMany({
    where: { pharmacyId: scope.pharmacyId, deletedAt: null },
    select: { id: true, name: true, brand: true, isActive: true, stockItem: { select: { quantity: true } } },
  });
  const matching = products
    .filter((product) => (!key || productMatchesBrand(product, key)) && (!needle || toBrandKey(product.name).includes(needle)))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name, "fr"));
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 500);
  return {
    total: matching.length,
    items: matching.slice(0, limit).map((product) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      inStock: product.stockItem?.quantity ?? null,
      isActive: product.isActive,
    })),
  };
}

/** Crée (sans `id`) ou met à jour un challenge de l'officine. Le statut n'est pas touché par une modification. */
export async function saveChallenge(scope: ChallengeScope, input: ChallengeInput, id?: string | null): Promise<ServiceResult<{ id: string; created: boolean }>> {
  if (id) {
    const existing = await prisma.labChallenge.findFirst({ where: { id, pharmacyId: scope.pharmacyId }, select: { id: true } });
    if (!existing) return { ok: false, error: "Challenge introuvable dans cette officine." };
  }

  const productIds = [...new Set(input.productIds)];
  if (productIds.length > 0) {
    const owned = await prisma.product.count({ where: { id: { in: productIds }, pharmacyId: scope.pharmacyId } });
    if (owned !== productIds.length) {
      return { ok: false, error: "Un produit choisi n'appartient pas à cette officine.", fieldErrors: { productIds: "Produit introuvable dans cette officine." } };
    }
  }

  const key = toBrandKey(input.brand?.trim() || input.laboratory);
  if (productIds.length === 0 && !key) {
    return { ok: false, error: "Indiquez la marque ou choisissez des produits.", fieldErrors: { brand: "Indiquez la marque concernée." } };
  }

  const tiers = [...input.tiers].sort((a, b) => a.units - b.units);
  const data = {
    title: input.title,
    laboratory: input.laboratory,
    brandKey: key || null,
    universe: input.universe,
    productIds,
    startsAt: dayKeyToDate(input.startsOn),
    endsAt: dayKeyToDate(input.endsOn),
    targetUnits: input.targetUnits,
    bonusPerUnitCents: input.rewardMode === "PER_UNIT" ? input.bonusPerUnitCents : null,
    tiers: input.rewardMode === "TIERS" ? (tiers as Prisma.InputJsonValue) : Prisma.DbNull,
    countMode: input.countMode,
    notes: input.notes,
  };

  if (id) {
    await prisma.labChallenge.updateMany({ where: { id, pharmacyId: scope.pharmacyId }, data });
    return { ok: true, data: { id, created: false } };
  }
  const created = await prisma.labChallenge.create({
    data: { ...data, pharmacyId: scope.pharmacyId, status: "ACTIVE", dataSource: "PHARMABOOST", createdByUserId: scope.userId },
    select: { id: true },
  });
  return { ok: true, data: { id: created.id, created: true } };
}

/** Passe un challenge en cours, terminé ou archivé. Faux s'il n'est pas à cette officine. */
export async function setChallengeStatus(scope: ChallengeScope, id: string, status: LabChallengeStatus): Promise<{ title: string; laboratory: string } | null> {
  const challenge = await prisma.labChallenge.findFirst({ where: { id, pharmacyId: scope.pharmacyId }, select: { title: true, laboratory: true } });
  if (!challenge) return null;
  await prisma.labChallenge.updateMany({ where: { id, pharmacyId: scope.pharmacyId }, data: { status } });
  return challenge;
}

/** Supprime un challenge et ses saisies. Null s'il n'est pas à cette officine. */
export async function deleteChallenge(scope: ChallengeScope, id: string): Promise<{ title: string; laboratory: string } | null> {
  const challenge = await prisma.labChallenge.findFirst({ where: { id, pharmacyId: scope.pharmacyId }, select: { title: true, laboratory: true } });
  if (!challenge) return null;
  await prisma.labChallenge.deleteMany({ where: { id, pharmacyId: scope.pharmacyId } });
  return challenge;
}

/** Ajoute des unités saisies à la main (ventes hors PharmaBoost, relevé du laboratoire). */
export async function addChallengeEntry(
  scope: ChallengeScope,
  challengeId: string,
  entry: { units: number; occurredOn: string; note: string | null },
  now: Date = new Date(),
): Promise<ServiceResult<{ id: string }>> {
  const challenge = await prisma.labChallenge.findFirst({
    where: { id: challengeId, pharmacyId: scope.pharmacyId },
    select: { id: true, startsAt: true, endsAt: true, status: true },
  });
  if (!challenge) return { ok: false, error: "Challenge introuvable dans cette officine." };
  if (challenge.status === "ARCHIVED") return { ok: false, error: "Ce challenge est archivé : réactivez-le pour y ajouter des unités." };

  const clock = await pharmacyClock(scope.pharmacyId, now);
  const errors = validateManualEntry(entry, { startsOn: challenge.startsAt, endsOn: challenge.endsAt }, clock.today);
  if (Object.keys(errors).length > 0) return { ok: false, error: "Vérifiez la saisie.", fieldErrors: errors };

  const created = await prisma.labChallengeEntry.create({
    data: {
      challengeId: challenge.id,
      pharmacyId: scope.pharmacyId,
      units: entry.units,
      occurredOn: dayKeyToDate(entry.occurredOn),
      note: entry.note,
      source: "MANUAL",
      createdByUserId: scope.userId,
    },
    select: { id: true },
  });
  return { ok: true, data: { id: created.id } };
}

/**
 * Retire une saisie manuelle. Refusé si elle n'est pas à cette officine, ou si
 * son challenge est archivé (on consulte un archivé, on ne le retouche pas).
 */
export async function deleteChallengeEntry(scope: ChallengeScope, entryId: string): Promise<ServiceResult<{ challengeId: string; units: number }>> {
  const entry = await prisma.labChallengeEntry.findFirst({
    where: { id: entryId, pharmacyId: scope.pharmacyId, challenge: { pharmacyId: scope.pharmacyId } },
    select: { challengeId: true, units: true, challenge: { select: { status: true } } },
  });
  if (!entry) return { ok: false, error: "Saisie introuvable dans cette officine." };
  if (entry.challenge.status === "ARCHIVED") return { ok: false, error: "Ce challenge est archivé : réactivez-le pour retirer une saisie." };
  await prisma.labChallengeEntry.deleteMany({ where: { id: entryId, pharmacyId: scope.pharmacyId } });
  return { ok: true, data: { challengeId: entry.challengeId, units: entry.units } };
}

export type PilotageChallenge = {
  id: string;
  title: string;
  laboratory: string;
  endsOn: DayKey;
  progress: Pick<ChallengeProgress, "units" | "target" | "targetIsImplicit" | "ratio" | "rewardMode" | "potentialCents" | "earnedCents" | "daysRemaining" | "manualUnits" | "salesUnits">;
  /** Ventes comptées par collaborateur (qui a enregistré la vente). Les saisies manuelles n'ont pas d'auteur de vente. */
  byCollaborator: { key: string; label: string; initials: string; units: number }[];
};

/**
 * Les challenges en cours, pour le Pilotage du titulaire (déjà réservé à
 * ANALYTICS_VIEW_TEAM_PERFORMANCE). La vente est attribuée à qui l'a
 * enregistrée (`Sale.userId`), comme pour le chiffre d'affaires du pilotage :
 * rien n'est reconstitué après coup.
 */
export async function listRunningChallengesForPilotage(scope: ChallengeScope, now: Date = new Date()): Promise<PilotageChallenge[]> {
  const clock = await pharmacyClock(scope.pharmacyId, now);
  const today = dayKeyToDate(clock.today);
  const [records, members] = await Promise.all([
    prisma.labChallenge.findMany({
      where: { pharmacyId: scope.pharmacyId, status: "ACTIVE", startsAt: { lte: today }, endsAt: { gte: today } },
      orderBy: [{ endsAt: "asc" }, { createdAt: "asc" }],
      select: CHALLENGE_SELECT,
    }),
    prisma.membership.findMany({
      where: { pharmacyId: scope.pharmacyId, isActive: true },
      select: { user: { select: { id: true, firstName: true, lastName: true } } },
    }),
  ]);
  const rows = await buildRows(scope.pharmacyId, records, clock);
  const people = new Map(
    members.map((member) => [
      member.user.id,
      {
        label: `${member.user.firstName} ${member.user.lastName}`.trim(),
        initials: `${member.user.firstName.at(0) ?? ""}${member.user.lastName.at(0) ?? ""}`.toUpperCase(),
      },
    ]),
  );

  return rows
    .filter((row) => row.progress.effectiveStatus === "RUNNING")
    .map((row) => ({
      id: row.id,
      title: row.title,
      laboratory: row.laboratory,
      endsOn: row.endsOn,
      progress: {
        units: row.progress.units,
        target: row.progress.target,
        targetIsImplicit: row.progress.targetIsImplicit,
        ratio: row.progress.ratio,
        rewardMode: row.progress.rewardMode,
        potentialCents: row.progress.potentialCents,
        earnedCents: row.progress.earnedCents,
        daysRemaining: row.progress.daysRemaining,
        manualUnits: row.progress.manualUnits,
        salesUnits: row.progress.salesUnits,
      },
      byCollaborator: row.progress.byUser
        .filter((item) => item.counted !== 0)
        .map((item) => {
          const person = item.key ? people.get(item.key) : undefined;
          return {
            key: item.key || "none",
            label: person?.label ?? (item.key ? "Ancien collaborateur" : "Sans auteur enregistré"),
            initials: person?.initials ?? "—",
            units: item.counted,
          };
        }),
    }));
}

export type PlatformChallengeRow = {
  id: string;
  pharmacyId: string;
  pharmacyName: string;
  pharmacyCity: string | null;
  pharmacyIsDemo: boolean;
  title: string;
  laboratory: string;
  universe: string | null;
  startsOn: DayKey;
  endsOn: DayKey;
  effectiveStatus: ChallengeProgress["effectiveStatus"];
  countMode: LabChallengeCountMode;
  rewardMode: RewardMode;
  units: number;
  target: number | null;
  targetIsImplicit: boolean;
  ratio: number | null;
  potentialCents: number | null;
  earnedCents: number | null;
};

/**
 * Console éditeur : les challenges de toutes les officines, en agrégats
 * (unités, objectif, montants). Aucune ligne de vente, aucun collaborateur,
 * aucune donnée patient ne sort d'ici. À n'appeler que derrière
 * `requirePlatformSession`.
 */
export async function listChallengesForPlatform(now: Date = new Date(), limit = 300): Promise<PlatformChallengeRow[]> {
  const records = await prisma.labChallenge.findMany({
    orderBy: [{ endsAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: { ...CHALLENGE_SELECT, pharmacyId: true, pharmacy: { select: { name: true, city: true, isDemo: true, timezone: true } } },
  });

  const byPharmacy = new Map<string, typeof records>();
  for (const record of records) byPharmacy.set(record.pharmacyId, [...(byPharmacy.get(record.pharmacyId) ?? []), record]);

  const result: PlatformChallengeRow[] = [];
  for (const [pharmacyId, group] of byPharmacy) {
    const timeZone = safeTimeZone(group[0].pharmacy.timezone);
    const rows = await buildRows(pharmacyId, group, { timeZone, today: calendarDay(now, timeZone) });
    rows.forEach((row, index) => {
      const pharmacy = group[index].pharmacy;
      result.push({
        id: row.id,
        pharmacyId,
        pharmacyName: pharmacy.name,
        pharmacyCity: pharmacy.city,
        pharmacyIsDemo: pharmacy.isDemo,
        title: row.title,
        laboratory: row.laboratory,
        universe: row.universe,
        startsOn: row.startsOn,
        endsOn: row.endsOn,
        effectiveStatus: row.progress.effectiveStatus,
        countMode: row.countMode,
        rewardMode: row.rewardMode,
        units: row.progress.units,
        target: row.progress.target,
        targetIsImplicit: row.progress.targetIsImplicit,
        ratio: row.progress.ratio,
        potentialCents: row.progress.potentialCents,
        earnedCents: row.progress.earnedCents,
      });
    });
  }
  return result;
}
