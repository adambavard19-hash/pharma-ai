import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { STANDARD_COMMISSION_KEY, STANDARD_COMMISSION_MAX_CENTS, resolveStandardCommissionCents } from "@/core/pricing/official-offer";

/**
 * La commission standard d'un commercial : 250 € par nouvelle pharmacie
 * activée, la même quelle que soit la taille de la pharmacie. Réglage de la
 * console (`PlatformSetting`), à défaut la valeur officielle.
 *
 * C'est la valeur proposée à la création d'un commercial et celle que la page
 * « Devenir commercial » annonce. La commission d'un commercial déjà créé
 * (`SalesRep.commissionValue`) n'est jamais modifiée par un changement ici.
 */
export async function getStandardCommissionCents(): Promise<number> {
  const row = await prisma.platformSetting.findUnique({ where: { key: STANDARD_COMMISSION_KEY }, select: { value: true } });
  return resolveStandardCommissionCents(row?.value);
}

export async function saveStandardCommission(amountCents: number, adminId: string): Promise<{ ok: true; amountCents: number } | { ok: false; error: string }> {
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > STANDARD_COMMISSION_MAX_CENTS) {
    return { ok: false, error: `Indiquez un montant entre 1 € et ${STANDARD_COMMISSION_MAX_CENTS / 100} € par pharmacie activée.` };
  }
  const before = await getStandardCommissionCents();
  await prisma.platformSetting.upsert({
    where: { key: STANDARD_COMMISSION_KEY },
    update: { value: { amountCents }, updatedBy: adminId },
    create: { key: STANDARD_COMMISSION_KEY, value: { amountCents }, updatedBy: adminId },
  });
  await recordAudit({ action: "platform.standard_commission_updated", entityType: "PlatformSetting", entityId: STANDARD_COMMISSION_KEY, platformAdminId: adminId, metadata: { before: { amountCents: before }, after: { amountCents } } });
  return { ok: true, amountCents };
}
