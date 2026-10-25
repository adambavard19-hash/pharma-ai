import { prisma } from "@/server/db/client";
import { hasSettled } from "@/core/counter/settle";
import { analysePrescription } from "@/server/services/analysis";
import { recordAudit } from "@/server/audit/log";

/**
 * La vente bipée est analysée sans qu'un écran PharmaBoost soit ouvert :
 * quand le poste demande l'avis et que la vente est restée quelques secondes sans
 * nouveau bip (voir `core/counter/settle.ts`), elle passe « vérifiée » (les boîtes bipées sont des lignes
 * certaines) et l'analyse tourne ici même. Une seule fois : la mise à jour
 * conditionnelle du statut départage un écran qui ferait la même chose.
 * Renvoie vrai quand l'analyse vient d'être faite ici.
 *
 * Partagé par le poste de caisse (/api/agent/conseil) et la démonstration au comptoir (/demo/comptoir).
 */
export async function settleAndAnalyse(scope: { pharmacyId: string; userId: string; organizationId: string }, id: string): Promise<boolean> {
  const fresh = await prisma.prescription.findUnique({ where: { id }, select: { status: true, updatedAt: true, pharmacyId: true, lines: { select: { status: true } } } });
  if (!fresh || fresh.pharmacyId !== scope.pharmacyId || fresh.status !== "NEEDS_VERIFICATION") return false;
  if (!hasSettled(fresh.updatedAt, new Date())) return false;
  if (fresh.lines.length === 0 || fresh.lines.some((line) => line.status !== "CONFIRMED")) return false;
  const won = await prisma.prescription.updateMany({ where: { id, pharmacyId: scope.pharmacyId, status: "NEEDS_VERIFICATION" }, data: { status: "VERIFIED", verifiedAt: new Date(), verifiedByUserId: scope.userId } });
  if (won.count === 0) return false;
  await recordAudit({ action: "prescription.verified", entityType: "Prescription", entityId: id, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { confirmedLines: fresh.lines.length, totalLines: fresh.lines.length, by: "counter-post" } });
  await analysePrescription({ scope, prescriptionId: id });
  return true;
}
