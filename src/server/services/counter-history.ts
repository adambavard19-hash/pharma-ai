import "server-only";
import { prisma } from "@/server/db/client";
import { listMembers } from "@/server/services/comptoirs";
import { COUNTER_DECLARED } from "@/server/services/counter-window";
import { unitMarginHt } from "@/core/catalog/margin";
import { buildSalesReport, reportWindow, type ClosedSale, type SalesReport, type SalesReportPeriod } from "@/core/counter/sales-report";
import { TIME_ZONE } from "@/config/constants";

/**
 * Les ventes TERMINÉES d'une officine (« Vente terminée » au poste), une par une : l'historique de l'espace du pharmacien, le
 * rapport de performance (titulaire et console) et le PDF qui en fait la preuve. Toujours borné à UNE officine. Aucune donnée
 * de patient : les boîtes scannées, les conseils, les montants.
 */
export async function loadClosedSales(input: { pharmacyId: string; from: Date; to: Date; take?: number; /** Un membre de l'équipe : seulement SES ventes (les siennes, ou celles de ses comptoirs). */ onlyFor?: { userId: string; postIds: string[] } }): Promise<ClosedSale[]> {
  const followUps = await prisma.counterSaleFollowUp.findMany({
    where: {
      pharmacyId: input.pharmacyId,
      closedAt: { gte: input.from, lte: input.to },
      ...(input.onlyFor ? { prescription: { OR: [{ handledByUserId: input.onlyFor.userId }, { counterPostId: { in: input.onlyFor.postIds } }] } } : {}),
    },
    orderBy: { closedAt: "desc" },
    take: input.take ?? 5000,
    select: {
      prescriptionId: true,
      closedAt: true,
      closedPost: true,
      proposedCount: true,
      soldCount: true,
      notSoldCount: true,
      unansweredCount: true,
      reportStatus: true,
      prescription: { select: { reference: true, handledByUserId: true, lines: { orderBy: { position: "asc" }, select: { drugName: true, status: true } } } },
    },
  });
  if (followUps.length === 0) return [];
  const [members, soldRecs] = await Promise.all([
    listMembers(input.pharmacyId),
    prisma.recommendation.findMany({
      where: { pharmacyId: input.pharmacyId, prescriptionId: { in: followUps.map((followUp) => followUp.prescriptionId) }, status: "PURCHASED", outcomeSource: COUNTER_DECLARED },
      select: {
        prescriptionId: true,
        unitPriceCents: true,
        quantity: true,
        product: { select: { name: true, salePriceCents: true, purchasePriceCents: true, vatRate: true } },
        presentation: { select: { priceCents: true, specialty: { select: { name: true } } } },
      },
    }),
  ]);
  const names = new Map(members.map((member) => [member.id, member.name]));
  const soldBySale = new Map<string, ClosedSale["soldItems"]>();
  for (const rec of soldRecs) {
    const unit = rec.unitPriceCents > 0 ? rec.unitPriceCents : (rec.product?.salePriceCents ?? rec.presentation?.priceCents ?? 0);
    const quantity = Math.max(1, rec.quantity);
    const margin = rec.product ? unitMarginHt({ salePriceCents: unit, purchasePriceCents: rec.product.purchasePriceCents, vatRate: rec.product.vatRate }) : null;
    const item = {
      name: (rec.product?.name ?? rec.presentation?.specialty.name ?? "Produit").replace(/,.*$/, "").trim(),
      priceCents: unit * quantity,
      marginCents: margin && margin.marginCents > 0 ? margin.marginCents * quantity : null,
    };
    soldBySale.set(rec.prescriptionId, [...(soldBySale.get(rec.prescriptionId) ?? []), item]);
  }
  return followUps.map((followUp) => ({
    id: followUp.prescriptionId,
    reference: followUp.prescription.reference,
    closedAt: followUp.closedAt as Date,
    who: (followUp.prescription.handledByUserId ? names.get(followUp.prescription.handledByUserId) : null) ?? followUp.closedPost ?? "Comptoir",
    boxes: followUp.prescription.lines.filter((line) => line.status === "CONFIRMED" && line.drugName).map((line) => (line.drugName as string).replace(/,.*$/, "").trim()),
    proposed: followUp.proposedCount,
    sold: followUp.soldCount,
    notSold: followUp.notSoldCount,
    unanswered: followUp.unansweredCount,
    soldItems: soldBySale.get(followUp.prescriptionId) ?? [],
    emailSent: followUp.reportStatus === "SENT",
  }));
}

/** Le rapport d'une période (aujourd'hui, 7 jours, 30 jours) qui se termine maintenant. */
export async function loadSalesReport(input: { pharmacyId: string; period: SalesReportPeriod; now?: Date }): Promise<SalesReport> {
  const now = input.now ?? new Date();
  const { from, to } = reportWindow(input.period, now, TIME_ZONE);
  const sales = await loadClosedSales({ pharmacyId: input.pharmacyId, from, to });
  return buildSalesReport({ period: input.period, sales, now, timeZone: TIME_ZONE });
}
