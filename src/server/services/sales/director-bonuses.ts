import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { applyCommissionGesture, type CommissionGesture } from "@/core/sales/director/money";
import type { CommissionStatusCode } from "@/core/sales/pipeline";

/**
 * Les primes du directeur commercial (50 € HT par pharmacie signée par l'équipe, une fois la mise en service réglée :
 * `affiliate-commissions.ts` les crée). Le directeur ne valide pas ses propres primes : la console les valide, les
 * marque payées ou les annule, avec les mêmes gestes et les mêmes statuts que les commissions.
 */

export type DirectorBonusRow = { id: string; amountCents: number; status: CommissionStatusCode; earnedAt: Date | null; dueAt: Date | null; paidAt: Date | null; note: string | null; prospect: { id: string; name: string; city: string | null }; director: { id: string; name: string } };

/** Les primes, les plus récentes d'abord : toutes (console) ou celles d'un directeur (son espace, d'après SA session). */
export async function listDirectorBonuses(filter: { salesDirectorId?: string } = {}): Promise<{ rows: DirectorBonusRow[]; earnedCents: number; payableCents: number; paidCents: number }> {
  const found = await prisma.directorBonus.findMany({
    where: filter.salesDirectorId ? { salesDirectorId: filter.salesDirectorId } : {},
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
    include: { prospect: { select: { id: true, name: true, city: true } }, salesDirector: { select: { id: true, firstName: true, lastName: true } } },
  });
  const rows = found.map((row) => ({ id: row.id, amountCents: row.amountCents, status: row.status as CommissionStatusCode, earnedAt: row.earnedAt, dueAt: row.dueAt, paidAt: row.paidAt, note: row.note, prospect: row.prospect, director: { id: row.salesDirector.id, name: `${row.salesDirector.firstName} ${row.salesDirector.lastName}` } }));
  const sum = (status: CommissionStatusCode) => rows.filter((row) => row.status === status).reduce((total, row) => total + row.amountCents, 0);
  return { rows, earnedCents: sum("EARNED"), payableCents: sum("PAYABLE"), paidCents: sum("PAID") };
}

/**
 * « Valider », « Marquer payée » ou « Annuler » une prime, depuis la console. Le geste doit être permis depuis le statut
 * relu ; l'écriture est conditionnée à ce statut (deux gestes simultanés : le second est refusé). Tracé dans l'audit.
 */
export async function moveDirectorBonus(id: string, gesture: CommissionGesture, adminId: string): Promise<{ ok: true; status: CommissionStatusCode } | { ok: false; error: string }> {
  const bonus = await prisma.directorBonus.findUnique({ where: { id }, select: { status: true } });
  if (!bonus) return { ok: false, error: "Prime introuvable. Rechargez la page." };
  const move = applyCommissionGesture(bonus.status as CommissionStatusCode, gesture);
  if (!move.ok) return { ok: false, error: move.error };
  const written = await prisma.directorBonus.updateMany({ where: { id, status: bonus.status }, data: { status: move.to, ...(move.to === "PAID" ? { paidAt: new Date() } : {}) } });
  if (written.count !== 1) return { ok: false, error: "La prime a changé entre-temps : rechargez la page." };
  await recordAudit({ action: "sales.director_bonus_updated", entityType: "DirectorBonus", entityId: id, platformAdminId: adminId, metadata: { before: { status: bonus.status }, after: { status: move.to } } });
  return { ok: true, status: move.to };
}
