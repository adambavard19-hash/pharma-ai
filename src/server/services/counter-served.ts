import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import type { AgentContext } from "@/server/services/stock-sync";

/**
 * « Qui a servi ce patient ? » (fondateur, 19 oct. 2026) : un collègue sert parfois au comptoir d'un autre, sans le temps de
 * changer d'espace. À la fin d'une vente où un conseil a été vendu, la bannière du poste demande qui a servi — la personne du
 * comptoir est choisie d'avance — et la vente passe aux résultats de celle qu'on touche : la vente, ses conseils tranchés et ses
 * ventes enregistrées. Seulement un membre actif de CETTE officine ; jamais une autre.
 */

/** Le plus de collègues proposés sur la bannière. */
export const COUNTER_TEAM_MAX = 12;

export type CounterTeamMember = { id: string; name: string };

/** « Donna Benveniste » → « Donna B. » ; deux prénoms identiques restent distincts par l'initiale. */
export function shortName(firstName: string, lastName: string): string {
  const first = firstName.trim();
  const initial = lastName.trim().charAt(0).toUpperCase();
  return (first ? `${first}${initial ? ` ${initial}.` : ""}` : lastName.trim()).slice(0, 40) || "Collègue";
}

/** L'équipe de l'officine, dans l'ordre choisi par le titulaire, et qui servait la vente au moment du bip. */
export async function counterTeamFor(pharmacyId: string, prescriptionId: string): Promise<{ team: CounterTeamMember[]; servedBy: string | null }> {
  const [memberships, sale] = await Promise.all([
    prisma.membership.findMany({
      where: { pharmacyId, isActive: true, user: { deletedAt: null } },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: COUNTER_TEAM_MAX,
      select: { user: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.prescription.findFirst({ where: { id: prescriptionId, pharmacyId }, select: { handledByUserId: true } }),
  ]);
  return { team: memberships.map(({ user }) => ({ id: user.id, name: shortName(user.firstName, user.lastName) })), servedBy: sale?.handledByUserId ?? null };
}

export type ServedResult = { ok: true; changed: boolean } | { ok: false; error: string };

export async function setCounterServedBy(agent: AgentContext, input: { prescriptionId: string; userId: string }): Promise<ServedResult> {
  const pharmacyId = agent.scope.pharmacyId;
  const [sale, member] = await Promise.all([
    prisma.prescription.findFirst({ where: { id: input.prescriptionId, pharmacyId, source: "COUNTER_SCAN" }, select: { id: true, handledByUserId: true } }),
    prisma.membership.findFirst({ where: { pharmacyId, userId: input.userId, isActive: true, user: { deletedAt: null } }, select: { userId: true } }),
  ]);
  if (!sale) return { ok: false, error: "Vente inconnue pour ce poste." };
  if (!member) return { ok: false, error: "Cette personne ne fait pas partie de l'équipe." };
  if (sale.handledByUserId === member.userId) return { ok: true, changed: false };
  await prisma.$transaction([
    prisma.prescription.update({ where: { id: sale.id }, data: { handledByUserId: member.userId } }),
    // Les conseils déjà tranchés au comptoir (vendus, refusés) suivent la vente ; ceux encore ouverts n'ont personne à changer.
    prisma.recommendation.updateMany({ where: { prescriptionId: sale.id, pharmacyId, decidedByUserId: { not: null } }, data: { decidedByUserId: member.userId } }),
    prisma.sale.updateMany({ where: { prescriptionId: sale.id, pharmacyId }, data: { userId: member.userId } }),
  ]);
  await recordAudit({ action: "prescription.counter_served_by", entityType: "Prescription", entityId: sale.id, pharmacyId, userId: agent.scope.userId, metadata: { from: sale.handledByUserId, to: member.userId, post: agent.postId } });
  return { ok: true, changed: true };
}
