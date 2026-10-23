import "server-only";
import { prisma } from "@/server/db/client";
import { getMessagingProvider } from "@/server/ai/registry";
import { platformEmailContext } from "@/server/services/email-context";
import { traceDispatch } from "@/server/services/email-dispatch";
import { recordAudit } from "@/server/audit/log";
import { buildLaunchDayEmail } from "@/core/notifications/launch-day";
import { buildTestDayEmail } from "@/core/notifications/test-day";
import { TIME_ZONE } from "@/config/constants";

/**
 * L'e-mail du jour J d'une pharmacie, depuis la console (fondateur, 18 oct. 2026 : « envoyer ce mail de bienvenue pour toutes les
 * nouvelles pharmacies qui commenceront, depuis mon espace admin, en appuyant sur la pharmacie »). Un essai d'abord, à l'adresse de
 * l'administrateur ; puis l'équipe : le titulaire reçoit sa version, chaque collaborateur celle du comptoir. Le lien de la vidéo pointe
 * toujours vers le site en ligne.
 */

export const LAUNCH_DAY_TEMPLATE = "launch-day";
/** La journée test (23 oct. 2026) : « aujourd'hui, toute l'équipe teste PharmaBoost » — un seul e-mail, le même pour tous. */
export const TEST_DAY_TEMPLATE = "test-day";
export type TeamEmailKind = "launch" | "test";
const templateOf = (kind: TeamEmailKind) => (kind === "test" ? TEST_DAY_TEMPLATE : LAUNCH_DAY_TEMPLATE);
const PUBLIC_BASE = "https://pharmaboost.app";

/** « lundi 20 octobre », pour une date du calendrier (AAAA-MM-JJ). */
export function launchDayLabel(isoDay: string): string {
  const date = new Date(`${isoDay}T12:00:00Z`);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: TIME_ZONE }).format(date);
}

/** Le prochain lundi (ou aujourd'hui si c'est lundi), au format AAAA-MM-JJ, à l'heure de Paris. */
export function nextMondayIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", timeZone: TIME_ZONE }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const today = new Date(`${get("year")}-${get("month")}-${get("day")}T12:00:00Z`);
  const shift = (8 - today.getUTCDay()) % 7;
  today.setUTCDate(today.getUTCDate() + shift);
  return today.toISOString().slice(0, 10);
}

export type LaunchDayMember = { membershipId: string; userId: string; name: string; email: string; role: string; owner: boolean };

export async function launchDayState(pharmacyId: string) {
  const [members, dispatches] = await Promise.all([
    prisma.membership.findMany({
      where: { pharmacyId, isActive: true, user: { deletedAt: null, status: "ACTIVE" } },
      orderBy: [{ role: "asc" }, { sortOrder: "asc" }],
      select: { id: true, role: true, user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    }),
    prisma.emailDispatch.findMany({ where: { pharmacyId, templateKey: { in: [LAUNCH_DAY_TEMPLATE, TEST_DAY_TEMPLATE] }, trigger: "MANUAL" }, orderBy: { createdAt: "desc" }, take: 50, select: { recipient: true, status: true, createdAt: true, subject: true } }),
  ]);
  return {
    members: members.map((m): LaunchDayMember => ({ membershipId: m.id, userId: m.user.id, name: `${m.user.firstName} ${m.user.lastName}`.trim(), email: m.user.email, role: m.role, owner: m.role === "OWNER" })),
    sent: dispatches.map((d) => ({ recipient: d.recipient, status: d.status, at: d.createdAt.toISOString(), subject: d.subject ?? "" })),
  };
}

async function deliver(to: string, mail: ReturnType<typeof buildLaunchDayEmail>, trace: { pharmacyId: string; userId?: string; adminId: string; trial: boolean; kind?: TeamEmailKind }) {
  const messaging = getMessagingProvider({ demo: false });
  const outcome = await messaging
    .sendEmail({ to, fromName: "PharmaBoost", subject: mail.subject, text: mail.text, html: mail.html })
    .catch((error: unknown) => ({ status: "FAILED" as const, provider: messaging.info.id, detail: error instanceof Error ? error.message : "Envoi impossible." }));
  await traceDispatch({ kind: "CAMPAIGN", recipient: to, outcome, subject: mail.subject, templateKey: templateOf(trace.kind ?? "launch"), trigger: trace.trial ? "TEST" : "MANUAL", pharmacyId: trace.pharmacyId, userId: trace.userId ?? null, sentByAdminId: trace.adminId });
  return outcome;
}

/**
 * L'essai, à une seule adresse (l'administrateur, ou celle qu'il donne), avec le nom de cette pharmacie : les deux versions du jour J
 * (titulaire, comptoir), ou l'e-mail de la journée test.
 */
export async function sendLaunchDayTrial(input: { pharmacyId: string; day: string; to: string; adminId: string; adminFirstName: string; kind?: TeamEmailKind }) {
  const pharmacy = await prisma.pharmacy.findUniqueOrThrow({ where: { id: input.pharmacyId }, select: { name: true } });
  const ctx = { ...(await platformEmailContext()), baseUrl: PUBLIC_BASE };
  const results = [];
  if (input.kind === "test") {
    const mail = buildTestDayEmail({ firstName: input.adminFirstName, pharmacyName: pharmacy.name, dayLabel: launchDayLabel(input.day) }, ctx);
    results.push(await deliver(input.to, { ...mail, subject: `[Essai] ${mail.subject}` }, { pharmacyId: input.pharmacyId, adminId: input.adminId, trial: true, kind: "test" }));
  } else {
    for (const owner of [true, false]) {
      const mail = buildLaunchDayEmail({ firstName: input.adminFirstName, pharmacyName: pharmacy.name, owner, dayLabel: launchDayLabel(input.day), email: input.to }, ctx);
      results.push(await deliver(input.to, { ...mail, subject: `[Essai — version ${owner ? "titulaire" : "comptoir"}] ${mail.subject}` }, { pharmacyId: input.pharmacyId, adminId: input.adminId, trial: true }));
    }
  }
  return { sent: results.filter((r) => r.status !== "FAILED").length, failed: results.filter((r) => r.status === "FAILED").map((r) => r.detail) };
}

/** L'e-mail du jour J à l'équipe choisie (jamais une pharmacie de démonstration). */
export async function sendLaunchDay(input: { pharmacyId: string; day: string; membershipIds: string[]; adminId: string; kind?: TeamEmailKind }) {
  const pharmacy = await prisma.pharmacy.findUniqueOrThrow({ where: { id: input.pharmacyId }, select: { name: true, isDemo: true } });
  if (pharmacy.isDemo) throw new Error("Pas d'e-mail du jour J pour une pharmacie de démonstration.");
  const { members } = await launchDayState(input.pharmacyId);
  const chosen = members.filter((m) => input.membershipIds.includes(m.membershipId));
  const ctx = { ...(await platformEmailContext()), baseUrl: PUBLIC_BASE };
  let sent = 0;
  const failed: string[] = [];
  for (const m of chosen) {
    const firstName = m.name.split(" ")[0] || m.name;
    const mail = input.kind === "test"
      ? buildTestDayEmail({ firstName, pharmacyName: pharmacy.name, dayLabel: launchDayLabel(input.day) }, ctx)
      : buildLaunchDayEmail({ firstName, pharmacyName: pharmacy.name, owner: m.owner, dayLabel: launchDayLabel(input.day), email: m.email }, ctx);
    const outcome = await deliver(m.email, mail, { pharmacyId: input.pharmacyId, userId: m.userId, adminId: input.adminId, trial: false, kind: input.kind ?? "launch" });
    if (outcome.status === "FAILED") failed.push(`${m.name} : ${outcome.detail}`);
    else sent += 1;
  }
  await recordAudit({ action: "pharmacy.launch_day_email", entityType: "Pharmacy", entityId: input.pharmacyId, pharmacyId: input.pharmacyId, metadata: { day: input.day, kind: input.kind ?? "launch", sent, failed: failed.length, adminId: input.adminId } });
  return { sent, total: chosen.length, failed };
}

/**
 * L'envoi AUTOMATIQUE (fondateur, 18 oct. 2026 : « chaque nouvelle pharmacie doit recevoir le mail de bienvenue automatiquement avec
 * la date du lendemain ») : chaque jour, chaque membre actif d'une pharmacie créée depuis la mise en place (jamais une pharmacie de
 * démonstration, jamais les pharmacies d'avant) qui ne l'a pas encore reçu le reçoit, avec la date de DEMAIN. Un membre ajouté plus
 * tard le reçoit au passage suivant. Une seule fois par personne (journal des e-mails relu avant d'écrire).
 */
export const AUTO_LAUNCH_SINCE = new Date("2026-10-18T00:00:00Z");

export function tomorrowIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TIME_ZONE }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const today = new Date(`${get("year")}-${get("month")}-${get("day")}T12:00:00Z`);
  today.setUTCDate(today.getUTCDate() + 1);
  return today.toISOString().slice(0, 10);
}

export async function sendAutomaticLaunchDays(now: Date = new Date(), options: { deadlineAt?: number } = {}) {
  const day = tomorrowIso(now);
  const run = { day, pharmacies: 0, sent: 0, failed: 0 };
  const pharmacies = await prisma.pharmacy.findMany({ where: { isActive: true, isDemo: false, createdAt: { gte: AUTO_LAUNCH_SINCE } }, select: { id: true, name: true } });
  if (pharmacies.length === 0) return run;
  const ctx = { ...(await platformEmailContext()), baseUrl: PUBLIC_BASE };
  for (const pharmacy of pharmacies) {
    if (options.deadlineAt && Date.now() > options.deadlineAt) break;
    const { members } = await launchDayState(pharmacy.id);
    const done = await prisma.emailDispatch.findMany({ where: { pharmacyId: pharmacy.id, templateKey: LAUNCH_DAY_TEMPLATE, trigger: { in: ["MANUAL", "AUTOMATIC"] }, status: { not: "FAILED" } }, select: { userId: true } });
    const received = new Set(done.map((row) => row.userId));
    const waiting = members.filter((m) => !received.has(m.userId));
    if (waiting.length === 0) continue;
    run.pharmacies += 1;
    for (const m of waiting) {
      const mail = buildLaunchDayEmail({ firstName: m.name.split(" ")[0] || m.name, pharmacyName: pharmacy.name, owner: m.owner, dayLabel: launchDayLabel(day), email: m.email }, ctx);
      const messaging = getMessagingProvider({ demo: false });
      const outcome = await messaging
        .sendEmail({ to: m.email, fromName: "PharmaBoost", subject: mail.subject, text: mail.text, html: mail.html })
        .catch((error: unknown) => ({ status: "FAILED" as const, provider: messaging.info.id, detail: error instanceof Error ? error.message : "Envoi impossible." }));
      await traceDispatch({ kind: "CAMPAIGN", recipient: m.email, outcome, subject: mail.subject, templateKey: LAUNCH_DAY_TEMPLATE, trigger: "AUTOMATIC", pharmacyId: pharmacy.id, userId: m.userId });
      if (outcome.status === "FAILED") run.failed += 1;
      else run.sent += 1;
    }
  }
  return run;
}
