import "server-only";
import { prisma } from "@/server/db/client";

/**
 * Les deux jalons que les challenges, le tableau de bord et la liste d'équipe
 * comptent : « démonstration réalisée » et « activée ». Une seule source, une
 * seule règle, pour que trois écrans ne donnent jamais trois chiffres :
 *
 * - une officine compte UNE fois, à la date de son PREMIER jalon (une démo
 *   refaite, un contrat repris, une seconde activation ne se recomptent pas) ;
 * - le crédit va au commercial qui suit le dossier AUJOURD'HUI ;
 * - la date vient d'un événement tracé, jamais d'une colonne qu'un geste
 *   ultérieur peut effacer (reprogrammer une démo remet `demoDoneAt` à zéro).
 */

export type FirstMilestone = { prospectId: string; salesRepId: string; at: Date };

/** L'intervalle regardé : `gte` toujours, `lt` ou `lte` pour la fin. */
export type MilestoneWindow = { gte: Date; lt?: Date; lte?: Date };

type Dated = { prospectId: string; at: Date };

function keepOwned(firsts: Dated[], owners: Map<string, string>, window: MilestoneWindow): FirstMilestone[] {
  const kept: FirstMilestone[] = [];
  for (const first of firsts) {
    const salesRepId = owners.get(first.prospectId);
    // Un premier jalon antérieur à la période : l'officine a déjà été comptée avant.
    if (salesRepId && first.at.getTime() >= window.gte.getTime()) kept.push({ prospectId: first.prospectId, salesRepId, at: first.at });
  }
  return kept;
}

const range = (window: MilestoneWindow) => ({ gte: window.gte, ...(window.lt ? { lt: window.lt } : {}), ...(window.lte ? { lte: window.lte } : {}) });

/** Les officines dont la PREMIÈRE démonstration réalisée tombe dans la période (source : l'audit `sales.demo_done`). */
export async function firstDemoDoneByProspect(salesRepIds: string[], window: MilestoneWindow): Promise<FirstMilestone[]> {
  if (salesRepIds.length === 0) return [];
  const inWindow = await prisma.auditLog.findMany({
    where: { action: "sales.demo_done", entityType: "Prospect", entityId: { not: null }, createdAt: range(window) },
    select: { entityId: true },
  });
  const ids = [...new Set(inWindow.map((row) => row.entityId).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return [];
  const prospects = await prisma.prospect.findMany({ where: { id: { in: ids }, salesRepId: { in: salesRepIds } }, select: { id: true, salesRepId: true } });
  const owners = new Map(prospects.flatMap((prospect) => (prospect.salesRepId ? [[prospect.id, prospect.salesRepId] as const] : [])));
  if (owners.size === 0) return [];
  const firsts = await prisma.auditLog.groupBy({ by: ["entityId"], where: { action: "sales.demo_done", entityType: "Prospect", entityId: { in: [...owners.keys()] } }, _min: { createdAt: true } });
  return keepOwned(
    firsts.flatMap((first) => (first.entityId && first._min.createdAt ? [{ prospectId: first.entityId, at: first._min.createdAt }] : [])),
    owners,
    window,
  );
}

/** Les officines dont la PREMIÈRE activation tombe dans la période (source : l'événement « passé à Activé » du dossier). */
export async function firstActivationByProspect(salesRepIds: string[], window: MilestoneWindow): Promise<FirstMilestone[]> {
  if (salesRepIds.length === 0) return [];
  const activated = await prisma.prospectEvent.findMany({
    where: { type: "STATUS_CHANGED", createdAt: range(window), metadata: { path: ["to"], equals: "ACTIVATED" }, prospect: { salesRepId: { in: salesRepIds } } },
    select: { prospectId: true, prospect: { select: { salesRepId: true } } },
  });
  const owners = new Map(activated.flatMap((row) => (row.prospect.salesRepId ? [[row.prospectId, row.prospect.salesRepId] as const] : [])));
  if (owners.size === 0) return [];
  const firsts = await prisma.prospectEvent.groupBy({ by: ["prospectId"], where: { prospectId: { in: [...owners.keys()] }, type: "STATUS_CHANGED", metadata: { path: ["to"], equals: "ACTIVATED" } }, _min: { createdAt: true } });
  return keepOwned(
    firsts.flatMap((first) => (first._min.createdAt ? [{ prospectId: first.prospectId, at: first._min.createdAt }] : [])),
    owners,
    window,
  );
}

/** Compte par commercial. */
export function countByRep(milestones: FirstMilestone[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const milestone of milestones) counts.set(milestone.salesRepId, (counts.get(milestone.salesRepId) ?? 0) + 1);
  return counts;
}
