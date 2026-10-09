import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { getMessagingProvider } from "@/server/ai/registry";
import { traceDispatch } from "@/server/services/email-dispatch";
import { getEnv } from "@/config/env";
import { COUNTER_DECLARED } from "@/server/services/counter-window";
import { buildMonthlyReport, summariseCounterResults, type CounterResults, type SoldAdvice } from "@/core/counter/results";
import { monthBoundsFor, zonedDateParts } from "@/core/performance/periods";

/**
 * Les résultats de la fenêtre du poste de caisse (page « Ce que PharmaBoost vous rapporte ») et le rapport mensuel du titulaire.
 * Seules comptent les ventes TERMINÉES ; tout est déclaratif (voir core/counter/results.ts).
 */

export async function loadCounterResults(input: { pharmacyId: string; since: Date; until: Date }): Promise<CounterResults> {
  const followUps = await prisma.counterSaleFollowUp.findMany({
    where: { pharmacyId: input.pharmacyId, closedAt: { gte: input.since, lt: input.until } },
    select: { prescriptionId: true, closedPost: true, proposedCount: true, soldCount: true, notSoldCount: true, unansweredCount: true, emailEncrypted: true, consentAt: true, reportStatus: true },
  });
  const sales = followUps.map((followUp) => ({
    post: followUp.closedPost ?? "poste",
    proposed: followUp.proposedCount,
    sold: followUp.soldCount,
    notSold: followUp.notSoldCount,
    unanswered: followUp.unansweredCount,
    emailSaved: Boolean(followUp.emailEncrypted && followUp.consentAt),
    report: followUp.reportStatus,
  }));
  const soldRecs = followUps.length
    ? await prisma.recommendation.findMany({
        where: { pharmacyId: input.pharmacyId, prescriptionId: { in: followUps.map((followUp) => followUp.prescriptionId) }, status: "PURCHASED", outcomeSource: COUNTER_DECLARED },
        select: {
          outcomePost: true,
          product: { select: { name: true } },
          presentation: { select: { specialty: { select: { name: true } } } },
          events: { where: { type: "PURCHASED" }, orderBy: { createdAt: "desc" }, take: 1, select: { metadata: true } },
        },
      })
    : [];
  const soldAdvice: SoldAdvice[] = soldRecs.map((rec) => {
    const metadata = (rec.events[0]?.metadata ?? {}) as { challenge?: unknown; shortDateOn?: unknown };
    return {
      post: rec.outcomePost ?? "poste",
      product: (rec.product?.name ?? rec.presentation?.specialty.name ?? "Produit").replace(/,.*$/, "").trim(),
      challenge: typeof metadata.challenge === "string" && metadata.challenge ? metadata.challenge : null,
      shortDateOn: typeof metadata.shortDateOn === "string" && metadata.shortDateOn ? metadata.shortDateOn : null,
    };
  });
  return summariseCounterResults({ sales, soldAdvice });
}

export type MonthlyReportRun = { month: string; pharmacies: number; sent: number; skipped: number; failed: number };

/**
 * Le rapport du mois écoulé, envoyé à chaque titulaire dont l'officine a terminé au moins une vente avec la fenêtre.
 * Une seule fois par officine et par mois : l'envoi laisse une ligne dans le journal des e-mails, relue avant d'écrire.
 */
export async function sendMonthlyCounterReports(now: Date = new Date(), timeZone = "Europe/Paris"): Promise<MonthlyReportRun> {
  const current = monthBoundsFor(now, timeZone);
  // Douze heures avant le début du mois courant : un instant du mois précédent, quelle que soit la durée du jour (changement d'heure).
  const previous = monthBoundsFor(new Date(current.start.getTime() - 12 * 3_600_000), timeZone);
  const previousMonthStart = previous.start;
  const thisMonthStart = current.start;
  const parts = zonedDateParts(previousMonthStart, timeZone);
  const monthKey = `${parts.year}-${String(parts.month).padStart(2, "0")}`;
  const monthLabel = previous.label;
  const templateKey = `counter-monthly:${monthKey}`;
  const run: MonthlyReportRun = { month: monthKey, pharmacies: 0, sent: 0, skipped: 0, failed: 0 };

  const closed = await prisma.counterSaleFollowUp.groupBy({ by: ["pharmacyId"], where: { closedAt: { gte: previousMonthStart, lt: thisMonthStart } } });
  for (const { pharmacyId } of closed) {
    run.pharmacies += 1;
    const already = await prisma.emailDispatch.findFirst({ where: { pharmacyId, templateKey, status: { in: ["SENT", "DELIVERED", "DELAYED", "SIMULATED"] } }, select: { id: true } });
    if (already) { run.skipped += 1; continue; }
    const pharmacy = await prisma.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: { name: true, isDemo: true, isActive: true, memberships: { where: { role: "OWNER", isActive: true }, select: { user: { select: { id: true, email: true } } } } },
    });
    if (!pharmacy || !pharmacy.isActive || pharmacy.isDemo || pharmacy.memberships.length === 0) { run.skipped += 1; continue; }
    const results = await loadCounterResults({ pharmacyId, since: previousMonthStart, until: thisMonthStart });
    const mail = buildMonthlyReport({ pharmacyName: pharmacy.name, monthLabel, results, resultsUrl: `${getEnv().APP_URL}/resultats?periode=month` });
    if (!mail) { run.skipped += 1; continue; }
    const messaging = getMessagingProvider({ demo: false });
    let delivered = false;
    for (const { user } of pharmacy.memberships) {
      const outcome = await messaging
        .sendEmail({ to: user.email, fromName: "PharmaBoost", subject: mail.subject, text: mail.text, html: mail.html })
        .catch((error: unknown) => ({ status: "FAILED" as const, provider: messaging.info.id, detail: error instanceof Error ? error.message : "Envoi impossible." }));
      await traceDispatch({ kind: "COUNTER_MONTHLY", recipient: user.email, outcome, subject: mail.subject, templateKey, trigger: "AUTOMATIC", pharmacyId, userId: user.id });
      if (outcome.status !== "FAILED") delivered = true;
    }
    if (delivered) {
      run.sent += 1;
      await recordAudit({ action: "counter_window.monthly_report_sent", entityType: "Pharmacy", entityId: pharmacyId, pharmacyId, metadata: { month: monthKey, recipients: pharmacy.memberships.length, salesClosed: results.salesClosed } });
    } else run.failed += 1;
  }
  return run;
}
