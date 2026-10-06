import "server-only";
import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/server/db/client";
import { TIME_ZONE } from "@/config/constants";
import {
  actionFamily,
  actionLabel,
  actionTone,
  contextEntries,
  diffEntries,
  entityHref,
  entityLabel,
  isBusinessAction,
  JOURNAL_FAMILIES,
  journalFamily,
  journalWhere,
  type ContextEntry,
  type DiffEntry,
  type JournalFamily,
} from "@/core/admin/journal";
import type { StatusTone } from "@/core/admin/statuses";

/**
 * Le journal d'audit de la console : qui a fait quoi, quand, avec l'avant et
 * l'après. La liste blanche des familles business est appliquée DANS la
 * requête (`journalWhere`), puis revérifiée ligne à ligne : une action
 * clinique n'est jamais lue, et le serait-elle qu'elle ne s'afficherait pas.
 *
 * Seules des données d'entreprise sont résolues : nom de l'administrateur, du
 * commercial, de l'officine, du dossier. Jamais le nom d'un membre d'équipe
 * officine (« Équipe de l'officine »), ni l'adresse IP ou le navigateur.
 */

export const JOURNAL_PAGE_SIZE = 50;

/** La période vient de la page (`resolvePeriod` du kit) : le service ne dépend d'aucun composant. */
export type JournalPeriod = { value: string; label: string; days: number };

export type JournalFilters = {
  famille?: string | null;
  admin?: string | null;
  period: JournalPeriod;
  q?: string | null;
  page?: number;
};

export type JournalAuthor = { kind: "admin" | "directeur" | "commercial" | "officine" | "systeme"; label: string; href: string | null };

export type JournalRow = {
  id: string;
  at: Date;
  action: string;
  label: string;
  tone: StatusTone;
  family: { key: string; label: string; tone: StatusTone } | null;
  author: JournalAuthor;
  entity: { typeLabel: string; name: string | null; shortId: string | null; href: string | null };
  pharmacy: { id: string; name: string; href: string } | null;
  diff: DiffEntry[];
  context: ContextEntry[];
};

export type AuditJournal = {
  rows: JournalRow[];
  total: number;
  page: number;
  pageCount: number;
  period: JournalPeriod;
  family: JournalFamily | null;
  adminId: string | null;
  q: string | null;
  /** Nombre de lignes par famille sur la période (les autres filtres appliqués). */
  familyCounts: Record<string, number>;
  /** Administrateurs, pour le filtre par auteur. */
  admins: { id: string; name: string; isActive: boolean }[];
};

const cuidLike = /^[a-z0-9]{20,40}$/i;

export async function loadAuditJournal(filters: JournalFilters, now: Date = new Date()): Promise<AuditJournal> {
  const period = filters.period;
  const family = journalFamily(filters.famille);
  const q = filters.q?.trim().slice(0, 120) || null;
  const since = new Date(now.getTime() - period.days * 24 * 60 * 60 * 1000);

  const admins = await prisma.platformAdmin.findMany({
    orderBy: [{ isActive: "desc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, isActive: true },
  });
  // Un identifiant d'auteur inconnu est ignoré : on ne filtre que sur un administrateur réel.
  const adminId = filters.admin && admins.some((a) => a.id === filters.admin) ? filters.admin : null;

  const where = journalWhere({ family, adminId, since, q }) as Prisma.AuditLogWhereInput;
  const whereAllFamilies = journalWhere({ family: null, adminId, since, q }) as Prisma.AuditLogWhereInput;

  const total = await prisma.auditLog.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / JOURNAL_PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);

  const [logs, grouped] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * JOURNAL_PAGE_SIZE,
      take: JOURNAL_PAGE_SIZE,
      select: { id: true, createdAt: true, action: true, entityType: true, entityId: true, pharmacyId: true, userId: true, platformAdminId: true, metadata: true },
    }),
    prisma.auditLog.groupBy({ by: ["action"], where: whereAllFamilies, _count: { _all: true } }),
  ]);

  const familyCounts: Record<string, number> = {};
  for (const group of grouped) {
    const prefix = actionFamily(group.action);
    const f = JOURNAL_FAMILIES.find((x) => x.prefix === prefix);
    if (f) familyCounts[f.key] = (familyCounts[f.key] ?? 0) + group._count._all;
  }

  // Seconde barrière : ce qui n'est pas business ne passe pas, même si la requête l'avait laissé passer.
  const visible = logs.filter((log) => isBusinessAction(log.action, { platformAdminId: log.platformAdminId }));

  const metaString = (metadata: unknown, key: string): string | null => {
    if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
      const value = (metadata as Record<string, unknown>)[key];
      return typeof value === "string" && value.length > 0 && value.length <= 64 ? value : null;
    }
    return null;
  };

  const ids = (values: (string | null | undefined)[]) => [...new Set(values.filter((v): v is string => Boolean(v)))];
  const contractIds = ids(visible.filter((l) => l.entityType === "Contract").map((l) => l.entityId));
  const contracts = contractIds.length ? await prisma.contract.findMany({ where: { id: { in: contractIds } }, select: { id: true, reference: true, prospectId: true, pharmacyId: true } }) : [];
  const contractById = new Map(contracts.map((c) => [c.id, c]));

  // L'officine d'une ligne : la colonne, sinon les métadonnées, sinon le contrat. Toujours revérifiée en base ci-dessous.
  const pharmacyIdOf = (log: (typeof visible)[number]): string | null =>
    log.pharmacyId ?? metaString(log.metadata, "pharmacyId") ?? (log.entityType === "Contract" && log.entityId ? (contractById.get(log.entityId)?.pharmacyId ?? null) : null);

  const pharmacyIds = ids([...visible.map(pharmacyIdOf), ...visible.filter((l) => l.entityType === "Pharmacy").map((l) => l.entityId)]);
  const prospectIds = ids(visible.filter((l) => l.entityType === "Prospect").map((l) => l.entityId));
  const repIds = ids([...visible.map((l) => metaString(l.metadata, "salesRepId")), ...visible.filter((l) => l.entityType === "SalesRep").map((l) => l.entityId)]);

  // Le directeur commercial : auteur d'un geste de son espace (`salesDirectorId`) ou cible d'un geste de la console.
  const directorIds = ids([...visible.map((l) => metaString(l.metadata, "salesDirectorId")), ...visible.filter((l) => l.entityType === "SalesDirector").map((l) => l.entityId)]);

  const [pharmacies, prospects, reps, directors] = await Promise.all([
    pharmacyIds.length ? prisma.pharmacy.findMany({ where: { id: { in: pharmacyIds } }, select: { id: true, name: true } }) : [],
    prospectIds.length ? prisma.prospect.findMany({ where: { id: { in: prospectIds } }, select: { id: true, name: true } }) : [],
    repIds.length ? prisma.salesRep.findMany({ where: { id: { in: repIds } }, select: { id: true, firstName: true, lastName: true } }) : [],
    directorIds.length ? prisma.salesDirector.findMany({ where: { id: { in: directorIds } }, select: { id: true, firstName: true, lastName: true } }) : [],
  ]);

  const adminName = new Map(admins.map((a) => [a.id, `${a.firstName} ${a.lastName}`]));
  const pharmacyName = new Map(pharmacies.map((p) => [p.id, p.name]));
  const prospectName = new Map(prospects.map((p) => [p.id, p.name]));
  const repName = new Map(reps.map((r) => [r.id, `${r.firstName} ${r.lastName}`]));
  const directorName = new Map(directors.map((d) => [d.id, `${d.firstName} ${d.lastName}`]));

  const rows: JournalRow[] = visible.map((log) => {
    const repId = metaString(log.metadata, "salesRepId");
    const directorId = metaString(log.metadata, "salesDirectorId");
    // Le directeur passe avant le commercial : son geste peut citer un commercial (celui qu'il réaffecte) sans en être l'auteur.
    const author: JournalAuthor = log.platformAdminId
      ? { kind: "admin", label: adminName.get(log.platformAdminId) ?? "Administrateur supprimé", href: null }
      : directorId
        ? { kind: "directeur", label: directorName.has(directorId) ? `${directorName.get(directorId)} (directeur commercial)` : "Directeur commercial (compte supprimé)", href: "/admin/directeur-commercial" }
        : repId
          ? { kind: "commercial", label: repName.get(repId) ? `${repName.get(repId)} (commercial)` : "Commercial", href: `/admin/commerciaux/${encodeURIComponent(repId)}` }
          : log.userId
            ? { kind: "officine", label: "Équipe de l'officine", href: null }
            : { kind: "systeme", label: "Système", href: null };

    const f = JOURNAL_FAMILIES.find((x) => x.prefix === actionFamily(log.action)) ?? null;
    const contract = log.entityType === "Contract" && log.entityId ? contractById.get(log.entityId) : undefined;
    const rawPharmacyId = pharmacyIdOf(log);
    // Une officine n'est retenue (nom et lien) que si elle existe bien en base.
    const pharmacyId = rawPharmacyId && pharmacyName.has(rawPharmacyId) ? rawPharmacyId : null;

    const entityName =
      log.entityType === "Pharmacy" && log.entityId
        ? (pharmacyName.get(log.entityId) ?? null)
        : log.entityType === "Prospect" && log.entityId
          ? (prospectName.get(log.entityId) ?? null)
          : log.entityType === "SalesRep" && log.entityId
            ? (repName.get(log.entityId) ?? null)
            : log.entityType === "SalesDirector" && log.entityId
              ? (directorName.get(log.entityId) ?? null)
              : log.entityType === "PlatformAdmin" && log.entityId
                ? (adminName.get(log.entityId) ?? null)
                : contract
                  ? contract.reference
                  : null;
    const shortId = log.entityId ? (cuidLike.test(log.entityId) ? `…${log.entityId.slice(-6)}` : log.entityId.slice(0, 40)) : null;
    const href = contract && !pharmacyId ? `/admin/dossiers/${encodeURIComponent(contract.prospectId)}` : entityHref({ entityType: log.entityType, entityId: log.entityId, pharmacyId });
    const pharmacy = pharmacyId && log.entityType !== "Pharmacy" ? { id: pharmacyId, name: pharmacyName.get(pharmacyId)!, href: `/admin/pharmacies/${encodeURIComponent(pharmacyId)}` } : null;

    return {
      id: log.id,
      at: log.createdAt,
      action: log.action,
      label: actionLabel(log.action),
      tone: actionTone(log.action),
      family: f ? { key: f.key, label: f.label, tone: f.tone } : null,
      author,
      entity: { typeLabel: entityLabel(log.entityType), name: entityName, shortId, href },
      pharmacy,
      diff: diffEntries(log.metadata, log.action, TIME_ZONE),
      context: contextEntries(log.metadata, log.action, 6, TIME_ZONE),
    };
  });

  return {
    rows,
    total,
    page,
    pageCount,
    period,
    family,
    adminId,
    q,
    familyCounts,
    admins: admins.map((a) => ({ id: a.id, name: `${a.firstName} ${a.lastName}`, isActive: a.isActive })),
  };
}
