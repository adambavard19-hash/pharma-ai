import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { authenticateAgent } from "@/server/services/stock-sync";
import { buildCounterNotice } from "@/core/counter/notice";
import { analysePrescription } from "@/server/services/analysis";
import { recordAudit } from "@/server/audit/log";
import { getEnv } from "@/config/env";

export const dynamic = "force-dynamic";
// L'analyse peut dépasser dix secondes : on le déclare à l'hébergeur.
export const maxDuration = 60;

/** Après le dernier bip, on laisse ce délai pour qu'une autre boîte du même client arrive. */
const SETTLE_MS = 6_000;

/**
 * La vente bipée est analysée sans qu'un écran PharmaBoost soit ouvert :
 * quand le poste demande l'avis et que la vente est restée six secondes sans
 * nouveau bip, elle passe « vérifiée » (les boîtes bipées sont des lignes
 * certaines) et l'analyse tourne ici même. Une seule fois : la mise à jour
 * conditionnelle du statut départage un écran qui ferait la même chose.
 */
async function settleAndAnalyse(agent: { scope: { pharmacyId: string; userId: string; organizationId: string } }, id: string): Promise<void> {
  const fresh = await prisma.prescription.findUnique({ where: { id }, select: { status: true, updatedAt: true, lines: { select: { status: true } } } });
  if (!fresh || fresh.status !== "NEEDS_VERIFICATION") return;
  if (Date.now() - fresh.updatedAt.getTime() < SETTLE_MS) return;
  if (fresh.lines.length === 0 || fresh.lines.some((line) => line.status !== "CONFIRMED")) return;
  const won = await prisma.prescription.updateMany({ where: { id, status: "NEEDS_VERIFICATION" }, data: { status: "VERIFIED", verifiedAt: new Date(), verifiedByUserId: agent.scope.userId } });
  if (won.count === 0) return;
  await recordAudit({ action: "prescription.verified", entityType: "Prescription", entityId: id, pharmacyId: agent.scope.pharmacyId, userId: agent.scope.userId, metadata: { confirmedLines: fresh.lines.length, totalLines: fresh.lines.length, by: "counter-post" } });
  await analysePrescription({ scope: agent.scope, prescriptionId: id });
}

/**
 * L'avis de comptoir d'une vente bipée, pour le poste de caisse qui l'a
 * ouverte : alertes puis conseils, en quelques lignes, dès que l'analyse est
 * prête. Le poste l'interroge après chaque bip et affiche l'avis en coin
 * d'écran, par-dessus le LGO. Aucune donnée patient ne sort : les noms des
 * boîtes, les alertes et les produits conseillés, rien d'autre.
 */
export async function GET(request: Request) {
  const agent = await authenticateAgent(request.headers.get("authorization"));
  if (!agent) return NextResponse.json({ ok: false, error: "Clé inconnue ou révoquée." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("prescription") ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "Vente manquante." }, { status: 400 });

  const prescription = await prisma.prescription.findFirst({
    where: { id, pharmacyId: agent.scope.pharmacyId, source: "COUNTER_SCAN" },
    select: {
      reference: true,
      status: true,
      lines: { orderBy: { position: "asc" }, select: { drugName: true } },
      analysisRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { outcome: true, safetyFindings: { select: { severity: true, subjectType: true, code: true, message: true, acknowledgedAt: true } } },
      },
      recommendations: {
        orderBy: { totalScore: "desc" },
        select: { status: true, shortReason: true, justification: true, product: { select: { name: true, salePriceCents: true } }, presentation: { select: { priceCents: true, specialty: { select: { name: true } }, pharmacyStocks: { where: { pharmacyId: agent.scope.pharmacyId }, select: { priceCents: true } } } } },
      },
    },
  });
  if (!prescription) return NextResponse.json({ ok: false, error: "Vente inconnue pour ce poste." }, { status: 404 });
  if (prescription.status === "NEEDS_VERIFICATION") {
    try {
      await settleAndAnalyse(agent, id);
    } catch (error) {
      console.error("[conseil] analyse depuis le poste de caisse", error);
    }
    return NextResponse.json({ ok: true, ...buildCounterNotice({ reference: prescription.reference, prescriptionStatus: "NEEDS_VERIFICATION", lineNames: [], alerts: [], recommendations: [], outcome: null }), url: `${getEnv().APP_URL}/vente/${id}` });
  }

  const run = prescription.analysisRuns[0];
  const notice = buildCounterNotice({
    reference: prescription.reference,
    prescriptionStatus: prescription.status,
    lineNames: prescription.lines.map((line) => line.drugName ?? "").filter(Boolean),
    alerts: (run?.safetyFindings ?? []).map((finding) => ({ severity: finding.severity, subjectType: finding.subjectType, code: finding.code, message: finding.message, acknowledged: finding.acknowledgedAt !== null })),
    recommendations: prescription.recommendations.map((rec) => ({
      name: rec.product?.name ?? rec.presentation?.specialty.name ?? "Produit",
      priceCents: rec.product?.salePriceCents ?? rec.presentation?.pharmacyStocks[0]?.priceCents ?? rec.presentation?.priceCents ?? null,
      reason: rec.shortReason ?? rec.justification,
      status: rec.status,
    })),
    outcome: run?.outcome ?? null,
  });
  return NextResponse.json({ ok: true, ...notice, url: `${getEnv().APP_URL}/vente/${id}` });
}
