import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { authenticateAgent } from "@/server/services/stock-sync";
import { hasSettled } from "@/core/counter/settle";
import { analysePrescription } from "@/server/services/analysis";
import { recordAudit } from "@/server/audit/log";
import { getEnv } from "@/config/env";
import { readCounterNotice } from "@/server/services/counter-notice";

export const dynamic = "force-dynamic";
// L'analyse peut dépasser dix secondes : on le déclare à l'hébergeur.
export const maxDuration = 60;

/**
 * La vente bipée est analysée sans qu'un écran PharmaBoost soit ouvert :
 * quand le poste demande l'avis et que la vente est restée quelques secondes sans
 * nouveau bip (voir `core/counter/settle.ts`), elle passe « vérifiée » (les boîtes bipées sont des lignes
 * certaines) et l'analyse tourne ici même. Une seule fois : la mise à jour
 * conditionnelle du statut départage un écran qui ferait la même chose.
 * Renvoie vrai quand l'analyse vient d'être faite ici.
 */
async function settleAndAnalyse(agent: { scope: { pharmacyId: string; userId: string; organizationId: string } }, id: string): Promise<boolean> {
  const fresh = await prisma.prescription.findUnique({ where: { id }, select: { status: true, updatedAt: true, lines: { select: { status: true } } } });
  if (!fresh || fresh.status !== "NEEDS_VERIFICATION") return false;
  if (!hasSettled(fresh.updatedAt, new Date())) return false;
  if (fresh.lines.length === 0 || fresh.lines.some((line) => line.status !== "CONFIRMED")) return false;
  const won = await prisma.prescription.updateMany({ where: { id, status: "NEEDS_VERIFICATION" }, data: { status: "VERIFIED", verifiedAt: new Date(), verifiedByUserId: agent.scope.userId } });
  if (won.count === 0) return false;
  await recordAudit({ action: "prescription.verified", entityType: "Prescription", entityId: id, pharmacyId: agent.scope.pharmacyId, userId: agent.scope.userId, metadata: { confirmedLines: fresh.lines.length, totalLines: fresh.lines.length, by: "counter-post" } });
  await analysePrescription({ scope: agent.scope, prescriptionId: id });
  return true;
}

type Agent = { scope: { pharmacyId: string; userId: string; organizationId: string } };

/** L'état de la vente et l'avis qui s'en déduit, lu en base ; `null` quand la vente n'est pas celle de ce poste. */
function readNotice(agent: Agent, id: string) {
  return readCounterNotice(agent.scope.pharmacyId, id);
}

/**
 * L'avis de comptoir d'une vente bipée, pour le poste de caisse qui l'a
 * ouverte : alertes puis conseils, en quelques lignes, dès que l'analyse est
 * prête. Le poste l'interroge après chaque bip et affiche l'avis en coin
 * d'écran, par-dessus le LGO. Aucune donnée patient ne sort : les noms des
 * boîtes, les alertes et les produits conseillés, rien d'autre.
 *
 * Quand c'est cette interrogation qui déclenche l'analyse, la réponse porte DÉJÀ le résultat : le poste n'attend pas
 * un tour d'interrogation de plus (deux secondes) pour le lire.
 */
export async function GET(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé inconnue ou révoquée." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("prescription") ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "Vente manquante." }, { status: 400 });

  let read = await readNotice(agent, id);
  if (!read) return NextResponse.json({ ok: false, error: "Vente inconnue pour ce poste." }, { status: 404 });
  if (read.status === "NEEDS_VERIFICATION") {
    try {
      if (await settleAndAnalyse(agent, id)) read = (await readNotice(agent, id)) ?? read;
    } catch (error) {
      console.error("[conseil] analyse depuis le poste de caisse", error);
    }
  }
  return NextResponse.json({ ok: true, ...read.notice, followUp: read.followUp, url: `${getEnv().APP_URL}/vente/${id}` });
}
