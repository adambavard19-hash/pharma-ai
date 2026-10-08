import { NextResponse } from "next/server";
import { prisma } from "@/server/db/client";
import { authenticateAgent } from "@/server/services/stock-sync";
import { buildCounterNotice, type CounterNotice } from "@/core/counter/notice";
import { hasSettled } from "@/core/counter/settle";
import { analysePrescription } from "@/server/services/analysis";
import { recordAudit } from "@/server/audit/log";
import { getEnv } from "@/config/env";
import { stockReminderLevel } from "@/core/stock-deposit/rules";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { mayShowAtCounter, reviewsByKey } from "@/core/ai/rule-review";
import { loadRuleReviews } from "@/server/services/advice-rule-reviews";

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

/** L'état de la vente et l'avis qui s'en déduit, lus en base ; `null` quand la vente n'est pas celle de ce poste. */
async function readNotice(agent: Agent, id: string): Promise<{ status: string; notice: CounterNotice } | null> {
  const prescription = await prisma.prescription.findFirst({
    where: { id, pharmacyId: agent.scope.pharmacyId, source: "COUNTER_SCAN" },
    select: {
      reference: true,
      status: true,
      lines: { orderBy: { position: "asc" }, select: { drugName: true, drugSpecialtyId: true } },
      analysisRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { outcome: true, safetyFindings: { select: { severity: true, subjectType: true, code: true, message: true, acknowledgedAt: true } } },
      },
      recommendations: {
        orderBy: { totalScore: "desc" },
        select: { status: true, origin: true, opportunity: { select: { ruleKey: true } }, shortReason: true, justification: true, product: { select: { name: true, salePriceCents: true, imageUrl: true, stockItem: { select: { quantity: true, alertThreshold: true } } } }, presentation: { select: { priceCents: true, specialty: { select: { name: true } }, pharmacyStocks: { where: { pharmacyId: agent.scope.pharmacyId }, select: { priceCents: true, quantity: true } } } } },
      },
    },
  });
  if (!prescription) return null;
  if (prescription.status === "NEEDS_VERIFICATION") {
    return { status: prescription.status, notice: buildCounterNotice({ reference: prescription.reference, prescriptionStatus: "NEEDS_VERIFICATION", lineNames: [], alerts: [], recommendations: [], outcome: null }) };
  }

  const run = prescription.analysisRuns[0];
  // Prix et « En stock » viennent du même export : un stock ancien ne s'affiche pas comme un fait.
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: agent.scope.pharmacyId }, select: { stockSyncedAt: true } });
  const stockReliable = stockReminderLevel(pharmacy?.stockSyncedAt ?? null, new Date()) === "none";
  // Dans la fenêtre du poste, seul parle ce que la pharmacienne a validé : ses propres associations, ses ajouts, et les
  // règles du moteur qu'elle a relues. Le reste reste lisible sur l'écran complet de la vente.
  const reviews = reviewsByKey(await loadRuleReviews(agent.scope.pharmacyId));
  const notice = buildCounterNotice({
    reference: prescription.reference,
    prescriptionStatus: prescription.status,
    lineNames: prescription.lines.map((line) => line.drugName ?? "").filter(Boolean),
    lineKinds: prescription.lines.filter((line) => line.drugName).map((line) => (line.drugSpecialtyId ? ("DRUG" as const) : ("PRODUCT" as const))),
    alerts: (run?.safetyFindings ?? []).map((finding) => ({ severity: finding.severity, subjectType: finding.subjectType, code: finding.code, message: finding.message, acknowledged: finding.acknowledgedAt !== null })),
    recommendations: prescription.recommendations.map((rec) => ({
      name: rec.product?.name ?? rec.presentation?.specialty.name ?? "Produit",
      priceCents: rec.product?.salePriceCents ?? rec.presentation?.pharmacyStocks[0]?.priceCents ?? rec.presentation?.priceCents ?? null,
      reason: rec.shortReason ?? rec.justification,
      status: rec.status,
      trusted: rec.origin !== "AI" || mayShowAtCounter(rec.opportunity?.ruleKey, ADVICE_RULES, reviews),
      imageUrl: rec.product?.imageUrl ?? null,
      quantity: rec.product ? (rec.product.stockItem?.quantity ?? null) : (rec.presentation?.pharmacyStocks[0]?.quantity ?? null),
      alertThreshold: rec.product?.stockItem?.alertThreshold ?? null,
    })),
    outcome: run?.outcome ?? null,
    stockReliable,
  });
  return { status: prescription.status, notice };
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
  return NextResponse.json({ ok: true, ...read.notice, url: `${getEnv().APP_URL}/vente/${id}` });
}
