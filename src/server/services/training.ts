import "server-only";
import { prisma } from "@/server/db/client";
import type { Prisma, TrainingKind, TrainingStatus } from "@/generated/prisma";
import { PERMISSIONS, resolvePermissions } from "@/server/rbac/permissions";
import { filterCatalog, catalogFacets, type CatalogFilters } from "@/core/training/catalog";
import type { TrainingContentData } from "@/core/training/content";
import { normalizeProductCode, trainingsByProduct, type TrainingProductRef } from "@/core/training/match";
import {
  completionDate,
  nextProgress,
  progressOf,
  summarizeProgress,
  teamProgress as aggregateTeamProgress,
  type ProgressChange,
  type ProgressSummary,
  type TeamProgressRow,
} from "@/core/training/progress";

/**
 * Le centre de formation de l'équipe.
 *
 * Deux portées, à ne jamais confondre :
 *   • les CONTENUS — publiés par PharmaBoost pour toutes les officines
 *     (pharmacyId vide) ou par une officine pour elle seule ;
 *   • la PROGRESSION — propre à une personne DANS une officine.
 *
 * Chaque fonction « officine » reçoit le scope de la session et filtre toutes
 * ses requêtes par scope.pharmacyId : un identifiant venu du client est
 * toujours relu avec ce filtre avant d'être lu ou modifié. Les fonctions de la
 * console (contenus globaux) sont à part, sans scope, et ne touchent jamais un
 * contenu d'officine.
 *
 * La formation n'alimente pas le conseil : rien ici n'est lu par le moteur.
 */

export type TrainingScope = { pharmacyId: string; userId: string };

/** Ce qu'une officine voit : les contenus PharmaBoost actifs et ses propres contenus actifs. */
function visibleWhere(scope: TrainingScope, extra: Prisma.TrainingContentWhereInput = {}): Prisma.TrainingContentWhereInput {
  return { AND: [{ isActive: true, OR: [{ pharmacyId: null }, { pharmacyId: scope.pharmacyId }] }, extra] };
}

const CARD_SELECT = {
  id: true,
  pharmacyId: true,
  title: true,
  summary: true,
  kind: true,
  url: true,
  laboratory: true,
  brandKey: true,
  rangeName: true,
  universe: true,
  durationMinutes: true,
  sourceLabel: true,
  updatedAt: true,
} satisfies Prisma.TrainingContentSelect;

export type TrainingCard = {
  id: string;
  title: string;
  summary: string | null;
  kind: TrainingKind;
  url: string | null;
  laboratory: string | null;
  brandKey: string | null;
  rangeName: string | null;
  universe: string | null;
  durationMinutes: number | null;
  sourceLabel: string | null;
  /** Publié par l'officine elle-même (sinon par PharmaBoost). */
  isOwn: boolean;
  status: TrainingStatus;
  percent: number;
  updatedAt: Date;
};

export type TrainingCatalog = {
  items: TrainingCard[];
  /** Nombre de contenus visibles avant filtres : 0 = rien n'est publié. */
  total: number;
  facets: { laboratories: string[]; universes: string[] };
  summary: ProgressSummary;
};

/** Le catalogue d'une personne, avec sa progression, filtré et ordonné. */
export async function listTrainings(scope: TrainingScope, filters: CatalogFilters = {}): Promise<TrainingCatalog> {
  const [contents, progress] = await Promise.all([
    prisma.trainingContent.findMany({ where: visibleWhere(scope), select: CARD_SELECT }),
    prisma.trainingProgress.findMany({
      where: { pharmacyId: scope.pharmacyId, userId: scope.userId },
      select: { contentId: true, status: true, progressPercent: true },
    }),
  ]);
  const byContent = new Map(progress.map((entry) => [entry.contentId, progressOf(entry)]));
  const cards: TrainingCard[] = contents.map(({ pharmacyId, ...content }) => {
    const state = byContent.get(content.id) ?? progressOf(null);
    return { ...content, isOwn: pharmacyId !== null, status: state.status, percent: state.percent };
  });
  const countable = cards.filter((card) => card.kind !== "QUIZ").map((card) => card.id);
  return {
    items: filterCatalog(cards, filters),
    total: cards.length,
    facets: catalogFacets(cards),
    summary: summarizeProgress(countable, progress),
  };
}

export type TrainingDetail = TrainingCard & {
  body: string | null;
  isActive: boolean;
  productCodes: string[];
  productIds: string[];
  /** Les produits de l'officine concernés (désignés, ou retrouvés par leur code). */
  products: { id: string; name: string }[];
  startedAt: Date | null;
  completedAt: Date | null;
};

/**
 * Un contenu, s'il est visible de cette officine. Un contenu d'une autre
 * officine, ou un contenu PharmaBoost désactivé, n'existe pas pour elle.
 * `includeInactiveOwn` laisse le titulaire relire un contenu qu'il a désactivé.
 */
export async function getTraining(scope: TrainingScope, id: string, options: { includeInactiveOwn?: boolean } = {}): Promise<TrainingDetail | null> {
  const content = await prisma.trainingContent.findFirst({
    where: options.includeInactiveOwn
      ? { id, OR: [{ pharmacyId: null, isActive: true }, { pharmacyId: scope.pharmacyId }] }
      : { id, ...visibleWhere(scope) },
    select: { ...CARD_SELECT, body: true, isActive: true, productCodes: true, productIds: true },
  });
  if (!content) return null;

  const [progress, products] = await Promise.all([
    prisma.trainingProgress.findUnique({
      where: { contentId_userId_pharmacyId: { contentId: content.id, userId: scope.userId, pharmacyId: scope.pharmacyId } },
      select: { status: true, progressPercent: true, startedAt: true, completedAt: true },
    }),
    productsConcerned(scope, content.productIds, content.productCodes),
  ]);
  const state = progressOf(progress);
  const { pharmacyId, ...rest } = content;
  return {
    ...rest,
    isOwn: pharmacyId !== null,
    status: state.status,
    percent: state.percent,
    products,
    startedAt: progress?.startedAt ?? null,
    completedAt: state.status === "DONE" ? (progress?.completedAt ?? null) : null,
  };
}

/** Les produits de cette officine désignés par identifiant ou par code. Jamais ceux d'une autre. */
async function productsConcerned(scope: TrainingScope, productIds: string[], productCodes: string[]): Promise<{ id: string; name: string }[]> {
  const codes = productCodes.map(normalizeProductCode).filter((code): code is string => !!code);
  if (productIds.length === 0 && codes.length === 0) return [];
  const or: Prisma.ProductWhereInput[] = [];
  if (productIds.length > 0) or.push({ id: { in: productIds } });
  if (codes.length > 0) or.push({ ean: { in: codes } }, { reference: { in: codes } }, { barcodes: { some: { code: { in: codes } } } });
  return prisma.product.findMany({
    where: { pharmacyId: scope.pharmacyId, deletedAt: null, OR: or },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 12,
  });
}

export type SetProgressResult =
  | { ok: true; status: TrainingStatus; percent: number; completedAt: Date | null }
  | { ok: false; reason: "NOT_FOUND" | "QUIZ" };

/** Enregistre un geste de progression (« Commencer », « Terminé ») de la personne connectée, dans son officine. */
export async function setProgress(scope: TrainingScope, contentId: string, change: ProgressChange, now = new Date()): Promise<SetProgressResult> {
  const content = await prisma.trainingContent.findFirst({ where: { id: contentId, ...visibleWhere(scope) }, select: { id: true, kind: true } });
  if (!content) return { ok: false, reason: "NOT_FOUND" };
  if (content.kind === "QUIZ") return { ok: false, reason: "QUIZ" };

  const key = { contentId: content.id, userId: scope.userId, pharmacyId: scope.pharmacyId };
  const existing = await prisma.trainingProgress.findUnique({
    where: { contentId_userId_pharmacyId: key },
    select: { status: true, progressPercent: true, completedAt: true },
  });
  const next = nextProgress(existing ? progressOf(existing) : null, change);
  const completedAt = completionDate(existing, next, now);
  await prisma.trainingProgress.upsert({
    where: { contentId_userId_pharmacyId: key },
    create: { ...key, status: next.status, progressPercent: next.percent, startedAt: now, completedAt },
    update: { status: next.status, progressPercent: next.percent, completedAt },
  });
  return { ok: true, status: next.status, percent: next.percent, completedAt };
}

/** Les contenus « ciblables » d'une officine (le quiz, pas encore construit, n'est jamais proposé). */
async function targetableContents(scope: TrainingScope) {
  const contents = await prisma.trainingContent.findMany({
    where: visibleWhere(scope, { kind: { not: "QUIZ" } }),
    select: { id: true, title: true, pharmacyId: true, productIds: true, productCodes: true, brandKey: true, universe: true },
  });
  return contents.map(({ pharmacyId, ...content }) => ({ ...content, isOwn: pharmacyId !== null }));
}

/**
 * Pour chaque produit de l'officine, les formations qui en parlent (trois au
 * plus, de la plus précise à la plus large). Les produits sans formation sont
 * absents de la table ; un identifiant d'une autre officine est ignoré.
 * Sert au lien « Se former sur ce produit » (carte de conseil, fiche produit).
 */
export async function trainingsForProducts(scope: TrainingScope, productIds: string[], limit = 3): Promise<Map<string, { id: string; title: string }[]>> {
  const ids = [...new Set(productIds.filter(Boolean))].slice(0, 300);
  if (ids.length === 0) return new Map();
  const [products, contents] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: ids }, pharmacyId: scope.pharmacyId },
      select: { id: true, name: true, brand: true, category: true, ean: true, reference: true, barcodes: { where: { pharmacyId: scope.pharmacyId }, select: { code: true } } },
    }),
    targetableContents(scope),
  ]);
  if (contents.length === 0) return new Map();
  const refs: TrainingProductRef[] = products.map((product) => ({
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    codes: [product.ean, product.reference, ...product.barcodes.map((barcode) => barcode.code)],
  }));
  return stripMatch(trainingsByProduct(contents, refs, limit));
}

export async function trainingsForProduct(scope: TrainingScope, productId: string, limit = 3): Promise<{ id: string; title: string }[]> {
  return (await trainingsForProducts(scope, [productId], limit)).get(productId) ?? [];
}

/**
 * Variante pour ce qui n'est pas une fiche produit de l'officine — un
 * médicament du stock (présentation BDPM) décrit par son nom et son CIP13.
 * Les références sont construites côté serveur par l'appelant ; seuls les
 * contenus visibles de l'officine sont proposés.
 */
export async function trainingsForReferences(scope: TrainingScope, refs: TrainingProductRef[], limit = 3): Promise<Map<string, { id: string; title: string }[]>> {
  if (refs.length === 0) return new Map();
  const contents = await targetableContents(scope);
  if (contents.length === 0) return new Map();
  return stripMatch(trainingsByProduct(contents, refs.slice(0, 300), limit));
}

function stripMatch(map: Map<string, { id: string; title: string }[]>): Map<string, { id: string; title: string }[]> {
  return new Map([...map.entries()].map(([key, list]) => [key, list.map(({ id, title }) => ({ id, title }))]));
}

export type TeamTrainingProgress = { totalContents: number; rows: TeamProgressRow[] };

/**
 * La progression de chaque membre actif de l'officine sur les contenus qui
 * lui sont visibles. Nominatif : à n'afficher qu'au titulaire (permission
 * ANALYTICS_VIEW_TEAM_PERFORMANCE ou TEAM_MANAGE, vérifiée par l'appelant).
 */
export async function teamProgress(scope: TrainingScope): Promise<TeamTrainingProgress> {
  const [memberships, contents] = await Promise.all([
    prisma.membership.findMany({
      where: { pharmacyId: scope.pharmacyId, isActive: true, user: { deletedAt: null, status: "ACTIVE" } },
      select: { role: true, grantedPermissions: true, revokedPermissions: true, user: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.trainingContent.findMany({ where: visibleWhere(scope, { kind: { not: "QUIZ" } }), select: { id: true } }),
  ]);
  // Seuls les membres qui ont accès au centre de formation sont suivis : un
  // compte « Consultation » n'y entre pas, il n'a pas à figurer « tout à faire ».
  const members = memberships.filter((member) =>
    resolvePermissions(member.role, member.grantedPermissions, member.revokedPermissions).has(PERMISSIONS.TRAINING_VIEW),
  );
  const contentIds = contents.map((content) => content.id);
  const entries = contentIds.length
    ? await prisma.trainingProgress.findMany({
        where: { pharmacyId: scope.pharmacyId, contentId: { in: contentIds }, userId: { in: members.map((m) => m.user.id) } },
        select: { userId: true, contentId: true, status: true, progressPercent: true, updatedAt: true },
      })
    : [];
  return {
    totalContents: contentIds.length,
    rows: aggregateTeamProgress(
      members.map((member) => ({ userId: member.user.id, name: `${member.user.firstName} ${member.user.lastName}`.trim(), role: member.role })),
      contentIds,
      entries,
    ),
  };
}

// ---------------------------------------------------------------------------
// Contenus propres à l'officine (titulaire, TRAINING_MANAGE)
// ---------------------------------------------------------------------------

export type ManagedTraining = {
  id: string;
  title: string;
  summary: string | null;
  kind: TrainingKind;
  url: string | null;
  body: string | null;
  laboratory: string | null;
  brandKey: string | null;
  rangeName: string | null;
  universe: string | null;
  productCodes: string[];
  productIds: string[];
  products: { id: string; name: string }[];
  durationMinutes: number | null;
  sourceLabel: string | null;
  isActive: boolean;
  updatedAt: Date;
  /** Nombre de personnes qui l'ont commencé (toutes) et terminé. */
  learners: number;
  completed: number;
};

const MANAGED_SELECT = {
  id: true,
  title: true,
  summary: true,
  kind: true,
  url: true,
  body: true,
  laboratory: true,
  brandKey: true,
  rangeName: true,
  universe: true,
  productCodes: true,
  productIds: true,
  durationMinutes: true,
  sourceLabel: true,
  isActive: true,
  updatedAt: true,
} satisfies Prisma.TrainingContentSelect;

/** Les contenus publiés par cette officine, actifs ou non, avec leur suivi dans l'officine. */
export async function listPharmacyTrainings(scope: TrainingScope): Promise<ManagedTraining[]> {
  const contents = await prisma.trainingContent.findMany({
    where: { pharmacyId: scope.pharmacyId },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    select: MANAGED_SELECT,
  });
  if (contents.length === 0) return [];
  const ids = contents.map((content) => content.id);
  const productIds = [...new Set(contents.flatMap((content) => content.productIds))];
  const [progress, products] = await Promise.all([
    prisma.trainingProgress.groupBy({ by: ["contentId", "status"], where: { pharmacyId: scope.pharmacyId, contentId: { in: ids } }, _count: { _all: true } }),
    productIds.length
      ? // Un produit supprimé depuis n'est plus proposé : le formulaire ne le renvoie pas, et l'enregistrement reste possible.
        prisma.product.findMany({ where: { pharmacyId: scope.pharmacyId, deletedAt: null, id: { in: productIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  const productName = new Map(products.map((product) => [product.id, product.name]));
  return contents.map((content) => {
    const rows = progress.filter((row) => row.contentId === content.id);
    return {
      ...content,
      products: content.productIds.filter((id) => productName.has(id)).map((id) => ({ id, name: productName.get(id)! })),
      learners: rows.reduce((sum, row) => sum + row._count._all, 0),
      completed: rows.filter((row) => row.status === "DONE").reduce((sum, row) => sum + row._count._all, 0),
    };
  });
}

export type SaveTrainingResult = { ok: true; id: string; created: boolean } | { ok: false; reason: "NOT_FOUND" | "PRODUCT_NOT_FOUND" };

/** Crée ou modifie un contenu de l'officine. Les produits désignés doivent tous être les siens. */
export async function savePharmacyTraining(scope: TrainingScope, id: string | null, data: TrainingContentData): Promise<SaveTrainingResult> {
  if (id) {
    const existing = await prisma.trainingContent.findFirst({ where: { id, pharmacyId: scope.pharmacyId }, select: { id: true } });
    if (!existing) return { ok: false, reason: "NOT_FOUND" };
  }
  if (data.productIds.length > 0) {
    const owned = await prisma.product.count({ where: { pharmacyId: scope.pharmacyId, deletedAt: null, id: { in: data.productIds } } });
    if (owned !== data.productIds.length) return { ok: false, reason: "PRODUCT_NOT_FOUND" };
  }
  const fields = { ...data, productCodes: [] };
  if (id) {
    await prisma.trainingContent.update({ where: { id }, data: fields });
    return { ok: true, id, created: false };
  }
  const created = await prisma.trainingContent.create({
    data: { ...fields, pharmacyId: scope.pharmacyId, createdByUserId: scope.userId, isActive: true },
    select: { id: true },
  });
  return { ok: true, id: created.id, created: true };
}

/** Active ou désactive un contenu de l'officine. Un contenu désactivé disparaît du catalogue ; la progression est conservée. */
export async function setPharmacyTrainingActive(scope: TrainingScope, id: string, isActive: boolean): Promise<{ ok: true; title: string } | { ok: false }> {
  const existing = await prisma.trainingContent.findFirst({ where: { id, pharmacyId: scope.pharmacyId }, select: { id: true, title: true } });
  if (!existing) return { ok: false };
  await prisma.trainingContent.update({ where: { id: existing.id }, data: { isActive } });
  return { ok: true, title: existing.title };
}

/** Recherche de produits de l'officine, pour les rattacher à un contenu. */
export async function searchPharmacyProducts(scope: TrainingScope, query: string): Promise<{ id: string; name: string; brand: string | null }[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  return prisma.product.findMany({
    where: {
      pharmacyId: scope.pharmacyId,
      deletedAt: null,
      isActive: true,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
        { ean: q },
        { reference: q },
      ],
    },
    select: { id: true, name: true, brand: true },
    orderBy: { name: "asc" },
    take: 15,
  });
}

// ---------------------------------------------------------------------------
// Contenus PharmaBoost (console Super Admin) — sans scope officine
// ---------------------------------------------------------------------------

export type GlobalTraining = Omit<ManagedTraining, "products" | "productIds"> & {
  /** Officines où au moins une personne l'a commencé. Agrégat seulement. */
  pharmacies: number;
};

export async function listGlobalTrainings(): Promise<GlobalTraining[]> {
  const contents = await prisma.trainingContent.findMany({
    where: { pharmacyId: null },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    select: { ...MANAGED_SELECT, productIds: false },
  });
  if (contents.length === 0) return [];
  const ids = contents.map((content) => content.id);
  const [byStatus, byPharmacy] = await Promise.all([
    prisma.trainingProgress.groupBy({ by: ["contentId", "status"], where: { contentId: { in: ids } }, _count: { _all: true } }),
    prisma.trainingProgress.groupBy({ by: ["contentId", "pharmacyId"], where: { contentId: { in: ids } } }),
  ]);
  return contents.map((content) => {
    const rows = byStatus.filter((row) => row.contentId === content.id);
    return {
      ...content,
      learners: rows.reduce((sum, row) => sum + row._count._all, 0),
      completed: rows.filter((row) => row.status === "DONE").reduce((sum, row) => sum + row._count._all, 0),
      pharmacies: byPharmacy.filter((row) => row.contentId === content.id).length,
    };
  });
}

/** Crée ou modifie un contenu PharmaBoost. Ne touche jamais un contenu d'officine. */
export async function saveGlobalTraining(id: string | null, data: TrainingContentData, adminId: string): Promise<{ ok: true; id: string; created: boolean } | { ok: false; reason: "NOT_FOUND" }> {
  const fields = { ...data, productIds: [] };
  if (id) {
    const existing = await prisma.trainingContent.findFirst({ where: { id, pharmacyId: null }, select: { id: true } });
    if (!existing) return { ok: false, reason: "NOT_FOUND" };
    await prisma.trainingContent.update({ where: { id }, data: fields });
    return { ok: true, id, created: false };
  }
  const created = await prisma.trainingContent.create({ data: { ...fields, pharmacyId: null, createdByAdminId: adminId, isActive: true }, select: { id: true } });
  return { ok: true, id: created.id, created: true };
}

export async function setGlobalTrainingActive(id: string, isActive: boolean): Promise<{ ok: true; title: string } | { ok: false }> {
  const existing = await prisma.trainingContent.findFirst({ where: { id, pharmacyId: null }, select: { id: true, title: true } });
  if (!existing) return { ok: false };
  await prisma.trainingContent.update({ where: { id: existing.id }, data: { isActive } });
  return { ok: true, title: existing.title };
}
