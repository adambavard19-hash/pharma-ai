import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { getMessagingProvider } from "@/server/ai/registry";
import { traceDispatch } from "@/server/services/email-dispatch";
import { platformEmailContext } from "@/server/services/email-context";
import { publicUrl } from "@/server/public-url";
import { encryptField, decryptField } from "@/server/security/encryption";
import { hashEmail, signPayload, verifyPayload } from "@/server/security/tokens";
import { maskEmail } from "@/core/counter/patient-report";
import { CURE_CATEGORIES, CURE_CATEGORY_LABELS, categoryKey, cureDuration, productKey, reminderDate, MAX_CURE_DAYS, MIN_CURE_DAYS, type CureCategory } from "@/core/cure/cure";
import { buildCureReminder } from "@/core/cure/reminder-email";

/**
 * Les rappels de fin de cure (17 oct. 2026). À la fin d'une vente dont le patient a accepté le bilan par e-mail, chaque complément
 * pris en cure qui a été vendu reçoit un rappel, sept jours avant la fin de sa cure (src/core/cure/cure.ts). Le passage du matin
 * (tâche des automatisations) envoie ceux du jour au nom de la pharmacie, puis efface l'adresse. Une désinscription vaut pour
 * toutes les pharmacies et tous les rappels à venir de cette adresse.
 */

const DAY_MS = 86_400_000;
const UNSUBSCRIBE_KIND = "rappel-cure";
/** Un rappel qui n'a pas pu partir dans les deux semaines suivant son jour (tâche arrêtée, incident) n'a plus de sens : il est annulé. */
const STALE_AFTER_MS = 14 * DAY_MS;
const SEND_BATCH = 200;

export type CurePlan = { productId: string; productName: string; days: number; source: "PRODUCT" | "BOX" | "FAMILY"; sendAt: Date };

/** Les rappels qu'une vente appellerait : un par produit en cure vendu (les conseils déclarés vendus). */
export async function planCureReminders(pharmacyId: string, soldRecommendationIds: string[], soldAt: Date): Promise<CurePlan[]> {
  if (soldRecommendationIds.length === 0) return [];
  const [recs, rows] = await Promise.all([
    prisma.recommendation.findMany({ where: { id: { in: soldRecommendationIds }, pharmacyId }, select: { product: { select: { id: true, name: true, category: true, ean: true } } } }),
    prisma.cureDuration.findMany({ select: { key: true, days: true } }),
  ]);
  const plans = new Map<string, CurePlan>();
  for (const { product } of recs) {
    if (!product || plans.has(product.id)) continue;
    const duration = cureDuration({ category: product.category, ean: product.ean, name: product.name }, rows);
    if (!duration) continue;
    plans.set(product.id, { productId: product.id, productName: product.name, days: duration.days, source: duration.source, sendAt: reminderDate(soldAt, duration.days) });
  }
  return [...plans.values()];
}

/** Enregistre les rappels d'une vente, adresse chiffrée. Rien pour une adresse désinscrite. Rend le nombre de rappels programmés. */
export async function scheduleCureReminders(input: { pharmacyId: string; prescriptionId: string; email: string; plans: CurePlan[]; soldAt: Date }): Promise<number> {
  if (input.plans.length === 0) return 0;
  const emailHash = hashEmail(input.email);
  if (await prisma.cureReminderOptOut.findUnique({ where: { emailHash }, select: { emailHash: true } })) return 0;
  const emailEncrypted = encryptField(input.email);
  await prisma.cureReminder.createMany({
    data: input.plans.map((plan) => ({ pharmacyId: input.pharmacyId, prescriptionId: input.prescriptionId, productId: plan.productId, productName: plan.productName.slice(0, 200), durationDays: plan.days, durationSource: plan.source, emailEncrypted, emailHash, soldAt: input.soldAt, sendAt: plan.sendAt })),
  });
  await recordAudit({ action: "cure_reminder.scheduled", entityType: "Prescription", entityId: input.prescriptionId, pharmacyId: input.pharmacyId, metadata: { count: input.plans.length, to: maskEmail(input.email), sources: input.plans.map((plan) => plan.source) } });
  return input.plans.length;
}

/** Une adresse est-elle désinscrite ? Reconnue (empreinte, jamais l'adresse elle-même). */
export async function isOptedOut(email: string): Promise<boolean> {
  return Boolean(await prisma.cureReminderOptOut.findUnique({ where: { emailHash: hashEmail(email) }, select: { emailHash: true } }));
}

export function cureUnsubscribeUrl(emailHash: string): string {
  return publicUrl(`/rappel-cure/${encodeURIComponent(signPayload({ h: emailHash, k: UNSUBSCRIBE_KIND }, 400 * DAY_MS))}`);
}

function hashFromToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const payload = verifyPayload<{ h?: unknown; k?: unknown }>(token);
  return payload && payload.k === UNSUBSCRIBE_KIND && typeof payload.h === "string" && /^[0-9a-f]{64}$/.test(payload.h) ? payload.h : null;
}

/** La page de désinscription : le lien est-il valable, l'adresse déjà désinscrite ? Rien n'est écrit (un antivirus visite les liens). */
export async function peekCureUnsubscribe(token: string): Promise<{ optedOut: boolean } | null> {
  const emailHash = hashFromToken(token);
  if (!emailHash) return null;
  return { optedOut: Boolean(await prisma.cureReminderOptOut.findUnique({ where: { emailHash }, select: { emailHash: true } })) };
}

/** Ne plus recevoir de rappels : tous ceux à venir de cette adresse sont annulés et leurs adresses effacées. */
export async function unsubscribeFromCureReminders(token: string): Promise<boolean> {
  const emailHash = hashFromToken(token);
  if (!emailHash) return false;
  await prisma.cureReminderOptOut.upsert({ where: { emailHash }, create: { emailHash }, update: {} });
  const { count } = await prisma.cureReminder.updateMany({ where: { emailHash, status: "PENDING" }, data: { status: "CANCELLED", emailEncrypted: null } });
  await recordAudit({ action: "cure_reminder.unsubscribed", entityType: "CureReminder", entityId: emailHash.slice(0, 12), metadata: { cancelled: count } });
  return true;
}

export type CureReminderRun = { due: number; sent: number; failed: number; cancelled: number; stoppedEarly: boolean };

/** Le passage du matin : les rappels du jour partent, au nom de la pharmacie ; l'adresse est effacée dans la même écriture. */
export async function sendDueCureReminders(now: Date = new Date(), options: { deadlineAt?: number } = {}): Promise<CureReminderRun> {
  const run: CureReminderRun = { due: 0, sent: 0, failed: 0, cancelled: 0, stoppedEarly: false };
  // Trop anciens (la tâche n'a pas tourné pendant deux semaines) : annulés, adresses effacées.
  const stale = await prisma.cureReminder.updateMany({ where: { status: "PENDING", sendAt: { lt: new Date(now.getTime() - STALE_AFTER_MS) } }, data: { status: "CANCELLED", emailEncrypted: null } });
  run.cancelled += stale.count;
  const due = await prisma.cureReminder.findMany({
    where: { status: "PENDING", sendAt: { lte: now } },
    orderBy: { sendAt: "asc" },
    take: SEND_BATCH,
    select: { id: true, pharmacyId: true, productName: true, emailEncrypted: true, emailHash: true, pharmacy: { select: { name: true, isDemo: true, isActive: true, phone: true, addressLine1: true, addressLine2: true, postalCode: true, city: true } } },
  });
  run.due = due.length;
  if (due.length === 0) return run;
  const ctx = await platformEmailContext();
  const optedOut = new Set((await prisma.cureReminderOptOut.findMany({ where: { emailHash: { in: [...new Set(due.map((row) => row.emailHash))] } }, select: { emailHash: true } })).map((row) => row.emailHash));
  for (const reminder of due) {
    if (options.deadlineAt && Date.now() > options.deadlineAt) {
      run.stoppedEarly = true;
      break;
    }
    const email = decryptField(reminder.emailEncrypted);
    // Désinscrit entre-temps, adresse illisible, ou pharmacie qui n'est plus cliente : rien ne part.
    if (!email || optedOut.has(reminder.emailHash) || !reminder.pharmacy.isActive) {
      await prisma.cureReminder.update({ where: { id: reminder.id }, data: { status: "CANCELLED", emailEncrypted: null } });
      run.cancelled += 1;
      continue;
    }
    const mail = buildCureReminder({ pharmacy: reminder.pharmacy, productName: reminder.productName, unsubscribeUrl: cureUnsubscribeUrl(reminder.emailHash) }, ctx);
    const messaging = getMessagingProvider({ demo: reminder.pharmacy.isDemo });
    const outcome = await messaging
      .sendEmail({ to: email, fromName: reminder.pharmacy.name || "PharmaBoost", subject: mail.subject, text: mail.text, html: mail.html })
      .catch((error: unknown) => ({ status: "FAILED" as const, provider: messaging.info.id, detail: error instanceof Error ? error.message : "Envoi impossible." }));
    const sent = outcome.status !== "FAILED";
    await prisma.cureReminder.update({ where: { id: reminder.id }, data: { status: sent ? "SENT" : "FAILED", sentAt: sent ? now : null, emailEncrypted: null } });
    await traceDispatch({ kind: "CURE_REMINDER", recipient: maskEmail(email), outcome, subject: mail.subject, trigger: "AUTOMATIC", pharmacyId: reminder.pharmacyId });
    if (sent) run.sent += 1;
    else run.failed += 1;
  }
  return run;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Les durées de cure (console)                                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */

export type CureDurationView = { key: string; label: string; days: number; updatedByName: string | null; updatedAt: Date };

export async function listCureDurations(): Promise<{ families: { category: CureCategory; label: string; days: number | null }[]; products: CureDurationView[] }> {
  const rows = await prisma.cureDuration.findMany({ orderBy: { label: "asc" } });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  return {
    families: CURE_CATEGORIES.map((category) => ({ category, label: CURE_CATEGORY_LABELS[category], days: byKey.get(categoryKey(category))?.days ?? null })),
    products: rows.filter((row) => row.key.startsWith("EAN:")),
  };
}

export type CureDurationInput = { kind: "family"; category: string; days: number | null } | { kind: "product"; ean: string; label: string; days: number | null };

/** Règle (ou retire, avec `days: null`) une durée de cure. 0 pour un produit : « jamais de rappel pour lui ». */
export async function saveCureDuration(admin: { fullName: string }, input: CureDurationInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const days = input.days;
  if (days !== null && (!Number.isInteger(days) || (days !== 0 && (days < MIN_CURE_DAYS || days > MAX_CURE_DAYS)) || (days === 0 && input.kind === "family"))) {
    return { ok: false, error: `Une durée de cure va de ${MIN_CURE_DAYS} à ${MAX_CURE_DAYS} jours${input.kind === "product" ? " (0 : jamais de rappel pour ce produit)" : ""}.` };
  }
  let key: string;
  let label: string;
  if (input.kind === "family") {
    const category = CURE_CATEGORIES.find((entry) => entry === input.category);
    if (!category) return { ok: false, error: "Famille inconnue." };
    key = categoryKey(category);
    label = CURE_CATEGORY_LABELS[category];
  } else {
    const ean = input.ean.replace(/\D/g, "");
    if (ean.length < 8 || ean.length > 14) return { ok: false, error: "Code-barres illisible (8 à 14 chiffres)." };
    key = productKey(ean);
    label = input.label.replace(/\s+/g, " ").trim().slice(0, 120) || ean;
  }
  if (days === null) await prisma.cureDuration.deleteMany({ where: { key } });
  else await prisma.cureDuration.upsert({ where: { key }, create: { key, label, days, updatedByName: admin.fullName }, update: { label, days, updatedByName: admin.fullName } });
  await recordAudit({ action: "cure_duration.saved", entityType: "CureDuration", entityId: key, metadata: { days, label, by: admin.fullName } });
  return { ok: true };
}
