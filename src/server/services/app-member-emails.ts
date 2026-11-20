import "server-only";
import { prisma } from "@/server/db/client";
import { getMessagingProvider } from "@/server/ai/registry";
import { publicUrl } from "@/server/public-url";
import { decryptField } from "@/server/security/encryption";
import { openToken, sealToken } from "@/server/security/tokens";
import { newsUnsubscribeHeaders } from "@/core/patient-news/email";
import { APP_STORE_REVIEW_URL } from "@/core/patient-app/reviews";
import { buildAppEmail, dueNurture, type AppEmailKind } from "@/core/patient-app/welcome-emails";
import { PATIENT_APP_LIVE } from "@/core/patient-app/offers";
import { DEFAULT_CONTACT_EMAIL } from "@/server/services/site-leads";

/**
 * Le mail de bienvenue et les relances des inscrits de l'appli (fondateur, 20 nov. 2026), et l'alerte « nouvel inscrit »
 * envoyée à PharmaBoost. Chaque envoi est d'abord réservé en base : deux passages simultanés n'envoient jamais deux fois.
 */

const NURTURE_OFF_PURPOSE = "app-nurture-off";
const NURTURE_OFF_TTL_MS = 3 * 365 * 24 * 60 * 60 * 1000;
const APP_STORE_URL = APP_STORE_REVIEW_URL.replace("?action=write-review", "");
/** L'adresse donnée à Apple pour l'examen de l'appli : jamais d'e-mail. */
const REVIEW_EMAIL = "revue-apple@pharmaboost.app";
const BATCH = 300;

export function nurtureOffUrl(memberId: string): string {
  return publicUrl(`/app/relances/desinscription/${sealToken(NURTURE_OFF_PURPOSE, { m: memberId }, NURTURE_OFF_TTL_MS)}`);
}

/** « Ne plus recevoir ces conseils », depuis le lien de l'e-mail. Idempotent. */
export async function turnOffNurture(token: string): Promise<boolean> {
  const payload = openToken<{ m?: unknown }>(NURTURE_OFF_PURPOSE, token);
  if (typeof payload?.m !== "string") return false;
  await prisma.appMember.updateMany({ where: { id: payload.m, nurtureOffAt: null }, data: { nurtureOffAt: new Date() } });
  return true;
}

async function sendKind(member: { id: string; emailCipher: string; pharmacyName: string | null }, kind: AppEmailKind): Promise<boolean> {
  const to = decryptField(member.emailCipher);
  if (!to || to === REVIEW_EMAIL) return false;
  const unsubscribeUrl = nurtureOffUrl(member.id);
  const message = buildAppEmail(kind, { pharmacyName: member.pharmacyName, appUrl: (path) => publicUrl(path), appStoreUrl: APP_STORE_URL, unsubscribeUrl });
  try {
    await getMessagingProvider().sendEmail({ to, fromName: "PharmaBoost", subject: message.subject, text: message.text, html: message.html, headers: newsUnsubscribeHeaders(unsubscribeUrl) });
    return true;
  } catch (error) {
    console.error(`[appli patients] e-mail « ${kind} »`, error);
    return false;
  }
}

const MEMBER_FIELDS = { id: true, emailCipher: true, homePharmacy: { select: { name: true, isActive: true } } } as const;
const pharmacyOf = (row: { homePharmacy: { name: string; isActive: boolean } | null }) => (row.homePharmacy?.isActive ? row.homePharmacy.name : null);

/** Le mail de bienvenue d'un inscrit, une seule fois. */
export async function sendWelcome(memberId: string, now = new Date()): Promise<boolean> {
  if (!PATIENT_APP_LIVE) return false;
  const claimed = await prisma.appMember.updateMany({ where: { id: memberId, welcomeSentAt: null }, data: { welcomeSentAt: now } });
  if (claimed.count === 0) return false;
  const row = await prisma.appMember.findUnique({ where: { id: memberId }, select: MEMBER_FIELDS });
  return row ? sendKind({ id: row.id, emailCipher: row.emailCipher, pharmacyName: pharmacyOf(row) }, "welcome") : false;
}

/** Prévient PharmaBoost qu'une personne vient de créer son espace (adresse masquée, rien d'autre). */
export async function alertNewMember(emailMasked: string, now = new Date()): Promise<void> {
  if (!PATIENT_APP_LIVE) return;
  const total = await prisma.appMember.count();
  const when = now.toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" });
  const text = `Nouvel inscrit dans l'appli PharmaBoost : ${emailMasked} (${when}).\nInscrits au total : ${total}.\n\nLe suivi : ${publicUrl("/admin/appli-patients")}`;
  try {
    await getMessagingProvider().sendEmail({ to: DEFAULT_CONTACT_EMAIL, fromName: "PharmaBoost", subject: `Nouvel inscrit dans l'appli (${total} au total)`, text, html: `<p>${text.replace(/\n/g, "<br>")}</p>` });
  } catch (error) {
    console.error("[appli patients] alerte nouvel inscrit", error);
  }
}

/**
 * Le passage quotidien : les mails de bienvenue restés à envoyer (inscrits d'avant, ou envoi raté), puis les relances dues.
 */
export async function sendDueAppEmails(now = new Date()): Promise<{ welcome: number; nurture: number; failed: number }> {
  const result = { welcome: 0, nurture: 0, failed: 0 };
  if (!PATIENT_APP_LIVE) return result;
  const late = await prisma.appMember.findMany({
    where: { welcomeSentAt: null, createdAt: { lte: new Date(now.getTime() - 10 * 60 * 1000) } },
    orderBy: { createdAt: "asc" },
    take: BATCH,
    select: { id: true },
  });
  for (const row of late) {
    if (await sendWelcome(row.id, now)) result.welcome += 1;
  }
  let cursor: string | undefined;
  let budget = BATCH;
  while (budget > 0) {
    const rows = await prisma.appMember.findMany({
      where: { welcomeSentAt: { not: null, lte: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) }, nurtureOffAt: null },
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: { ...MEMBER_FIELDS, welcomeSentAt: true, nurtureStep: true, nurtureLastAt: true, nurtureOffAt: true },
    });
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    for (const row of rows) {
      if (budget <= 0) break;
      const due = dueNurture(row, now);
      if (!due) continue;
      const claimed = await prisma.appMember.updateMany({ where: { id: row.id, nurtureStep: row.nurtureStep, nurtureOffAt: null }, data: { nurtureStep: due.step, nurtureLastAt: now } });
      if (claimed.count === 0) continue;
      budget -= 1;
      if (await sendKind({ id: row.id, emailCipher: row.emailCipher, pharmacyName: pharmacyOf(row) }, due.kind)) result.nurture += 1;
      else result.failed += 1;
    }
    if (rows.length < 500) break;
  }
  return result;
}

// ---------------------------------------------------------------- Suivi dans la console

export type AppMembersStats = {
  total: number;
  last7: number;
  last30: number;
  withPharmacy: number;
  withReview: number;
  returned: number;
  nurtureOff: number;
  perDay: { day: string; count: number }[];
  latest: { id: string; emailMasked: string; createdAt: Date; pharmacy: string | null; returned: boolean }[];
};

const dayKey = (date: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(date);

export async function getAppMembersStats(now = new Date()): Promise<AppMembersStats> {
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const since7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [total, last7, last30, withPharmacy, reviewers, nurtureOff, recent, latest, seen] = await Promise.all([
    prisma.appMember.count(),
    prisma.appMember.count({ where: { createdAt: { gte: since7 } } }),
    prisma.appMember.count({ where: { createdAt: { gte: since30 } } }),
    prisma.appMember.count({ where: { homePharmacyId: { not: null } } }),
    prisma.patientReview.groupBy({ by: ["appMemberId"], where: { appMemberId: { not: null } } }),
    prisma.appMember.count({ where: { nurtureOffAt: { not: null } } }),
    prisma.appMember.findMany({ where: { createdAt: { gte: since30 } }, select: { createdAt: true }, take: 50000 }),
    prisma.appMember.findMany({ orderBy: { createdAt: "desc" }, take: 30, select: { id: true, emailMasked: true, createdAt: true, lastSeenAt: true, homePharmacy: { select: { name: true } } } }),
    prisma.appMember.findMany({ where: { lastSeenAt: { not: null } }, select: { createdAt: true, lastSeenAt: true }, take: 50000 }),
  ]);
  const DAY = 24 * 60 * 60 * 1000;
  const cameBack = (row: { createdAt: Date; lastSeenAt: Date | null }) => Boolean(row.lastSeenAt && row.lastSeenAt.getTime() - row.createdAt.getTime() > DAY);
  const counts = new Map<string, number>();
  for (const row of recent) counts.set(dayKey(row.createdAt), (counts.get(dayKey(row.createdAt)) ?? 0) + 1);
  const perDay: { day: string; count: number }[] = [];
  for (let i = 29; i >= 0; i -= 1) {
    const key = dayKey(new Date(now.getTime() - i * DAY));
    perDay.push({ day: key, count: counts.get(key) ?? 0 });
  }
  return {
    total,
    last7,
    last30,
    withPharmacy,
    withReview: reviewers.length,
    returned: seen.filter(cameBack).length,
    nurtureOff,
    perDay,
    latest: latest.map((row) => ({ id: row.id, emailMasked: row.emailMasked, createdAt: row.createdAt, pharmacy: row.homePharmacy?.name ?? null, returned: cameBack(row) })),
  };
}
