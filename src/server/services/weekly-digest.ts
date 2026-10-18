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
import { buildDailyDigest, digestHasContent } from "@/core/notifications/weekly-digest";
import { TIME_ZONE } from "@/config/constants";

/**
 * Le bilan de la semaine (fondateur, 18 oct. 2026 : « toutes les semaines, le dimanche ») : chaque DIMANCHE matin, la semaine qui
 * s'achève (du lundi à ce dimanche matin, à Paris). La tâche passe chaque jour ; les autres jours, rien ne part.
 * - chaque titulaire reçoit toute son officine, avec le PDF de la semaine ;
 * - chaque membre de l'équipe reçoit SEULEMENT ses propres ventes (celles qu'il a faites, ou de son comptoir attribué), avec son PDF.
 * Une semaine sans conseil proposé n'envoie rien. Une fois par semaine et par destinataire (journal des e-mails relu avant d'écrire) ;
 * chaque officine ne voit que ses propres chiffres. Désinscription par le lien de l'e-mail. Lancé par la tâche quotidienne (CRON_SECRET).
 */

const DAY_MS = 86_400_000;
const UNSUBSCRIBE_TTL_MS = 400 * DAY_MS;
const UNSUBSCRIBE_KIND = "resume-hebdo";

/**
 * La semaine qui s'achève, vue de `now` à Paris : son lundi (« 2026-10-12 »), « du lundi 12 au dimanche 18 octobre », et si l'on est
 * dimanche — le jour de l'envoi. Un autre jour, c'est la semaine en cours (son lundi), pour un essai.
 */
export function previousWeek(now: Date, timeZone = TIME_ZONE): { monday: string; label: string; isSunday: boolean } {
  const today = zonedDateParts(now, timeZone);
  const date = new Date(Date.UTC(today.year, today.month - 1, today.day, 12));
  const weekday = date.getUTCDay();
  const monday = new Date(date.getTime() - ((weekday + 6) % 7) * DAY_MS);
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);
  const fmt = (d: Date, withMonth: boolean) => new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", ...(withMonth ? { month: "long" } : {}) }).format(d);
  const sameMonth = monday.getUTCMonth() === sunday.getUTCMonth();
  return { monday: monday.toISOString().slice(0, 10), label: `du ${fmt(monday, !sameMonth)} au ${fmt(sunday, true)}`, isSunday: weekday === 0 };
}

/** La veille de `now` à Paris : « 2026-10-15 » (la période des rapports et du PDF) et « jeudi 15 octobre ». */
export function previousDay(now: Date, timeZone = TIME_ZONE): { day: string; label: string } {
  const today = zonedDateParts(now, timeZone);
  const yesterday = new Date(Date.UTC(today.year, today.month - 1, today.day - 1, 12));
  return { day: yesterday.toISOString().slice(0, 10), label: new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(yesterday) };
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

type Person = { id: string; email: string; firstName: string; lastName: string | null };
type OnlyFor = { userId: string; postIds: string[] };

/** Les chiffres d'UNE officine (ou d'UN de ses membres) pour la période (« semaine-derniere ») : rien d'une autre (lecture filtrée sur son identifiant). */
export async function dayFigures(pharmacyId: string, day: string, now: Date, onlyFor?: OnlyFor) {
  const range = resolveReportRange(day, now, TIME_ZONE);
  const report = await loadSalesReport({ pharmacyId, range, now, onlyFor });
  return report.sales === 0 ? null : { sales: report.sales, proposed: report.proposed, sold: report.sold, revenueTtcCents: report.revenueCents };
}

/** Ce que le titulaire voit en plus : le stock à surveiller et les challenges en cours. */
async function ownerExtras(pharmacyId: string, now: Date) {
  const today = zonedDateParts(now, TIME_ZONE);
  const todayDate = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const [challenges, out, low, outNames] = await Promise.all([
    prisma.labChallenge.findMany({ where: { pharmacyId, status: "ACTIVE", startsAt: { lte: todayDate }, endsAt: { gte: todayDate } }, orderBy: { endsAt: "asc" }, take: 5, select: { title: true, endsAt: true } }),
    prisma.stockItem.count({ where: { pharmacyId, quantity: { lte: 0 }, product: { isActive: true, deletedAt: null } } }),
    prisma.stockItem.count({ where: { pharmacyId, quantity: { gt: 0, lte: prisma.stockItem.fields.alertThreshold }, product: { isActive: true, deletedAt: null } } }),
    prisma.stockItem.findMany({ where: { pharmacyId, quantity: { lte: 0 }, product: { isActive: true, deletedAt: null } }, take: 5, orderBy: { updatedAt: "desc" }, select: { product: { select: { name: true } } } }),
  ]);
  const endsLabel = (date: Date) => `jusqu'au ${new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "short" }).format(date)}`;
  return {
    challenges: challenges.map((challenge) => ({ title: challenge.title, endsLabel: endsLabel(challenge.endsAt) })),
    stock: { out, low, outNames: outNames.map((row) => row.product.name.replace(/,.*$/, "").trim()) },
  };
}

const SENT_STATUSES = ["SENT", "DELIVERED", "DELAYED", "SIMULATED"] as const;

export type DailyDigestRun = { day: string; pharmacies: number; sent: number; skipped: number; failed: number; stoppedEarly: boolean; notSunday?: boolean };

/** Le bilan de la semaine, le dimanche seulement (`force` : un autre jour, pour un essai). */
export async function sendDailyDigests(now: Date = new Date(), options: { deadlineAt?: number; force?: boolean } = {}): Promise<DailyDigestRun> {
  const { monday, label, isSunday } = previousWeek(now);
  const day = monday;
  // Du lundi à ce dimanche matin : la semaine qui s'achève.
  const period = "semaine-en-cours";
  const run: DailyDigestRun = { day, pharmacies: 0, sent: 0, skipped: 0, failed: 0, stoppedEarly: false };
  if (!isSunday && !options.force) return { ...run, notSunday: true };
  const ownerKey = `owner-weekly:${day}`;
  const memberKey = `member-weekly:${day}`;
  const pharmacies = await prisma.pharmacy.findMany({ where: { isActive: true, isDemo: false }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } });
  const ctx = await platformEmailContext();
  const messaging = getMessagingProvider({ demo: false });
  const dayFile = (fileName: string, who: string) => fileName.replace(/-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.pdf$/, `-${who}-${day}.pdf`);

  const send = async (input: { person: Person; pharmacyId: string; templateKey: string; mail: NonNullable<ReturnType<typeof buildDailyDigest>>; pdf: { bytes: Uint8Array; fileName: string } | null }) => {
    const outcome = await messaging
      .sendEmail({
        to: input.person.email,
        fromName: "PharmaBoost",
        subject: input.mail.subject,
        text: input.mail.text,
        html: input.mail.html,
        ...(input.pdf ? { attachments: [{ filename: input.pdf.fileName, content: input.pdf.bytes, contentType: "application/pdf" }] } : {}),
      })
      .catch((error: unknown) => ({ status: "FAILED" as const, provider: messaging.info.id, detail: error instanceof Error ? error.message : "Envoi impossible." }));
    await traceDispatch({ kind: "OWNER_WEEKLY", recipient: input.person.email, outcome, subject: input.mail.subject, templateKey: input.templateKey, trigger: "AUTOMATIC", pharmacyId: input.pharmacyId, userId: input.person.id });
    return outcome.status !== "FAILED";
  };

  for (const pharmacy of pharmacies) {
    if (options.deadlineAt && Date.now() > options.deadlineAt) {
      run.stoppedEarly = true;
      break;
    }
    run.pharmacies += 1;
    const memberships = await prisma.membership.findMany({
      where: { pharmacyId: pharmacy.id, isActive: true, user: { deletedAt: null, status: "ACTIVE", weeklyDigestOptOutAt: null } },
      select: { role: true, user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
    const owners = memberships.filter((membership) => membership.role === "OWNER").map((membership) => membership.user);
    const ownerIds = new Set(owners.map((owner) => owner.id));
    const members = memberships.filter((membership) => membership.role !== "OWNER" && !ownerIds.has(membership.user.id)).map((membership) => membership.user);

    // 1. Le titulaire : toute l'officine.
    const pharmacyAdvice = owners.length ? await dayFigures(pharmacy.id, period, now) : null;
    if (owners.length && pharmacyAdvice && digestHasContent({ advice: pharmacyAdvice })) {
      const already = await prisma.emailDispatch.findFirst({ where: { pharmacyId: pharmacy.id, templateKey: ownerKey, status: { in: [...SENT_STATUSES] } }, select: { id: true } });
      if (already) run.skipped += 1;
      else {
        const extras = await ownerExtras(pharmacy.id, now);
        const pdf = await salesReportPdfFile(pharmacy.id, { param: period }, now).catch(() => null);
        const file = pdf ? { bytes: pdf.bytes, fileName: dayFile(pdf.fileName, "officine") } : null;
        let delivered = false;
        for (const owner of owners) {
          const mail = buildDailyDigest(
            { audience: "owner", pharmacyName: pharmacy.name, firstName: owner.firstName, dayLabel: label, advice: pharmacyAdvice, pdfAttached: file !== null, ...extras, links: { results: publicUrl("/resultats"), stock: publicUrl("/stock"), unsubscribe: weeklyDigestUnsubscribeUrl(owner.id) } },
            ctx,
          );
          if (mail && (await send({ person: owner, pharmacyId: pharmacy.id, templateKey: ownerKey, mail, pdf: file }))) delivered = true;
        }
        if (delivered) run.sent += 1;
        else run.failed += 1;
      }
    }

    // 2. Chaque membre de l'équipe : SEULEMENT ses ventes (les siennes, ou celles du comptoir qui lui est attribué).
    if (members.length === 0 || (owners.length > 0 && !pharmacyAdvice)) continue;
    const posts = await prisma.counterPost.findMany({ where: { pharmacyId: pharmacy.id, revokedAt: null, assignedUserId: { in: members.map((member) => member.id) } }, select: { id: true, assignedUserId: true } });
    for (const member of members) {
      if (options.deadlineAt && Date.now() > options.deadlineAt) {
        run.stoppedEarly = true;
        break;
      }
      const onlyFor: OnlyFor = { userId: member.id, postIds: posts.filter((post) => post.assignedUserId === member.id).map((post) => post.id) };
      const advice = await dayFigures(pharmacy.id, period, now, onlyFor);
      if (!advice || !digestHasContent({ advice })) continue;
      const already = await prisma.emailDispatch.findFirst({ where: { pharmacyId: pharmacy.id, userId: member.id, templateKey: memberKey, status: { in: [...SENT_STATUSES] } }, select: { id: true } });
      if (already) { run.skipped += 1; continue; }
      const person = [member.firstName, member.lastName].filter(Boolean).join(" ");
      const pdf = await salesReportPdfFile(pharmacy.id, { param: period }, now, { onlyFor, person }).catch(() => null);
      const file = pdf ? { bytes: pdf.bytes, fileName: dayFile(pdf.fileName, "mes-ventes") } : null;
      const mail = buildDailyDigest(
        { audience: "member", pharmacyName: pharmacy.name, firstName: member.firstName, dayLabel: label, advice, pdfAttached: file !== null, links: { results: publicUrl("/historique"), stock: publicUrl("/stock"), unsubscribe: weeklyDigestUnsubscribeUrl(member.id) } },
        ctx,
      );
      if (!mail) continue;
      if (await send({ person: member, pharmacyId: pharmacy.id, templateKey: memberKey, mail, pdf: file })) run.sent += 1;
      else run.failed += 1;
    }
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
