import "server-only";
import { prisma } from "@/server/db/client";
import { buildCounterNotice, type CounterNotice } from "@/core/counter/notice";
import { stockReminderLevel } from "@/core/stock-deposit/rules";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { loadCentralAdvice } from "@/server/services/central-advice";
import { activeChallengeTitlesFor } from "@/server/services/challenges";
import { nearestShortDatesFor } from "@/server/services/stock-lots";

/**
 * Ce que la fenêtre du poste de caisse affiche pour une vente bipée, lu en base : les alertes, les conseils (avec le médicament
 * concerné, la photo, le stock, un éventuel challenge, une date courte réelle) et l'état du suivi de la vente (adresse du
 * patient enregistrée ? vente terminée ?). `null` quand la vente n'est pas celle de cette officine.
 */
export type CounterSaleRead = {
  status: string;
  notice: CounterNotice;
  followUp: { emailSaved: boolean; closed: boolean };
};

export async function readCounterNotice(pharmacyId: string, id: string, now: Date = new Date()): Promise<CounterSaleRead | null> {
  const prescription = await prisma.prescription.findFirst({
    where: { id, pharmacyId, source: "COUNTER_SCAN" },
    select: {
      reference: true,
      status: true,
      counterFollowUp: { select: { emailEncrypted: true, consentAt: true, closedAt: true } },
      lines: { orderBy: { position: "asc" }, select: { id: true, drugName: true, drugSpecialtyId: true } },
      analysisRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: { outcome: true, safetyFindings: { select: { severity: true, subjectType: true, code: true, message: true, acknowledgedAt: true } } },
      },
      recommendations: {
        orderBy: { totalScore: "desc" },
        select: {
          id: true,
          status: true,
          origin: true,
          productId: true,
          presentationId: true,
          opportunity: { select: { ruleKey: true, triggeredLineIds: true } },
          shortReason: true,
          justification: true,
          product: { select: { name: true, salePriceCents: true, imageUrl: true, stockItem: { select: { quantity: true, alertThreshold: true } } } },
          presentation: { select: { priceCents: true, specialty: { select: { name: true } }, pharmacyStocks: { where: { pharmacyId }, select: { priceCents: true, quantity: true } } } },
        },
      },
    },
  });
  if (!prescription) return null;
  const followUp = { emailSaved: Boolean(prescription.counterFollowUp?.emailEncrypted && prescription.counterFollowUp.consentAt), closed: Boolean(prescription.counterFollowUp?.closedAt) };
  // La vente que le pharmacien a terminée ne redevient jamais « en cours » : la fenêtre se ferme et attend la suivante.
  if (followUp.closed) {
    return { status: prescription.status, followUp, notice: buildCounterNotice({ reference: prescription.reference, prescriptionStatus: "DELIVERED", lineNames: [], alerts: [], recommendations: [], outcome: null }) };
  }
  if (prescription.status === "NEEDS_VERIFICATION") {
    return { status: prescription.status, followUp, notice: buildCounterNotice({ reference: prescription.reference, prescriptionStatus: "NEEDS_VERIFICATION", lineNames: [], alerts: [], recommendations: [], outcome: null }) };
  }

  const run = prescription.analysisRuns[0];
  // Prix et « En stock » viennent du même export : un stock ancien ne s'affiche pas comme un fait.
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { stockSyncedAt: true } });
  const stockReliable = stockReminderLevel(pharmacy?.stockSyncedAt ?? null, now) === "none";
  // Dans la fenêtre du poste comme sur l'écran de la vente, une règle supprimée dans la console de PharmaBoost n'existe plus :
  // un conseil resté dans une analyse ancienne ne s'affiche pas. Les règles en ligne parlent, validées ou non.
  const central = await loadCentralAdvice();
  const removed = new Set(central.removed);
  const known = new Set([...ADVICE_RULES.map((rule) => rule.key), ...central.custom.map((rule) => rule.key)]);

  const productIds = prescription.recommendations.map((rec) => rec.productId).filter((value): value is string => Boolean(value));
  const [challenges, shortDates] = await Promise.all([
    activeChallengeTitlesFor(pharmacyId, productIds, now).catch(() => new Map<string, string>()),
    nearestShortDatesFor(pharmacyId, now).catch(() => new Map<string, { expiresOn: string }>()),
  ]);
  const lineName = new Map(prescription.lines.map((line) => [line.id, line.drugName ?? ""]));

  const notice = buildCounterNotice({
    reference: prescription.reference,
    prescriptionStatus: prescription.status,
    lineNames: prescription.lines.map((line) => line.drugName ?? "").filter(Boolean),
    lineKinds: prescription.lines.filter((line) => line.drugName).map((line) => (line.drugSpecialtyId ? ("DRUG" as const) : ("PRODUCT" as const))),
    alerts: (run?.safetyFindings ?? []).map((finding) => ({ severity: finding.severity, subjectType: finding.subjectType, code: finding.code, message: finding.message, acknowledged: finding.acknowledgedAt !== null })),
    recommendations: prescription.recommendations.map((rec) => {
      const triggered = rec.opportunity?.triggeredLineIds.map((lineId) => lineName.get(lineId) ?? "").find(Boolean) ?? null;
      const shortDate = rec.productId ? shortDates.get(`p:${rec.productId}`) : rec.presentationId ? shortDates.get(`d:${rec.presentationId}`) : undefined;
      return {
        id: rec.id,
        name: rec.product?.name ?? rec.presentation?.specialty.name ?? "Produit",
        forDrug: triggered,
        challengeTitle: rec.productId ? (challenges.get(rec.productId) ?? null) : null,
        shortDateOn: shortDate?.expiresOn ?? null,
        priceCents: rec.product?.salePriceCents ?? rec.presentation?.pharmacyStocks[0]?.priceCents ?? rec.presentation?.priceCents ?? null,
        reason: rec.shortReason ?? rec.justification,
        status: rec.status,
        trusted: rec.origin !== "AI" || (rec.opportunity?.ruleKey != null && known.has(rec.opportunity.ruleKey) && !removed.has(rec.opportunity.ruleKey)),
        imageUrl: rec.product?.imageUrl ?? null,
        quantity: rec.product ? (rec.product.stockItem?.quantity ?? null) : (rec.presentation?.pharmacyStocks[0]?.quantity ?? null),
        alertThreshold: rec.product?.stockItem?.alertThreshold ?? null,
      };
    }),
    outcome: run?.outcome ?? null,
    stockReliable,
  });
  return { status: prescription.status, notice, followUp };
}
