import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { getMessagingProvider } from "@/server/ai/registry";
import { traceDispatch } from "@/server/services/email-dispatch";
import { platformEmailContext } from "@/server/services/email-context";
import { loadSalesReport } from "@/server/services/counter-history";
import { salesReportPdfFile } from "@/server/services/sales-report-file";
import { publicUrl } from "@/server/public-url";
import { signPayload, verifyPayload } from "@/server/security/tokens";
import { zonedDateParts } from "@/core/performance/periods";
import { resolveReportRange } from "@/core/counter/sales-report";
import { buildWeeklyDigest, digestHasContent, type WeekMetric } from "@/core/notifications/weekly-digest";
import { TIME_ZONE } from "@/config/constants";

/**
 * Le résumé hebdomadaire des titulaires : le lundi (rattrapage possible jusqu'au mercredi), la semaine écoulée de chaque officine
 * active, à chacun de ses titulaires qui ne s'en est pas désinscrit. Une fois par officine et par semaine (journal des e-mails relu
 * avant d'écrire) ; chaque officine ne voit que ses propres chiffres. Lancé par la tâche quotidienne (CRON_SECRET).
 */

const DAY_MS = 86_400_000;
const UNSUBSCRIBE_TTL_MS = 400 * DAY_MS;
const UNSUBSCRIBE_KIND = "resume-hebdo";

const iso = (date: Date) => date.toISOString().slice(0, 10);

/** La semaine civile (lundi → dimanche) qui précède `now`, à Paris, et le jour de la semaine de `now` (0 = lundi). */
export function previousWeek(now: Date, timeZone = TIME_ZONE): { from: string; to: string; weekday: number; label: string } {
  const today = zonedDateParts(now, timeZone);
  const monday = new Date(Date.UTC(today.year, today.month - 1, today.day - today.weekday - 7));
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);
  const day = (date: Date, withMonth: boolean) => new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", ...(withMonth ? { month: "long" } : {}) }).format(date);
  const label = monday.getUTCMonth() === sunday.getUTCMonth() ? `du ${day(monday, false)} au ${day(sunday, true)}` : `du ${day(monday, true)} au ${day(sunday, true)}`;
  return { from: iso(monday), to: iso(sunday), weekday: today.weekday, label };
}

export function weeklyDigestUnsubscribeUrl(userId: string): string {
  return publicUrl(`/resume-hebdo/${encodeURIComponent(signPayload({ u: userId, k: UNSUBSCRIBE_KIND }, UNSUBSCRIBE_TTL_MS))}`);
}

/** Le titulaire désigné par un lien de désinscription, ou `null` (lien faux ou trop ancien). */
export function userFromUnsubscribeToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const payload = verifyPayload<{ u?: unknown; k?: unknown }>(token);
  return payload && payload.k === UNSUBSCRIBE_KIND && typeof payload.u === "string" ? payload.u : null;
}

export async function setWeeklyDigestSubscription(userId: string, subscribed: boolean): Promise<boolean> {
  const result = await prisma.user.updateMany({ where: { id: userId, deletedAt: null }, data: { weeklyDigestOptOutAt: subscribed ? null : new Date() } });
  if (result.count > 0) await recordAudit({ action: subscribed ? "user.weekly_digest_resubscribed" : "user.weekly_digest_unsubscribed", entityType: "User", entityId: userId, userId });
  return result.count > 0;
}

/** Une valeur de la semaine et son évolution par rapport à la semaine d'avant (pas de pourcentage sans base). */
export function metric(value: number, previous: number): WeekMetric {
  const deltaPct = previous > 0 ? Math.round(((value - previous) / previous) * 100) : null;
  return { value, previous, deltaPct, trend: previous === 0 && value === 0 ? "none" : value > previous ? "up" : value < previous ? "down" : "flat" };
}

/** La semaine civile précédente (lundi → dimanche, à Paris), au format des rapports du comptoir et de leur PDF. */
export const WEEK_REPORT_PARAM = "semaine-derniere";

/**
 * Les chiffres d'UNE officine pour la semaine : rien d'une autre (chaque lecture est filtrée sur son identifiant). Les conseils
 * viennent des ventes terminées au comptoir — les mêmes que la console, l'écran Résultats et le PDF (16 oct. 2026).
 */
export async function weekFigures(pharmacyId: string, now: Date) {
  const range = resolveReportRange(WEEK_REPORT_PARAM, now, TIME_ZONE);
  // La semaine d'avant, pour l'évolution (« +20 % par rapport à la semaine précédente »).
  const before = { ...range, from: new Date(range.from.getTime() - 7 * DAY_MS), to: new Date(range.to.getTime() - 7 * DAY_MS) };
  const today = zonedDateParts(now, TIME_ZONE);
  const todayDate = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const [report, previous, challenges, out, low, outNames] = await Promise.all([
    loadSalesReport({ pharmacyId, range, now }),
    loadSalesReport({ pharmacyId, range: before, now }),
    prisma.labChallenge.findMany({ where: { pharmacyId, status: "ACTIVE", startsAt: { lte: todayDate }, endsAt: { gte: todayDate } }, orderBy: { endsAt: "asc" }, take: 5, select: { title: true, endsAt: true } }),
    prisma.stockItem.count({ where: { pharmacyId, quantity: { lte: 0 }, product: { isActive: true, deletedAt: null } } }),
    prisma.stockItem.count({ where: { pharmacyId, quantity: { gt: 0, lte: prisma.stockItem.fields.alertThreshold }, product: { isActive: true, deletedAt: null } } }),
    prisma.stockItem.findMany({ where: { pharmacyId, quantity: { lte: 0 }, product: { isActive: true, deletedAt: null } }, take: 5, orderBy: { updatedAt: "desc" }, select: { product: { select: { name: true } } } }),
  ]);
  const endsLabel = (date: Date) => `jusqu'au ${new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "short" }).format(date)}`;
  return {
    advice: report.sales === 0 ? null : { proposed: metric(report.proposed, previous.proposed), purchased: metric(report.sold, previous.sold), revenueTtcCents: metric(report.revenueCents, previous.revenueCents) },
    challenges: challenges.map((challenge) => ({ title: challenge.title, endsLabel: endsLabel(challenge.endsAt) })),
    stock: { out, low, outNames: outNames.map((row) => row.product.name.replace(/,.*$/, "").trim()) },
  };
}

export type WeeklyDigestRun = { week: string | null; pharmacies: number; sent: number; skipped: number; failed: number; stoppedEarly: boolean };

export async function sendWeeklyOwnerDigests(now: Date = new Date(), options: { deadlineAt?: number } = {}): Promise<WeeklyDigestRun> {
  const week = previousWeek(now);
  const run: WeeklyDigestRun = { week: week.from, pharmacies: 0, sent: 0, skipped: 0, failed: 0, stoppedEarly: false };
  // Lundi, avec rattrapage mardi et mercredi (une tâche manquée) ; jamais en fin de semaine, quand la semaine résumée est loin.
  if (week.weekday > 2) return { ...run, week: null };
  const templateKey = `owner-weekly:${week.from}`;

  const pharmacies = await prisma.pharmacy.findMany({
    where: { isActive: true, isDemo: false, memberships: { some: { role: "OWNER", isActive: true } } },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  const ctx = await platformEmailContext();
  const messaging = getMessagingProvider({ demo: false });

  for (const pharmacy of pharmacies) {
    if (options.deadlineAt && Date.now() > options.deadlineAt) {
      run.stoppedEarly = true;
      break;
    }
    run.pharmacies += 1;
    const already = await prisma.emailDispatch.findFirst({ where: { pharmacyId: pharmacy.id, templateKey, status: { in: ["SENT", "DELIVERED", "DELAYED", "SIMULATED"] } }, select: { id: true } });
    if (already) { run.skipped += 1; continue; }
    const owners = await prisma.membership.findMany({
      where: { pharmacyId: pharmacy.id, role: "OWNER", isActive: true, user: { deletedAt: null, status: "ACTIVE", weeklyDigestOptOutAt: null } },
      select: { user: { select: { id: true, email: true, firstName: true } } },
    });
    if (owners.length === 0) { run.skipped += 1; continue; }

    const figures = await weekFigures(pharmacy.id, now);
    if (!digestHasContent(figures)) { run.skipped += 1; continue; }
    // Le rapport PDF de la semaine, joint : le même que celui de la console. Sans lui (erreur de dessin), l'e-mail part quand même.
    const pdf = figures.advice ? await salesReportPdfFile(pharmacy.id, { param: WEEK_REPORT_PARAM }, now).catch(() => null) : null;

    let delivered = false;
    for (const { user } of owners) {
      const mail = buildWeeklyDigest(
        {
          pharmacyName: pharmacy.name,
          firstName: user.firstName,
          weekLabel: week.label,
          ...figures,
          pdfAttached: pdf !== null,
          links: { results: publicUrl(`/resultats?periode=perso&du=${week.from}&au=${week.to}`), stock: publicUrl("/stock"), challenges: publicUrl("/pilotage"), unsubscribe: weeklyDigestUnsubscribeUrl(user.id) },
        },
        ctx,
      );
      if (!mail) continue;
      const outcome = await messaging
        .sendEmail({ to: user.email, fromName: "PharmaBoost", subject: mail.subject, text: mail.text, html: mail.html, ...(pdf ? { attachments: [{ filename: pdf.fileName, content: pdf.bytes, contentType: "application/pdf" }] } : {}) })
        .catch((error: unknown) => ({ status: "FAILED" as const, provider: messaging.info.id, detail: error instanceof Error ? error.message : "Envoi impossible." }));
      await traceDispatch({ kind: "OWNER_WEEKLY", recipient: user.email, outcome, subject: mail.subject, templateKey, trigger: "AUTOMATIC", pharmacyId: pharmacy.id, userId: user.id });
      if (outcome.status !== "FAILED") delivered = true;
    }
    if (delivered) run.sent += 1;
    else run.failed += 1;
  }
  return run;
}

/** Ce que la page de désinscription montre : le prénom et l'état, sans rien écrire (un antivirus visite les liens). */
export async function peekWeeklyDigest(token: string): Promise<{ firstName: string; subscribed: boolean } | null> {
  const userId = userFromUnsubscribeToken(token);
  if (!userId) return null;
  const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null }, select: { firstName: true, weeklyDigestOptOutAt: true } });
  return user ? { firstName: user.firstName, subscribed: user.weeklyDigestOptOutAt === null } : null;
}
