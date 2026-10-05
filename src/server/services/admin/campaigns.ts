import "server-only";
import { prisma } from "@/server/db/client";
import type { CampaignStatus, Prisma } from "@/generated/prisma";
import { recordAudit, type AuditAction } from "@/server/audit/log";
import { getMessagingProvider } from "@/server/ai/registry";
import { publicUrl } from "@/server/public-url";
import { hashEmail, maskEmail, signPayload, verifyPayload } from "@/server/security/tokens";
import { traceDispatch } from "@/server/services/email-dispatch";
import { platformEmailContext } from "@/server/services/email-context";
import { createNotification } from "@/server/services/notifications";
import { notifyAdmins } from "@/server/services/sales/notifications";
import { endReferralOffer, startReferralOffer } from "@/server/services/referral-offers";
import {
  CAMPAIGN_AUDIENCES,
  CAMPAIGN_KIND_KEYS,
  CAMPAIGN_MAX_RECIPIENTS,
  campaignParagraphs,
  campaignValues,
  describeSchedule,
  renderCampaignEmail,
  sampleCampaignValues,
  validateCampaignDraft,
  validateScheduleDate,
  type AudienceKey,
  type CampaignDraftInput,
  type CampaignKindKey,
  type CampaignSide,
} from "@/core/admin/campaigns";
import { formatEuros, formatFrenchDate } from "@/core/billing/subscription";
import { calendarDay, zonedDayStart } from "@/core/challenges/dates";
import type { EmailContext } from "@/core/platform/email-layout";
import type { MessagingProvider } from "@/core/ai/ports";
import { PUBLIC_CONTACT_EMAIL } from "@/config/contact";
import { TIME_ZONE } from "@/config/constants";
import { recipientValues, resolveAudience, type AudienceRecipient, type ResolvedAudience } from "./campaign-audience";

/**
 * Les campagnes de la console : le brouillon, l'envoi, la programmation.
 *
 * Rien ne part sans un envoi confirmé, et rien ne part deux fois. L'ordre des
 * écritures est le garde-fou :
 *   1. le passage à « en cours d'envoi » est une mise à jour CONDITIONNELLE
 *      (statut ET date de modification lus) : deux clics, ou le cron et un
 *      clic, ne démarrent pas deux envois, et un brouillon modifié entre-temps
 *      ne part pas avec un nombre confirmé pour une autre version ;
 *   2. les destinataires sont figés dans `CampaignRecipient` (clé unique :
 *      une adresse = un message) AVANT le premier envoi ;
 *   3. chaque destinataire est réservé (PENDING → SENDING, conditionnel)
 *      AVANT l'envoi : un destinataire que deux passages se disputent n'est
 *      écrit qu'une fois. Un passage interrompu laisse une ligne « en cours »
 *      que la reprise marque en échec « à vérifier », jamais un second envoi.
 *
 * Un brouillon ne contacte personne. Sans messagerie configurée, l'envoi est
 * simulé et le dit partout (statut SIMULATED, `simulated` sur la campagne).
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Des envois en parallèle, par lots : assez pour aller vite, pas assez pour saturer le prestataire. */
const BATCH_SIZE = 5;
/** Le temps d'un envoi lancé depuis la console (la route de la console s'arrête à 60 s). */
const INTERACTIVE_BUDGET_MS = 45_000;
/** Le temps pris sur le passage quotidien : les relances automatiques et les annonces patients y ont leur part. */
const CRON_BUDGET_MS = 30_000;
/** Une campagne « en cours » sans mouvement depuis ce délai est restée en plan. */
const STALE_MS = 5 * 60 * 1000;
const PAGE_SIZE = 20;
const RECIPIENT_PAGE_SIZE = 50;

const OPT_OUT_PURPOSE = "offers-optout";
const OPT_OUT_PATH = "/offres/desinscription";
const OPT_OUT_TTL_MS = 3 * 365 * DAY_MS;

export const SKIP_OPTED_OUT = "Désinscrit des offres";
export const SKIP_CANCELED = "Campagne annulée";
export const FAIL_INTERRUPTED = "Interrompu pendant l'envoi : le message est peut-être parti, vérifiez avant de renvoyer.";

const CAMPAIGN_STATUSES: CampaignStatus[] = ["DRAFT", "SCHEDULED", "SENDING", "SENT", "CANCELED"];
const NOT_STARTABLE: Record<string, string> = {
  SENDING: "Cette campagne est déjà en cours d'envoi.",
  SENT: "Cette campagne a déjà été envoyée.",
  CANCELED: "Cette campagne a été annulée.",
};

const EYEBROWS: Record<CampaignSide, string> = { PHARMACY: "PharmaBoost", PARTNER: "PharmaBoost Partenaires" };
const REASONS: Record<CampaignSide, string> = {
  PHARMACY: "Vous recevez ce message parce que votre officine a un espace PharmaBoost.",
  PARTNER: "Vous recevez ce message parce que vous êtes en contact avec PharmaBoost Partenaires.",
};

// ---------------------------------------------------------------- Lecture

export type CampaignSummary = {
  id: string;
  kind: CampaignKindKey;
  name: string;
  status: CampaignStatus;
  audience: string;
  subject: string;
  /** Les destinataires à contacter : le nombre confirmé (programmée) ou figé (envoyée). Les ignorés n'y sont pas. */
  recipientCount: number;
  /** Envoyés ou simulés : voir `simulated`. */
  sentCount: number;
  failedCount: number;
  /** Ignorés : désinscrits, ou jamais envoyés (campagne annulée). Comptés à part. */
  skippedCount: number;
  /** Au moins un envoi simulé : la messagerie n'était pas configurée, ces « envoyés » ne sont pas partis. */
  simulated: boolean;
  scheduledFor: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  offerAmountCents: number | null;
  createdAt: Date;
};

const SUMMARY_SELECT = {
  id: true,
  kind: true,
  name: true,
  status: true,
  audience: true,
  subject: true,
  recipientCount: true,
  sentCount: true,
  failedCount: true,
  skippedCount: true,
  simulated: true,
  scheduledFor: true,
  startedAt: true,
  completedAt: true,
  offerAmountCents: true,
  createdAt: true,
} as const;

const FULL_SELECT = {
  ...SUMMARY_SELECT,
  title: true,
  body: true,
  buttonLabel: true,
  buttonTarget: true,
  audienceParams: true,
  alsoInApp: true,
  offerEndsAt: true,
  offerConditions: true,
  canceledAt: true,
  createdByAdminId: true,
  updatedAt: true,
} as const;

const loadRow = (id: string) => prisma.campaign.findUnique({ where: { id }, select: FULL_SELECT });
type CampaignRow = NonNullable<Awaited<ReturnType<typeof loadRow>>>;

const isCampaignStatus = (value: unknown): value is CampaignStatus => typeof value === "string" && (CAMPAIGN_STATUSES as string[]).includes(value);
const isCampaignKind = (value: unknown): value is CampaignKindKey => typeof value === "string" && (CAMPAIGN_KIND_KEYS as string[]).includes(value);

/** Les compteurs par statut, zéros compris : un zéro ici est un vrai zéro. */
function countsByStatus(groups: { status: string; _count: { _all: number } }[], known: readonly string[]): Record<string, number> {
  const counts = Object.fromEntries(known.map((status) => [status, 0]));
  for (const group of groups) counts[group.status] = group._count._all;
  return counts;
}

export async function listCampaigns(filters: { status?: string; kind?: string; page?: number }): Promise<{ rows: CampaignSummary[]; total: number; counts: Record<string, number> }> {
  const status = isCampaignStatus(filters.status) ? filters.status : undefined;
  const kind = isCampaignKind(filters.kind) ? filters.kind : undefined;
  const page = Number.isFinite(filters.page) ? Math.max(1, Math.floor(filters.page as number)) : 1;
  const where = { ...(status ? { status } : {}), ...(kind ? { kind } : {}) };
  const [rows, total, groups] = await Promise.all([
    prisma.campaign.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, select: SUMMARY_SELECT }),
    prisma.campaign.count({ where }),
    // Les pastilles de statut comptent dans le type choisi, pas dans le statut choisi.
    prisma.campaign.groupBy({ by: ["status"], where: kind ? { kind } : {}, _count: { _all: true } }),
  ]);
  return { rows, total, counts: countsByStatus(groups, CAMPAIGN_STATUSES) };
}

export type CampaignDetail = CampaignSummary & {
  title: string;
  body: string;
  buttonLabel: string | null;
  buttonTarget: string | null;
  audienceParams: unknown;
  alsoInApp: boolean;
  offerEndsAt: Date | null;
  offerConditions: string | null;
  canceledAt: Date | null;
  referralOffer: { id: string; amountCents: number; startsAt: Date; endsAt: Date | null; canceledAt: Date | null } | null;
};

export async function loadCampaign(id: string): Promise<CampaignDetail | null> {
  const row = await loadRow(id);
  if (!row) return null;
  const referralOffer = await prisma.referralOffer.findUnique({ where: { campaignId: id }, select: { id: true, amountCents: true, startsAt: true, endsAt: true, canceledAt: true } });
  return { ...row, referralOffer };
}

const RECIPIENT_STATUSES = ["PENDING", "SENDING", "SENT", "SIMULATED", "FAILED", "SKIPPED"] as const;

export async function listCampaignRecipients(
  id: string,
  filters: { status?: string; page?: number },
): Promise<{ rows: { id: string; name: string | null; email: string; status: string; detail: string | null; sentAt: Date | null }[]; total: number; counts: Record<string, number> }> {
  const status = (RECIPIENT_STATUSES as readonly string[]).includes(filters.status ?? "") ? filters.status : undefined;
  const page = Number.isFinite(filters.page) ? Math.max(1, Math.floor(filters.page as number)) : 1;
  const where = { campaignId: id, ...(status ? { status } : {}) };
  const [rows, total, groups] = await Promise.all([
    prisma.campaignRecipient.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (page - 1) * RECIPIENT_PAGE_SIZE, take: RECIPIENT_PAGE_SIZE, select: { id: true, name: true, email: true, status: true, detail: true, sentAt: true } }),
    prisma.campaignRecipient.count({ where }),
    prisma.campaignRecipient.groupBy({ by: ["status"], where: { campaignId: id }, _count: { _all: true } }),
  ]);
  return { rows, total, counts: countsByStatus(groups, RECIPIENT_STATUSES) };
}

// ---------------------------------------------------------------- Audit

const DRAFT_FIELDS = ["kind", "name", "subject", "title", "body", "buttonLabel", "buttonTarget", "audience", "audienceParams", "alsoInApp", "offerAmountCents", "offerEndsAt", "offerConditions"] as const;

/** Un champ du brouillon tel que le journal le garde : une date en texte, un vide en `null`. */
const loggable = (value: unknown) => (value instanceof Date ? value.toISOString() : (value ?? null));

/** L'avant et l'après d'une modification : seulement les champs qui changent. */
function draftChanges(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changed = DRAFT_FIELDS.filter((field) => JSON.stringify(loggable(before[field])) !== JSON.stringify(loggable(after[field])));
  return {
    changed,
    before: Object.fromEntries(changed.map((field) => [field, loggable(before[field])])),
    after: Object.fromEntries(changed.map((field) => [field, loggable(after[field])])),
  };
}

type StateLike = Pick<CampaignRow, "status" | "scheduledFor" | "recipientCount" | "sentCount" | "failedCount" | "skippedCount" | "simulated">;

/** L'état d'une campagne au journal : le statut et les compteurs. */
const stateOf = (row: StateLike) => ({
  status: row.status,
  scheduledFor: row.scheduledFor?.toISOString() ?? null,
  recipientCount: row.recipientCount,
  sentCount: row.sentCount,
  failedCount: row.failedCount,
  skippedCount: row.skippedCount,
  simulated: row.simulated,
});

function auditCampaign(action: AuditAction, id: string | null, adminId: string | null, metadata: Record<string, unknown>) {
  return recordAudit({ action, entityType: "Campaign", entityId: id, platformAdminId: adminId, metadata });
}

const fail = (error: string) => ({ ok: false as const, error });
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

// ---------------------------------------------------------------- Brouillon

function draftFromRow(row: CampaignRow): Record<string, unknown> {
  return {
    kind: row.kind,
    name: row.name,
    subject: row.subject,
    title: row.title,
    body: row.body,
    buttonLabel: row.buttonLabel,
    buttonTarget: row.buttonTarget,
    audience: row.audience,
    audienceParams: row.audienceParams,
    alsoInApp: row.alsoInApp,
    offerAmountCents: row.offerAmountCents,
    offerEndsAt: row.offerEndsAt,
    offerConditions: row.offerConditions,
  };
}

const dataOf = (draft: CampaignDraftInput) => ({
  kind: draft.kind,
  name: draft.name,
  subject: draft.subject,
  title: draft.title,
  body: draft.body,
  buttonLabel: draft.buttonLabel,
  buttonTarget: draft.buttonTarget,
  audience: draft.audience,
  audienceParams: draft.audienceParams as Prisma.InputJsonValue,
  alsoInApp: draft.alsoInApp,
  offerAmountCents: draft.offerAmountCents,
  offerEndsAt: draft.offerEndsAt,
  offerConditions: draft.offerConditions,
});

export async function createCampaign(input: CampaignDraftInput, adminId: string): Promise<{ id: string }> {
  const checked = validateCampaignDraft(input);
  if (!checked.ok) throw new Error(`Brouillon invalide : ${checked.error}`);
  const row = await prisma.campaign.create({ select: { id: true }, data: { ...dataOf(checked.value), status: "DRAFT", createdByAdminId: adminId } });
  await auditCampaign("campaign.created", row.id, adminId, { before: null, after: { status: "DRAFT", ...draftChanges({}, checked.value).after } });
  return row;
}

/**
 * Modifie un brouillon, ou une campagne programmée. Modifier une campagne
 * programmée la RAMÈNE au brouillon : la confirmation (mot retapé, nombre de
 * destinataires) portait sur l'ancienne version, pas sur celle-ci.
 */
export async function updateCampaign(id: string, input: CampaignDraftInput, adminId: string): Promise<{ ok: true; backToDraft: boolean } | { ok: false; error: string }> {
  const checked = validateCampaignDraft(input);
  if (!checked.ok) return fail(checked.error);
  const current = await loadRow(id);
  if (!current) return fail("Campagne introuvable.");
  if (current.status !== "DRAFT" && current.status !== "SCHEDULED") return fail("Seul un brouillon, ou une campagne programmée, se modifie.");
  const changes = draftChanges(draftFromRow(current), checked.value);
  const backToDraft = current.status === "SCHEDULED";
  if (changes.changed.length === 0 && !backToDraft) return { ok: true, backToDraft: false };
  const updated = await prisma.campaign.updateMany({
    // Statut et date de modification lus : un envoi démarré entre-temps n'est jamais écrasé.
    where: { id, status: current.status, updatedAt: current.updatedAt },
    data: { ...dataOf(checked.value), ...(backToDraft ? { status: "DRAFT", scheduledFor: null, recipientCount: 0 } : {}) },
  });
  if (updated.count !== 1) return fail("La campagne vient de changer (envoi ou autre modification) : rechargez la page.");
  await auditCampaign("campaign.updated", id, adminId, {
    before: { ...(backToDraft ? { status: "SCHEDULED", scheduledFor: current.scheduledFor?.toISOString() ?? null } : {}), ...changes.before },
    after: { ...(backToDraft ? { status: "DRAFT", scheduledFor: null } : {}), ...changes.after },
    changedFields: changes.changed,
    backToDraft,
  });
  return { ok: true, backToDraft };
}

export async function deleteDraftCampaign(id: string, adminId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await loadRow(id);
  if (!current) return fail("Campagne introuvable.");
  if (current.status !== "DRAFT") return fail("Seul un brouillon se supprime.");
  const deleted = await prisma.campaign.deleteMany({ where: { id, status: "DRAFT" } });
  if (deleted.count !== 1) return fail("La campagne vient de changer : rechargez la page.");
  await auditCampaign("campaign.deleted", id, adminId, { before: { name: current.name, kind: current.kind, subject: current.subject, status: "DRAFT" }, after: null });
  return { ok: true };
}

// ---------------------------------------------------------------- Aperçu et test

export async function previewAudience(audience: AudienceKey, params: CampaignDraftInput["audienceParams"]): Promise<{ count: number; excluded: { optedOut: number; noEmail: number; duplicates: number }; sample: { name: string; emailMasked: string }[] }> {
  const resolved = await resolveAudience(audience, params);
  return { count: resolved.recipients.length, excluded: resolved.excluded, sample: resolved.recipients.slice(0, 5).map((r) => ({ name: r.name ?? "", emailMasked: maskEmail(r.email) })) };
}

/** Où mène le bouton : une destination connue, jamais une adresse saisie. */
function buttonUrlFor(target: string | null): string | null {
  if (target === "espace" || target === "parrainage") return publicUrl("/parametres?onglet=abonnement");
  if (target === "candidature") return publicUrl("/decouvrir/partenaires");
  return null;
}

/** Le message avec les valeurs d'exemple d'un côté (l'offre, elle, est réelle) : ce que montrent l'aperçu et l'essai. */
async function renderSample(draft: CampaignDraftInput, unsubscribeUrl: string, subject: string): Promise<{ subject: string; text: string; html: string }> {
  const side = CAMPAIGN_AUDIENCES[draft.audience].side;
  return renderCampaignEmail({ ...draft, subject }, sampleCampaignValues(side, draft), {
    context: await platformEmailContext(),
    buttonUrl: buttonUrlFor(draft.buttonTarget),
    unsubscribeUrl,
    eyebrow: EYEBROWS[side],
    reason: REASONS[side],
  });
}

/** L'aperçu du message d'un brouillon valide. Le lien de désinscription y est un exemple, pas un jeton. */
export async function previewCampaignEmail(draft: CampaignDraftInput): Promise<{ subject: string; text: string; html: string }> {
  return renderSample(draft, publicUrl(`${OPT_OUT_PATH}/apercu`), draft.subject);
}

/**
 * Le message d'essai : valeurs d'exemple, objet préfixé « [TEST] », envoyé
 * UNIQUEMENT à l'adresse de l'administrateur connecté. Jamais une adresse
 * saisie : un test ne peut pas servir à écrire à quelqu'un.
 */
export async function sendCampaignTest(draft: CampaignDraftInput, adminId: string, adminEmail: string): Promise<{ status: string; detail: string }> {
  const checked = validateCampaignDraft(draft);
  if (!checked.ok) return { status: "FAILED", detail: checked.error };
  const value = checked.value;
  const unsubscribeUrl = optOutUrlFor(adminEmail);
  const rendered = await renderSample(value, unsubscribeUrl, `[TEST] ${value.subject}`);
  const outcome = await getMessagingProvider().sendEmail({ to: adminEmail, fromName: "PharmaBoost", subject: rendered.subject, text: rendered.text, html: rendered.html, headers: unsubscribeHeaders(unsubscribeUrl) });
  await traceDispatch({ kind: "CAMPAIGN", recipient: adminEmail, outcome, subject: rendered.subject, templateKey: "campaign:test", trigger: "TEST", sentByAdminId: adminId });
  await auditCampaign("campaign.test_sent", null, adminId, { kind: value.kind, audience: value.audience, status: outcome.status, recipient: maskEmail(adminEmail) });
  return { status: outcome.status, detail: outcome.detail };
}

// ---------------------------------------------------------------- Plan d'envoi

type Plan = { draft: CampaignDraftInput; audience: ResolvedAudience };

/**
 * Ce qui partirait maintenant : le brouillon revalidé (le code a pu changer
 * depuis l'enregistrement) et les destinataires recalculés en base.
 */
async function planFor(campaign: CampaignRow, now: Date): Promise<({ ok: true } & Plan) | { ok: false; error: string }> {
  const checked = validateCampaignDraft(draftFromRow(campaign), now);
  if (!checked.ok) return fail(`Le brouillon est à corriger : ${checked.error}`);
  const audience = await resolveAudience(checked.value.audience, checked.value.audienceParams);
  const count = audience.recipients.length;
  if (count === 0) return fail("Aucun destinataire à contacter : le public choisi est vide, ou tous ses membres se sont désinscrits.");
  if (count > CAMPAIGN_MAX_RECIPIENTS) return fail(`${count.toLocaleString("fr-FR")} destinataires : au plus ${CAMPAIGN_MAX_RECIPIENTS.toLocaleString("fr-FR")} par campagne. Choisissez un public plus étroit, ou découpez l'envoi.`);
  return { ok: true, draft: checked.value, audience };
}

const mismatch = (confirmed: number, actual: number) => `Le nombre de destinataires a changé : ${confirmed} confirmés, ${actual} aujourd'hui. Relisez l'aperçu, puis confirmez de nouveau.`;

// ---------------------------------------------------------------- Programmation

/**
 * Programme l'envoi à un JOUR (heure de Paris) : il part au passage quotidien
 * de ce jour-là. La confirmation (nombre de destinataires recalculé ici) a lieu
 * maintenant, c'est elle qui vaut envoi confirmé.
 */
export async function scheduleCampaign(id: string, date: Date, adminId: string, confirmedCount: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date();
  const dateError = validateScheduleDate(date, now);
  if (dateError) return fail(dateError);
  const campaign = await loadRow(id);
  if (!campaign) return fail("Campagne introuvable.");
  if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") return fail("Seul un brouillon, ou une campagne déjà programmée, se programme.");
  const plan = await planFor(campaign, now);
  if (!plan.ok) return fail(plan.error);
  const sendDay = zonedDayStart(calendarDay(date, TIME_ZONE), TIME_ZONE);
  if (plan.draft.offerEndsAt && plan.draft.offerEndsAt.getTime() < sendDay.getTime()) return fail("L'offre se termine avant la date d'envoi choisie : avancez l'envoi ou prolongez l'offre.");
  const count = plan.audience.recipients.length;
  if (!Number.isInteger(confirmedCount) || confirmedCount !== count) return fail(mismatch(confirmedCount, count));
  const updated = await prisma.campaign.updateMany({
    where: { id, status: campaign.status, updatedAt: campaign.updatedAt },
    // Le nombre confirmé est gardé : l'envoi le compare à celui qu'il recalcule, et le journal dit la différence.
    data: { status: "SCHEDULED", scheduledFor: sendDay, recipientCount: count },
  });
  if (updated.count !== 1) return fail("La campagne vient de changer (envoi ou autre modification) : rechargez la page.");
  await auditCampaign("campaign.scheduled", id, adminId, {
    before: stateOf(campaign),
    after: { status: "SCHEDULED", scheduledFor: sendDay.toISOString(), recipientCount: count },
    confirmedCount,
    excluded: plan.audience.excluded,
    schedule: describeSchedule(sendDay, now),
  });
  return { ok: true };
}

/** Reprend la main : la campagne programmée redevient un brouillon. Rien n'était parti. */
export async function unscheduleCampaign(id: string, adminId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const campaign = await loadRow(id);
  if (!campaign) return fail("Campagne introuvable.");
  if (campaign.status !== "SCHEDULED") return fail("Cette campagne n'est pas programmée.");
  const updated = await prisma.campaign.updateMany({ where: { id, status: "SCHEDULED" }, data: { status: "DRAFT", scheduledFor: null, recipientCount: 0 } });
  if (updated.count !== 1) return fail("La campagne vient de changer (envoi ou autre modification) : rechargez la page.");
  await auditCampaign("campaign.updated", id, adminId, { change: "unscheduled", before: stateOf(campaign), after: { status: "DRAFT", scheduledFor: null, recipientCount: 0 } });
  return { ok: true };
}

// ---------------------------------------------------------------- Envoi

type Progress = { recipientCount: number; sentCount: number; failedCount: number; skippedCount: number; simulated: boolean; complete: boolean };
type Who = { adminId: string | null; now: Date; deadline: number };

const progressOf = (row: CampaignRow): Progress => ({ recipientCount: row.recipientCount, sentCount: row.sentCount, failedCount: row.failedCount, skippedCount: row.skippedCount, simulated: row.simulated, complete: row.status === "SENT" });

/** Toute campagne de parrainage chiffrée ouvre une offre : il n'y a plus de montant « standard » par filleul (la règle est en pourcentage). */
function needsReferralOffer(draft: CampaignDraftInput): boolean {
  return draft.kind === "REFERRAL_OFFER" && draft.offerAmountCents !== null;
}

/** Le nom de l'offre vient du montant appliqué : le texte montré aux officines et la valeur appliquée ne peuvent pas diverger. */
function offerLabel(draft: CampaignDraftInput): string {
  return `Parrainage à ${formatEuros(draft.offerAmountCents ?? 0)} par filleul et par mois${draft.offerEndsAt ? ` jusqu'au ${formatFrenchDate(draft.offerEndsAt)}` : ""}`;
}

/** Fige les destinataires. Les désinscrits sont gardés, ignorés, sans leur adresse en clair. Rejouable : la clé unique écarte les doublons. */
async function freezeRecipients(id: string, audience: ResolvedAudience): Promise<void> {
  const row = (r: AudienceRecipient) => ({ campaignId: id, targetType: r.targetType, targetId: r.targetId, pharmacyId: r.pharmacyId, partnerId: r.partnerId, name: r.name });
  await prisma.campaignRecipient.createMany({ skipDuplicates: true, data: audience.recipients.map((r) => ({ ...row(r), emailKey: r.email, email: r.email, status: "PENDING" })) });
  for (let i = 0; i < audience.optedOut.length; i += 500) {
    await prisma.campaignRecipient.createMany({
      skipDuplicates: true,
      data: audience.optedOut.slice(i, i + 500).map((r) => ({ ...row(r), emailKey: `optout:${hashEmail(r.email)}`, email: maskEmail(r.email), status: "SKIPPED", detail: SKIP_OPTED_OUT })),
    });
  }
}

/** L'offre de parrainage, puis les destinataires. Si les destinataires ne s'écrivent pas, l'offre qu'on vient de démarrer est arrêtée. */
async function prepare(id: string, plan: Plan, who: Pick<Who, "adminId" | "now">): Promise<{ offerId: string | null }> {
  let offerId: string | null = null;
  if (needsReferralOffer(plan.draft)) {
    offerId = (await startReferralOffer({ label: offerLabel(plan.draft), amountCents: plan.draft.offerAmountCents!, startsAt: who.now, endsAt: plan.draft.offerEndsAt, campaignId: id, adminId: who.adminId })).id;
  }
  try {
    await freezeRecipients(id, plan.audience);
  } catch (error) {
    if (offerId) await endReferralOffer({ campaignId: id }, who.adminId).catch(() => undefined);
    throw error;
  }
  return { offerId };
}

type BeginResult = ({ ok: true } & Progress) | { ok: false; error: string; abandon: boolean };

/**
 * Démarre l'envoi d'une campagne. `confirmedCount` est le nombre confirmé par
 * l'administrateur ; `null` pour une campagne programmée (la confirmation a
 * eu lieu à la programmation : si les destinataires ont changé depuis, elle
 * part quand même, et le journal dit la différence).
 */
async function begin(id: string, who: Who & { confirmedCount: number | null }): Promise<BeginResult> {
  const refuse = (error: string, abandon = false): BeginResult => ({ ok: false, error, abandon });
  const campaign = await loadRow(id);
  if (!campaign) return refuse("Campagne introuvable.");
  if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") return refuse(NOT_STARTABLE[campaign.status] ?? "Cette campagne ne peut pas partir.");
  const plan = await planFor(campaign, who.now);
  // Un brouillon invalide ou un public vide ne s'arrangeront pas d'eux-mêmes : une campagne programmée est alors rendue à son auteur.
  if (!plan.ok) return refuse(plan.error, true);
  const count = plan.audience.recipients.length;
  if (who.confirmedCount !== null && who.confirmedCount !== count) return refuse(mismatch(who.confirmedCount, count));

  const claim = await prisma.campaign.updateMany({
    where: { id, status: campaign.status, updatedAt: campaign.updatedAt },
    data: {
      status: "SENDING",
      startedAt: who.now,
      completedAt: null,
      // Sans messagerie configurée, l'envoi est simulé : la campagne le dit dès son démarrage.
      simulated: getMessagingProvider().info.capability !== "LIVE",
      recipientCount: count,
      sentCount: 0,
      failedCount: 0,
      skippedCount: plan.audience.optedOut.length,
    },
  });
  if (claim.count !== 1) return refuse("Cette campagne vient d'être modifiée ou démarrée par un autre envoi : rechargez la page.");

  let offerId: string | null;
  try {
    ({ offerId } = await prepare(id, plan, who));
  } catch (error) {
    // Rien n'est parti : la campagne est rendue telle qu'elle était.
    await prisma.campaign.updateMany({
      where: { id, status: "SENDING", sentCount: 0 },
      data: { status: campaign.status, startedAt: campaign.startedAt, completedAt: campaign.completedAt, simulated: campaign.simulated, recipientCount: campaign.recipientCount, skippedCount: campaign.skippedCount },
    });
    return refuse(`L'envoi n'a pas pu démarrer : ${messageOf(error)}. Rien n'est parti.`);
  }

  const scheduled = who.confirmedCount === null;
  await auditCampaign("campaign.sent", id, who.adminId, {
    phase: "started",
    trigger: scheduled ? "scheduled" : "manual",
    before: stateOf(campaign),
    after: { status: "SENDING", recipientCount: count, skippedCount: plan.audience.optedOut.length },
    confirmedCount: who.confirmedCount,
    // Programmée : le nombre confirmé à la programmation, et ce que l'envoi a recalculé.
    ...(scheduled ? { confirmedAtScheduling: campaign.recipientCount, recipientsChanged: campaign.recipientCount !== count } : {}),
    excluded: plan.audience.excluded,
    referralOfferId: offerId,
  });
  return { ok: true, ...(await drive(id, who)) };
}

/** La ligne d'un destinataire, telle que l'envoi la lit. */
type RecipientRow = { id: string; targetType: string; targetId: string; pharmacyId: string | null; name: string | null; email: string };

type RunContext = {
  campaign: CampaignRow;
  side: CampaignSide;
  emailContext: EmailContext;
  messaging: MessagingProvider;
  wantsReferralCode: boolean;
  buttonUrl: string | null;
  adminId: string | null;
};

/** Les en-têtes de désinscription : le même jeton que le pied de page, pour le POST « en un clic » des messageries. */
function unsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return { "List-Unsubscribe": `<${unsubscribeUrl}/un-clic>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

const settle = (id: string, status: string, detail: string) => prisma.campaignRecipient.updateMany({ where: { id, status: "SENDING" }, data: { status, detail } });

/** Un destinataire : réservé, contrôlé (désinscription), rendu, envoyé, tracé. */
async function deliver(run: RunContext, row: RecipientRow, optedOut: Set<string>): Promise<void> {
  const reserved = await prisma.campaignRecipient.updateMany({ where: { id: row.id, status: "PENDING" }, data: { status: "SENDING" } });
  // Un autre passage l'a pris, ou la campagne a été annulée : rien à faire.
  if (reserved.count !== 1) return;
  if (optedOut.has(hashEmail(row.email))) {
    await settle(row.id, "SKIPPED", SKIP_OPTED_OUT);
    return;
  }

  let rendered: ReturnType<typeof renderCampaignEmail>;
  let notice: { title: string; body: string } | null = null;
  const unsubscribeUrl = optOutUrlFor(row.email);
  try {
    const values = campaignValues(run.campaign, await recipientValues(row, { wantsReferralCode: run.wantsReferralCode }));
    rendered = renderCampaignEmail(run.campaign, values, { context: run.emailContext, buttonUrl: run.buttonUrl, unsubscribeUrl, eyebrow: EYEBROWS[run.side], reason: REASONS[run.side] });
    if (run.campaign.alsoInApp && row.pharmacyId) {
      const paragraphs = campaignParagraphs(run.campaign.body, values);
      notice = { title: rendered.subject, body: (paragraphs[1] ?? paragraphs[0] ?? rendered.subject).slice(0, 280) };
    }
  } catch (error) {
    // Avant toute tentative d'envoi : rien n'est parti.
    await settle(row.id, "FAILED", `Rien n'est parti : ${messageOf(error)}`.slice(0, 500));
    return;
  }

  const outcome = await run.messaging.sendEmail({ to: row.email, fromName: "PharmaBoost", subject: rendered.subject, text: rendered.text, html: rendered.html, headers: unsubscribeHeaders(unsubscribeUrl) });
  const trace = await traceDispatch({ kind: "CAMPAIGN", recipient: row.email, outcome, subject: rendered.subject, templateKey: `campaign:${run.campaign.id}`, trigger: "MANUAL", pharmacyId: row.pharmacyId, sentByAdminId: run.adminId ?? run.campaign.createdByAdminId });
  await prisma.campaignRecipient.updateMany({
    where: { id: row.id, status: "SENDING" },
    data: { status: outcome.status, detail: outcome.detail.slice(0, 500), emailDispatchId: trace?.id ?? null, sentAt: outcome.status === "SENT" ? new Date() : null },
  });
  // Une notification dans l'application seulement pour un message réellement parti : jamais pour un envoi simulé ou en échec.
  if (outcome.status === "SENT" && notice && row.pharmacyId) {
    try {
      await createNotification({ pharmacyId: row.pharmacyId, type: "SYSTEM", severity: "INFO", title: notice.title, body: notice.body, linkUrl: "/parametres?onglet=abonnement", metadata: { campaignId: run.campaign.id } });
    } catch (error) {
      console.error("[campagnes] notification impossible", row.id, messageOf(error));
    }
  }
}

/** Relit les destinataires, remet les compteurs de la campagne à jour (et `updatedAt` : le signe qu'un envoi est vivant). */
async function refreshCounters(id: string): Promise<Record<string, number>> {
  const groups = await prisma.campaignRecipient.groupBy({ by: ["status"], where: { campaignId: id }, _count: { _all: true } });
  const counts = countsByStatus(groups, RECIPIENT_STATUSES);
  await prisma.campaign.updateMany({
    where: { id },
    data: { sentCount: counts.SENT + counts.SIMULATED, failedCount: counts.FAILED, skippedCount: counts.SKIPPED, ...(counts.SIMULATED > 0 ? { simulated: true } : {}) },
  });
  return counts;
}

/**
 * Envoie les destinataires en attente, par lots, jusqu'à la fin ou jusqu'à
 * l'échéance. Passe la campagne à « envoyée » quand plus rien n'attend ; sinon
 * elle reste « en cours » et la reprise (bouton ou passage quotidien) continue,
 * sans doublon.
 */
async function drive(id: string, who: Who): Promise<Progress> {
  const campaign = await loadRow(id);
  if (!campaign) throw new Error("Campagne introuvable.");
  if (campaign.status === "SENDING") {
    const run: RunContext = {
      campaign,
      side: CAMPAIGN_AUDIENCES[campaign.audience as AudienceKey].side,
      emailContext: await platformEmailContext(),
      messaging: getMessagingProvider(),
      wantsReferralCode: /\{\{\s*(code|lien)_parrainage\s*\}\}/.test(`${campaign.subject}\n${campaign.title}\n${campaign.body}`),
      buttonUrl: buttonUrlFor(campaign.buttonLabel ? campaign.buttonTarget : null),
      adminId: who.adminId,
    };
    const attempted = new Set<string>();
    while (Date.now() < who.deadline) {
      const state = await prisma.campaign.findUnique({ where: { id }, select: { status: true } });
      if (state?.status !== "SENDING") break;
      const pending = await prisma.campaignRecipient.findMany({
        where: { campaignId: id, status: "PENDING" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: BATCH_SIZE,
        select: { id: true, targetType: true, targetId: true, pharmacyId: true, name: true, email: true },
      });
      // Une ligne revue sans avoir changé d'état (erreur d'écriture) ne boucle pas.
      const batch = pending.filter((row) => !attempted.has(row.id));
      if (batch.length === 0) break;
      for (const row of batch) attempted.add(row.id);
      // Les désinscriptions faites pendant l'envoi comptent : la liste est relue à chaque lot.
      const optedOutRows = await prisma.marketingOptOut.findMany({ where: { emailHash: { in: batch.map((row) => hashEmail(row.email)) } }, select: { emailHash: true } });
      const optedOut = new Set(optedOutRows.map((o) => o.emailHash));
      await Promise.all(batch.map((row) => deliver(run, row, optedOut).catch((error: unknown) => console.error("[campagnes] destinataire en erreur", row.id, messageOf(error)))));
      await refreshCounters(id);
    }
    const counts = await refreshCounters(id);
    if (counts.PENDING + counts.SENDING === 0) {
      const done = await prisma.campaign.updateMany({ where: { id, status: "SENDING" }, data: { status: "SENT", completedAt: new Date() } });
      if (done.count === 1) await finished(id, who);
    }
  }
  const final = await loadRow(id);
  return progressOf(final ?? campaign);
}

/** La campagne est terminée : le journal garde l'après, et l'équipe est prévenue quand personne ne regardait (passage quotidien). */
async function finished(id: string, who: Who): Promise<void> {
  const row = await loadRow(id);
  if (!row) return;
  await auditCampaign("campaign.sent", id, who.adminId, { phase: "completed", before: { status: "SENDING" }, after: stateOf(row) });
  if (who.adminId) return;
  try {
    await notifyAdmins({
      type: "CAMPAIGN_COMPLETED",
      title: `Campagne terminée : ${row.name}`,
      body: `${row.sentCount} ${row.simulated ? "simulés" : "envoyés"}, ${row.failedCount} en échec, ${row.skippedCount} ignorés.`,
      linkUrl: `/admin/campagnes/${id}`,
      severity: row.failedCount > 0 || row.simulated ? "WARNING" : "INFO",
    });
  } catch (error) {
    console.error("[campagnes] notification de l'équipe impossible", id, messageOf(error));
  }
}

export async function startCampaign(
  id: string,
  adminId: string,
  confirmedCount: number,
): Promise<({ ok: true } & Progress) | { ok: false; error: string }> {
  if (!Number.isInteger(confirmedCount)) return fail("Le nombre de destinataires confirmé est invalide.");
  const result = await begin(id, { adminId, confirmedCount, now: new Date(), deadline: Date.now() + INTERACTIVE_BUDGET_MS });
  return result.ok ? result : fail(result.error);
}

/**
 * Reprend un envoi resté en cours : les destinataires encore en attente
 * partent, jamais ceux déjà traités. Une ligne restée « en cours » depuis plus
 * de 5 minutes (le passage qui l'avait prise est mort) est marquée en échec
 * « à vérifier » : on ne sait pas si le message est parti, on ne le renvoie pas.
 */
async function resume(id: string, who: Who): Promise<({ ok: true } & Progress) | { ok: false; error: string }> {
  const campaign = await loadRow(id);
  if (!campaign) return fail("Campagne introuvable.");
  if (campaign.status !== "SENDING") return fail("Cette campagne n'est pas en cours d'envoi.");
  if (who.now.getTime() - campaign.updatedAt.getTime() > STALE_MS) {
    await prisma.campaignRecipient.updateMany({ where: { campaignId: id, status: "SENDING" }, data: { status: "FAILED", detail: FAIL_INTERRUPTED } });
  }
  // Un démarrage interrompu avant l'écriture des destinataires : on le termine, avec les destinataires d'aujourd'hui.
  if ((await prisma.campaignRecipient.count({ where: { campaignId: id } })) === 0) {
    const plan = await planFor(campaign, who.now);
    if (!plan.ok) {
      await prisma.campaign.updateMany({ where: { id, status: "SENDING" }, data: { status: "DRAFT", startedAt: null, scheduledFor: null, recipientCount: 0, skippedCount: 0, simulated: false } });
      await auditCampaign("campaign.updated", id, who.adminId, { change: "start_abandoned", reason: plan.error, before: stateOf(campaign), after: { status: "DRAFT" } });
      return fail(plan.error);
    }
    await prepare(id, plan, who);
    await prisma.campaign.updateMany({ where: { id }, data: { recipientCount: plan.audience.recipients.length, skippedCount: plan.audience.optedOut.length } });
  }
  const progress = await drive(id, who);
  await auditCampaign("campaign.resumed", id, who.adminId, { before: stateOf(campaign), after: progress });
  return { ok: true, ...progress };
}

export async function resumeCampaign(id: string, adminId: string | null): Promise<{ ok: true; complete: boolean; sentCount: number; failedCount: number } | { ok: false; error: string }> {
  const result = await resume(id, { adminId, now: new Date(), deadline: Date.now() + INTERACTIVE_BUDGET_MS });
  return result.ok ? { ok: true, complete: result.complete, sentCount: result.sentCount, failedCount: result.failedCount } : result;
}

/**
 * Annule une campagne programmée ou en cours d'envoi. Les destinataires encore
 * en attente deviennent « ignorés » ; ceux déjà partis le restent. Arrête
 * l'offre de parrainage liée (les filleuls déjà inscrits gardent leur montant).
 * Rejouée sur une campagne déjà annulée, elle s'assure seulement que l'offre
 * est arrêtée : un arrêt qui aurait échoué se rejoue.
 */
export async function cancelCampaign(id: string, adminId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const current = await loadRow(id);
  if (!current) return fail("Campagne introuvable.");
  if (current.status === "CANCELED") {
    await endReferralOffer({ campaignId: id }, adminId);
    return { ok: true };
  }
  if (current.status !== "SCHEDULED" && current.status !== "SENDING") return fail("Seule une campagne programmée, ou en cours d'envoi, s'annule.");
  const canceled = await prisma.campaign.updateMany({ where: { id, status: current.status }, data: { status: "CANCELED", canceledAt: new Date() } });
  if (canceled.count !== 1) return fail("La campagne vient de changer (envoi terminé ou déjà annulée) : rechargez la page.");
  let skipped = 0;
  if (current.status === "SENDING") {
    // Un destinataire déjà réservé par un envoi en vol finit son envoi ; les autres ne partiront pas.
    skipped = (await prisma.campaignRecipient.updateMany({ where: { campaignId: id, status: "PENDING" }, data: { status: "SKIPPED", detail: SKIP_CANCELED } })).count;
    await refreshCounters(id);
  }
  await endReferralOffer({ campaignId: id }, adminId);
  const after = await loadRow(id);
  await auditCampaign("campaign.canceled", id, adminId, { before: stateOf(current), after: after ? stateOf(after) : { status: "CANCELED" }, skippedByCancellation: skipped });
  return { ok: true };
}

// ---------------------------------------------------------------- Passage quotidien

/** Une campagne programmée qui ne peut plus partir (texte ou public devenus invalides) est rendue à son auteur, et l'équipe est prévenue. */
async function abandonScheduled(id: string, reason: string): Promise<void> {
  const campaign = await loadRow(id);
  if (!campaign || campaign.status !== "SCHEDULED") return;
  const released = await prisma.campaign.updateMany({ where: { id, status: "SCHEDULED" }, data: { status: "DRAFT", scheduledFor: null, recipientCount: 0 } });
  if (released.count !== 1) return;
  await auditCampaign("campaign.updated", id, null, { change: "schedule_abandoned", reason, before: stateOf(campaign), after: { status: "DRAFT", scheduledFor: null, recipientCount: 0 } });
  try {
    await notifyAdmins({ type: "CAMPAIGN_NOT_SENT", title: `Campagne programmée non envoyée : ${campaign.name}`, body: `${reason} Elle est redevenue un brouillon.`, linkUrl: `/admin/campagnes/${id}`, severity: "WARNING" });
  } catch (error) {
    console.error("[campagnes] notification de l'équipe impossible", id, messageOf(error));
  }
}

/**
 * Le passage quotidien : démarre les campagnes programmées dont le jour est
 * atteint, puis reprend celles restées « en cours » sans mouvement depuis plus
 * de 5 minutes. Une campagne qui échoue n'empêche pas les suivantes.
 */
export async function processDueCampaigns(now: Date): Promise<{ started: number; resumed: number }> {
  const deadline = Date.now() + CRON_BUDGET_MS;
  let started = 0;
  let resumed = 0;

  const due = await prisma.campaign.findMany({ where: { status: "SCHEDULED", scheduledFor: { lte: now } }, orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }], select: { id: true } });
  for (const { id } of due) {
    if (Date.now() >= deadline) break;
    try {
      const result = await begin(id, { adminId: null, confirmedCount: null, now, deadline });
      if (result.ok) started += 1;
      else if (result.abandon) await abandonScheduled(id, result.error);
    } catch (error) {
      console.error("[campagnes] démarrage impossible", id, messageOf(error));
    }
  }

  const stuck = await prisma.campaign.findMany({ where: { status: "SENDING", updatedAt: { lt: new Date(now.getTime() - STALE_MS) } }, orderBy: [{ startedAt: "asc" }, { createdAt: "asc" }], select: { id: true } });
  for (const { id } of stuck) {
    if (Date.now() >= deadline) break;
    try {
      const result = await resume(id, { adminId: null, now, deadline });
      if (result.ok) resumed += 1;
    } catch (error) {
      console.error("[campagnes] reprise impossible", id, messageOf(error));
    }
  }
  return { started, resumed };
}

// ---------------------------------------------------------------- Désinscription des offres

/** L'adresse publique de désinscription : le jeton ne porte que l'empreinte de l'adresse, jamais l'adresse. */
export function optOutUrlFor(email: string): string {
  return publicUrl(`${OPT_OUT_PATH}/${signPayload({ h: hashEmail(email), t: OPT_OUT_PURPOSE }, OPT_OUT_TTL_MS)}`);
}

/** L'empreinte portée par un jeton valide (signé, daté, bien de cet usage), sinon `null`. */
function hashFromToken(token: string): string | null {
  const data = verifyPayload<{ h?: unknown; t?: unknown }>(token);
  if (!data || data.t !== OPT_OUT_PURPOSE || typeof data.h !== "string" || !/^[0-9a-f]{64}$/.test(data.h)) return null;
  return data.h;
}

/** L'état d'une désinscription, pour la page : n'écrit rien (un aperçu de messagerie ouvre les liens). */
export async function peekOfferOptOut(token: string): Promise<{ alreadyOptedOut: boolean } | null> {
  const hash = hashFromToken(token);
  if (!hash) return null;
  const existing = await prisma.marketingOptOut.findUnique({ where: { emailHash: hash }, select: { id: true } });
  return { alreadyOptedOut: Boolean(existing) };
}

/** Inscrit l'empreinte sur la liste. Idempotent : une adresse déjà désinscrite l'est encore, sans second audit. */
export async function confirmOfferOptOut(token: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const hash = hashFromToken(token);
  if (!hash) return fail(`Ce lien n'est plus valide. Écrivez-nous à ${PUBLIC_CONTACT_EMAIL} et nous nous en occupons.`);
  try {
    const row = await prisma.marketingOptOut.create({ select: { id: true }, data: { emailHash: hash, source: "LINK" } });
    await recordAudit({ action: "marketing.opted_out", entityType: "MarketingOptOut", entityId: row.id, metadata: { source: "LINK" } });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
  }
  return { ok: true };
}
