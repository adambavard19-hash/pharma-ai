import "server-only";
import { prisma } from "@/server/db/client";
import type { Prisma } from "@/generated/prisma";
import { recordAudit } from "@/server/audit/log";
import { notifyAdmins, notifySalesRep } from "@/server/services/sales/notifications";
import { contractCounters } from "@/server/services/admin/contracts-admin";
import { pharmacyRecipient, sendTemplatedEmail, templateValuesFor, type Recipient } from "./outbound-email";
import { countCommunications, parseCommunicationFilters, shownCount } from "./communications";
import {
  AUTOMATION_RULES,
  CATCH_UP_DAYS,
  UNPAID_INVOICE_STATUSES,
  automationRule,
  calendarDaysUntil,
  clampOffset,
  dueDay,
  paymentSequenceError,
  planAutomations,
  resolveRules,
  unpaidSeriesStart,
  type CancellationCandidate,
  type PlannedAutomation,
  type ProspectCandidate,
  type ResolvedRule,
  type SubscriptionCandidate,
} from "@/core/admin/automations";
import { zonedDayStart } from "@/core/challenges/dates";
import { emailTemplate } from "@/core/admin/email-templates";
import { formatFrenchDate } from "@/core/billing/subscription";
import { TIME_ZONE } from "@/config/constants";

/**
 * Le moteur des relances automatiques : il lit les règles et les candidats,
 * demande au module pur ce qui est dû, puis envoie — une seule fois.
 *
 * L'ordre des écritures est le garde-fou : la ligne `AutomationDispatch`
 * (clé unique) est insérée AVANT l'envoi. Deux passages simultanés se
 * disputent la même clé ; le second reçoit P2002 et passe son chemin. Un
 * passage interrompu après l'insertion laisse une ligne « SENDING » visible
 * dans l'historique, jamais un e-mail envoyé deux fois. Une erreur survenue
 * AVANT toute tentative d'envoi (destinataire, valeurs) libère la clé : rien
 * n'est parti, le passage suivant réessaie dans la fenêtre de rattrapage.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Statut posé à l'insertion, avant l'envoi. */
const CLAIM_STATUS = "SENDING";

// ---------------------------------------------------------------- Règles

export async function loadRules(): Promise<ResolvedRule[]> {
  const rows = await prisma.automationRule.findMany({ select: { key: true, enabled: true, offsetDays: true } });
  return resolveRules(rows);
}

export type SaveRuleResult = { ok: true; rule: ResolvedRule } | { ok: false; error: string };

/**
 * Active, désactive ou règle le délai d'une règle. Le délai est ramené dans
 * ses bornes ; un délai qui casserait l'ordre des relances de paiement est
 * refusé, sans écriture. L'avant et l'après vont au journal.
 */
export async function saveRule(key: string, input: { enabled: boolean; offsetDays: number }, adminId: string): Promise<SaveRuleResult> {
  const definition = automationRule(key);
  if (!definition) return { ok: false, error: "Règle inconnue." };
  const rules = await loadRules();
  const before = rules.find((r) => r.key === key);
  const offsetDays = clampOffset(definition, input.offsetDays);
  const outOfOrder = paymentSequenceError(rules, { key, enabled: input.enabled, offsetDays });
  if (outOfOrder) return { ok: false, error: outOfOrder };
  await prisma.automationRule.upsert({
    where: { key },
    update: { enabled: input.enabled, offsetDays, updatedByAdminId: adminId },
    create: { key, enabled: input.enabled, offsetDays, updatedByAdminId: adminId },
  });
  await recordAudit({
    action: "platform.automation_updated",
    entityType: "AutomationRule",
    entityId: key,
    platformAdminId: adminId,
    metadata: {
      before: before ? { enabled: before.enabled, offsetDays: before.offsetDays } : null,
      after: { enabled: input.enabled, offsetDays },
    },
  });
  return { ok: true, rule: { ...definition, enabled: input.enabled, offsetDays } };
}

// ---------------------------------------------------------------- Candidats

/**
 * Au-delà de cette date, aucun événement ne peut plus rendre une règle due :
 * le plus long délai positif, plus le rattrapage, plus un jour de marge.
 */
export function anchorWindowStart(now: Date): Date {
  const longest = Math.max(0, ...AUTOMATION_RULES.map((r) => r.maxOffsetDays));
  return new Date(now.getTime() - (longest + CATCH_UP_DAYS + 1) * DAY_MS);
}

type CandidateContext = {
  pharmacyNames: Map<string, string>;
  /** La fin d'essai de chaque abonnement : pour {{jours_restants}}, compté en jours calendaires. */
  trialEnds: Map<string, Date>;
  cancellations: Map<string, { requestedAt: Date; plannedEndAt: Date | null; subscriptionEndAt: Date | null }>;
  prospects: Map<string, { name: string; nextActionAt: Date | null; nextActionLabel: string | null; salesRepId: string | null }>;
};

export type AutomationCandidates = {
  subscriptions: SubscriptionCandidate[];
  cancellations: CancellationCandidate[];
  prospects: ProspectCandidate[];
  context: CandidateContext;
};

/**
 * Les cibles possibles : abonnements (rattachés à leur première officine hors
 * démonstration), demandes de résiliation ouvertes, dossiers commerciaux
 * ouverts avec une relance prévue. Seuls les événements assez récents pour
 * être encore dus sont lus.
 */
export async function loadCandidates(now: Date): Promise<AutomationCandidates> {
  const since = anchorWindowStart(now);
  const [subscriptionRows, cancellationRows, prospectRows] = await Promise.all([
    prisma.subscription.findMany({
      where: { OR: [{ trialStartsAt: { gte: since } }, { trialEndsAt: { gte: since } }, { lastPaymentFailedAt: { gte: since } }] },
      select: {
        id: true,
        organizationId: true,
        status: true,
        trialStartsAt: true,
        trialEndsAt: true,
        lastPaymentAt: true,
        lastPaymentFailedAt: true,
        suspendedAt: true,
        // Les factures restées dues : la plus ancienne après le dernier paiement réussi ouvre la série impayée.
        payments: { where: { status: { in: [...UNPAID_INVOICE_STATUSES] } }, select: { status: true, createdAt: true } },
        organization: { select: { pharmacies: { where: { isDemo: false }, orderBy: { createdAt: "asc" }, take: 1, select: { id: true, name: true } } } },
      },
    }),
    prisma.cancellationRequest.findMany({
      where: { status: { in: ["RECEIVED", "IN_PROGRESS", "CONFIRMED"] }, pharmacy: { isDemo: false } },
      select: { id: true, pharmacyId: true, status: true, requestedAt: true, confirmedAt: true, plannedEndAt: true, pharmacy: { select: { name: true } }, subscription: { select: { cancelAt: true, currentPeriodEnd: true, cancelAtPeriodEnd: true } } },
    }),
    prisma.prospect.findMany({
      where: { nextActionAt: { gte: since }, blockedAt: null, status: { notIn: ["ACTIVATED", "LOST"] } },
      select: { id: true, name: true, status: true, nextActionAt: true, nextActionLabel: true, lastContactAt: true, blockedAt: true, salesRepId: true },
    }),
  ]);

  const context: CandidateContext = { pharmacyNames: new Map(), trialEnds: new Map(), cancellations: new Map(), prospects: new Map() };
  const subscriptions: SubscriptionCandidate[] = [];
  for (const row of subscriptionRows) {
    const pharmacy = row.organization.pharmacies[0];
    // Une organisation sans officine réelle (démonstration seulement) n'est jamais relancée.
    if (!pharmacy) continue;
    context.pharmacyNames.set(pharmacy.id, pharmacy.name);
    if (row.trialEndsAt) context.trialEnds.set(row.id, row.trialEndsAt);
    subscriptions.push({
      id: row.id,
      organizationId: row.organizationId,
      pharmacyId: pharmacy.id,
      status: row.status,
      trialStartsAt: row.trialStartsAt,
      trialEndsAt: row.trialEndsAt,
      lastPaymentAt: row.lastPaymentAt,
      lastPaymentFailedAt: row.lastPaymentFailedAt,
      unpaidSinceAt: unpaidSeriesStart(row, row.payments),
      suspendedAt: row.suspendedAt,
    });
  }
  const cancellations: CancellationCandidate[] = cancellationRows.map((row) => {
    context.pharmacyNames.set(row.pharmacyId, row.pharmacy.name);
    const sub = row.subscription;
    context.cancellations.set(row.id, { requestedAt: row.requestedAt, plannedEndAt: row.plannedEndAt, subscriptionEndAt: sub?.cancelAt ?? (sub?.cancelAtPeriodEnd ? sub.currentPeriodEnd : null) ?? null });
    return { id: row.id, pharmacyId: row.pharmacyId, status: row.status, requestedAt: row.requestedAt, confirmedAt: row.confirmedAt };
  });
  const prospects: ProspectCandidate[] = prospectRows.map((row) => {
    context.prospects.set(row.id, { name: row.name, nextActionAt: row.nextActionAt, nextActionLabel: row.nextActionLabel, salesRepId: row.salesRepId });
    return { id: row.id, status: row.status, nextActionAt: row.nextActionAt, lastContactAt: row.lastContactAt, blockedAt: row.blockedAt, salesRepId: row.salesRepId };
  });
  return { subscriptions, cancellations, prospects, context };
}

// ---------------------------------------------------------------- Plan

export type AutomationPlan = { rules: ResolvedRule[]; planned: PlannedAutomation[]; alreadyDone: number; candidates: AutomationCandidates | null; now: Date };

/**
 * Ce qui est dû avec ces règles : un premier calcul, puis les clés déjà
 * consommées sont lues en base et retirées. Sans règle active, aucune lecture.
 */
async function planWith(rules: ResolvedRule[], now: Date): Promise<AutomationPlan> {
  if (!rules.some((r) => r.enabled)) return { rules, planned: [], alreadyDone: 0, candidates: null, now };
  const candidates = await loadCandidates(now);
  const input = { rules, subscriptions: candidates.subscriptions, cancellations: candidates.cancellations, prospects: candidates.prospects, now };
  const due = planAutomations({ ...input, alreadyDone: new Set() });
  if (due.length === 0) return { rules, planned: [], alreadyDone: 0, candidates, now };
  const existing = await prisma.automationDispatch.findMany({ where: { dedupeKey: { in: due.map((p) => p.dedupeKey) } }, select: { dedupeKey: true } });
  const done = new Set(existing.map((e) => e.dedupeKey));
  const planned = planAutomations({ ...input, alreadyDone: done });
  return { rules, planned, alreadyDone: due.length - planned.length, candidates, now };
}

export async function planNow(now: Date = new Date()): Promise<AutomationPlan> {
  return planWith(await loadRules(), now);
}

// ---------------------------------------------------------------- Lancement

export type AutomationItemStatus =
  /** Aperçu : partirait. */
  | "PREVIEW"
  /** Aperçu : ne partirait pas (pas de destinataire). */
  | "PREVIEW_SKIPPED"
  | "SENT"
  | "FAILED"
  | "SIMULATED"
  | "SKIPPED"
  | "INTERNAL"
  | "ALREADY_DONE"
  | "ERROR";

export type AutomationRunItem = {
  ruleKey: string;
  ruleLabel: string;
  channel: "EMAIL" | "INTERNAL";
  dedupeKey: string;
  targetType: PlannedAutomation["targetType"];
  targetId: string;
  pharmacyId: string | null;
  /** L'officine ou le dossier concerné, en clair. */
  targetLabel: string;
  /** L'adresse e-mail résolue, ou « Équipe PharmaBoost » pour une alerte interne. */
  recipient: string | null;
  templateKey: string | null;
  templateLabel: string | null;
  dueAt: Date;
  status: AutomationItemStatus;
  detail: string | null;
};

export type AutomationRunReport = {
  dryRun: boolean;
  enabledRules: number;
  planned: number;
  sent: number;
  failed: number;
  simulated: number;
  skipped: number;
  internal: number;
  alreadyDone: number;
  errors: string[];
  items: AutomationRunItem[];
};

const NO_RECIPIENT = "Aucune adresse e-mail connue pour cette officine (ni titulaire actif, ni e-mail de l'officine).";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";
}

function targetLabel(item: PlannedAutomation, context: CandidateContext): string {
  if (item.targetType === "Prospect") return context.prospects.get(item.targetId)?.name ?? "Dossier commercial";
  return (item.pharmacyId && context.pharmacyNames.get(item.pharmacyId)) || "Officine";
}

/**
 * Les valeurs propres à une règle, en plus de celles du destinataire. Elles
 * l'emportent sur celles-ci : {{jours_restants}} se compte ici en jours
 * calendaires (heure de Paris) à la date du passage — le 16 pour un essai qui
 * finit le 20, c'est « 4 jours », quelle que soit l'heure.
 */
function ruleValues(item: PlannedAutomation, context: CandidateContext, now: Date): Record<string, string | null> {
  if (item.targetType === "Subscription") {
    const trialEndsAt = context.trialEnds.get(item.targetId);
    return trialEndsAt ? { jours_restants: String(calendarDaysUntil(trialEndsAt, now)) } : {};
  }
  if (item.targetType !== "CancellationRequest") return {};
  const request = context.cancellations.get(item.targetId);
  if (!request) return {};
  const end = request.plannedEndAt ?? request.subscriptionEndAt;
  return { date_demande: formatFrenchDate(request.requestedAt), date_fin_prevue: end ? formatFrenchDate(end) : null };
}

/** Une valeur indispensable au texte manque : mieux vaut ne pas envoyer qu'envoyer une phrase vide. */
function missingValue(item: PlannedAutomation, values: Record<string, string | null>): string | null {
  if (item.ruleKey === "cancellation.confirmation" && !values.date_fin_prevue) return "Date de fin prévue inconnue : renseignez-la sur la demande de résiliation, puis écrivez au titulaire depuis sa fiche.";
  return null;
}

function internalMessage(item: PlannedAutomation, context: CandidateContext, rule: ResolvedRule) {
  if (item.ruleKey === "prospect.followup_overdue") {
    const prospect = context.prospects.get(item.targetId);
    const name = prospect?.name ?? "Dossier";
    const label = prospect?.nextActionLabel ? ` (« ${prospect.nextActionLabel} »)` : "";
    const body = `La relance prévue le ${formatFrenchDate(item.anchorAt)}${label} n'a pas été faite.`;
    return {
      type: "AUTOMATION_FOLLOWUP_OVERDUE",
      title: `Relance commerciale dépassée — ${name}`,
      body,
      linkUrl: `/admin/dossiers/${item.targetId}`,
      salesRep: prospect?.salesRepId ? { salesRepId: prospect.salesRepId, title: `${name} : relance prévue dépassée`, linkUrl: `/extranet/dossiers/${item.targetId}` } : null,
    };
  }
  const name = targetLabel(item, context);
  return {
    type: "AUTOMATION_PAYMENT_ALERT",
    title: `Impayé persistant — ${name}`,
    // L'ancre est le début de la série impayée, pas la dernière tentative de Stripe.
    body: `Un paiement reste dû depuis le ${formatFrenchDate(item.anchorAt)}, sans paiement réussi depuis (alerte à J+${rule.offsetDays}). Vérifiez la situation avec le titulaire.`,
    linkUrl: item.pharmacyId ? `/admin/pharmacies/${item.pharmacyId}?onglet=paiements` : "/admin/impayes",
    salesRep: null,
  };
}

function emptyReport(dryRun: boolean, enabledRules: number): AutomationRunReport {
  return { dryRun, enabledRules, planned: 0, sent: 0, failed: 0, simulated: 0, skipped: 0, internal: 0, alreadyDone: 0, errors: [], items: [] };
}

/** Le destinataire de chaque officine, lu une fois par passage. Une lecture en erreur n'est pas gardée : la relance suivante la refait. */
function recipientCache() {
  const cache = new Map<string, Promise<Recipient | null>>();
  return (pharmacyId: string | null) => {
    if (!pharmacyId) return Promise.resolve(null);
    if (!cache.has(pharmacyId)) {
      cache.set(
        pharmacyId,
        pharmacyRecipient(pharmacyId).catch((error: unknown) => {
          cache.delete(pharmacyId);
          throw error;
        }),
      );
    }
    return cache.get(pharmacyId)!;
  };
}

/** Un e-mail réellement remis au prestataire. */
const DELIVERED_EMAIL_STATUSES = ["SENT", "DELIVERED", "DELAYED"];

/**
 * Le même modèle, déjà envoyé À LA MAIN à la même officine (ou, pour un
 * abonnement, à la même organisation) depuis l'événement de la règle : la
 * relance automatique n'a plus d'objet. Pour une règle « avant l'échéance »
 * (fin d'essai), la fenêtre s'ouvre au plus tôt où la règle aurait pu partir.
 * Les jours se lisent à l'heure de Paris. Rend la date de cet envoi, ou `null`.
 */
async function manualSendSince(planned: PlannedAutomation, rule: ResolvedRule, recipient: Recipient): Promise<Date | null> {
  if (!planned.templateKey) return null;
  const since = zonedDayStart(dueDay(planned.anchorAt, Math.min(0, rule.minOffsetDays)), TIME_ZONE);
  const sameTarget: Prisma.EmailDispatchWhereInput[] = [];
  if (planned.pharmacyId) sameTarget.push({ pharmacyId: planned.pharmacyId });
  if (planned.targetType === "Subscription" && recipient.organizationId) sameTarget.push({ organizationId: recipient.organizationId });
  if (sameTarget.length === 0) return null;
  const manual = await prisma.emailDispatch.findFirst({
    where: { templateKey: planned.templateKey, trigger: "MANUAL", status: { in: DELIVERED_EMAIL_STATUSES }, createdAt: { gte: since }, OR: sameTarget },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return manual?.createdAt ?? null;
}

const manualSendDetail = (at: Date) => `Déjà envoyé manuellement le ${formatFrenchDate(at)} : la relance automatique ne repart pas.`;

function baseItem(item: PlannedAutomation, rule: ResolvedRule, context: CandidateContext): AutomationRunItem {
  const template = item.templateKey ? emailTemplate(item.templateKey) : null;
  return {
    ruleKey: item.ruleKey,
    ruleLabel: rule.label,
    channel: item.channel,
    dedupeKey: item.dedupeKey,
    targetType: item.targetType,
    targetId: item.targetId,
    pharmacyId: item.pharmacyId,
    targetLabel: targetLabel(item, context),
    recipient: null,
    templateKey: item.templateKey ?? null,
    templateLabel: template?.label ?? null,
    dueAt: item.dueAt,
    status: "PREVIEW",
    detail: null,
  };
}

/** L'aperçu d'un plan : destinataires résolus, rien n'est écrit, rien ne part. */
async function describePlan(plan: AutomationPlan): Promise<AutomationRunItem[]> {
  if (!plan.candidates) return [];
  const context = plan.candidates.context;
  const recipientOf = recipientCache();
  const rules = new Map(plan.rules.map((r) => [r.key, r]));
  const items: AutomationRunItem[] = [];
  for (const planned of plan.planned) {
    const rule = rules.get(planned.ruleKey);
    if (!rule) continue;
    const item = baseItem(planned, rule, context);
    if (planned.channel === "INTERNAL") {
      const message = internalMessage(planned, context, rule);
      item.recipient = message.salesRep ? "Équipe PharmaBoost et commercial du dossier" : "Équipe PharmaBoost";
      item.detail = message.title;
    } else {
      const recipient = await recipientOf(planned.pharmacyId);
      const missing = missingValue(planned, ruleValues(planned, context, plan.now));
      item.recipient = recipient?.email ?? null;
      if (!recipient || missing) {
        item.status = "PREVIEW_SKIPPED";
        item.detail = recipient ? missing : NO_RECIPIENT;
      } else {
        const manualAt = await manualSendSince(planned, rule, recipient);
        if (manualAt) {
          item.status = "PREVIEW_SKIPPED";
          item.detail = manualSendDetail(manualAt);
        }
      }
    }
    items.push(item);
  }
  return items;
}

/**
 * Lance les relances dues. En `dryRun`, rend la liste de ce qui partirait
 * (règle, cible, destinataire, modèle) sans rien écrire ni envoyer. Sinon,
 * chaque élément est d'abord réservé par sa clé unique, puis envoyé.
 */
export async function runAutomations(options: { now: Date; dryRun: boolean; adminId?: string | null }): Promise<AutomationRunReport> {
  const { now, dryRun, adminId } = options;
  const rules = await loadRules();
  const enabledRules = rules.filter((r) => r.enabled).length;
  // Sûr par défaut : aucune règle active, aucune lecture, aucun envoi.
  if (enabledRules === 0) return emptyReport(dryRun, 0);

  const plan = await planWith(rules, now);
  const report = emptyReport(dryRun, enabledRules);
  report.planned = plan.planned.length;
  report.alreadyDone = plan.alreadyDone;

  if (dryRun) {
    report.items = await describePlan(plan);
    report.skipped = report.items.filter((i) => i.status === "PREVIEW_SKIPPED").length;
    return report;
  }

  if (plan.candidates) {
    const context = plan.candidates.context;
    const recipientOf = recipientCache();
    const byKey = new Map(rules.map((r) => [r.key, r]));
    for (const planned of plan.planned) {
      const rule = byKey.get(planned.ruleKey);
      if (!rule) continue;
      const item = baseItem(planned, rule, context);
      report.items.push(item);
      let claimId: string | null = null;
      // Posé juste avant l'envoi (e-mail ou alerte) : avant, rien n'est parti et la clé peut être rendue.
      let attempted = false;
      try {
        try {
          const claim = await prisma.automationDispatch.create({
            select: { id: true },
            data: { ruleKey: planned.ruleKey, dedupeKey: planned.dedupeKey, targetType: planned.targetType, targetId: planned.targetId, pharmacyId: planned.pharmacyId, status: CLAIM_STATUS },
          });
          claimId = claim.id;
        } catch (error) {
          // Déjà réservé par un autre passage : il s'en occupe, ou s'en est occupé.
          if (isUniqueViolation(error)) {
            item.status = "ALREADY_DONE";
            report.alreadyDone += 1;
            report.planned -= 1;
            continue;
          }
          throw error;
        }

        if (planned.channel === "INTERNAL") {
          const message = internalMessage(planned, context, rule);
          attempted = true;
          await notifyAdmins({ type: message.type, title: message.title, body: message.body, linkUrl: message.linkUrl, severity: "WARNING" });
          if (message.salesRep) await notifySalesRep({ salesRepId: message.salesRep.salesRepId, type: message.type, title: message.salesRep.title, body: message.body, linkUrl: message.salesRep.linkUrl, severity: "WARNING" });
          item.status = "INTERNAL";
          item.recipient = message.salesRep ? "Équipe PharmaBoost et commercial du dossier" : "Équipe PharmaBoost";
          item.detail = message.title;
          await prisma.automationDispatch.update({ where: { id: claimId }, data: { status: "INTERNAL", recipient: item.recipient, detail: message.title.slice(0, 500) } });
          report.internal += 1;
          continue;
        }

        const recipient = await recipientOf(planned.pharmacyId);
        const extra = ruleValues(planned, context, now);
        const missing = !recipient ? NO_RECIPIENT : !planned.templateKey ? "Aucun modèle d'e-mail associé à cette règle." : missingValue(planned, extra);
        // Le même modèle déjà envoyé à la main depuis l'événement : la relance n'a plus d'objet.
        const manualAt = recipient && !missing ? await manualSendSince(planned, rule, recipient) : null;
        const skipReason = missing ?? (manualAt ? manualSendDetail(manualAt) : null);
        if (!recipient || !planned.templateKey || skipReason) {
          item.status = "SKIPPED";
          item.recipient = recipient?.email ?? null;
          item.detail = skipReason;
          await prisma.automationDispatch.update({ where: { id: claimId }, data: { status: "SKIPPED", recipient: item.recipient, detail: skipReason?.slice(0, 500) ?? null } });
          report.skipped += 1;
          continue;
        }

        const values = await templateValuesFor(recipient, extra);
        attempted = true;
        const sent = await sendTemplatedEmail({ templateKey: planned.templateKey, recipient, values, trigger: "AUTOMATIC", ruleKey: planned.ruleKey, adminId: adminId ?? null });
        item.status = sent.outcome.status;
        item.recipient = recipient.email;
        item.detail = sent.outcome.detail;
        await prisma.automationDispatch.update({ where: { id: claimId }, data: { status: sent.outcome.status, recipient: recipient.email, emailDispatchId: sent.dispatchId, detail: sent.outcome.detail.slice(0, 500) } });
        if (sent.outcome.status === "SENT") report.sent += 1;
        else if (sent.outcome.status === "SIMULATED") report.simulated += 1;
        else report.failed += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        item.status = "ERROR";
        item.detail = message;
        report.errors.push(`${planned.dedupeKey} : ${message}`);
        if (!claimId) continue;
        if (attempted) {
          // Après la tentative, la clé reste consommée : un passage suivant ne renverra pas un message peut-être déjà parti.
          await prisma.automationDispatch.update({ where: { id: claimId }, data: { status: "FAILED", detail: message.slice(0, 500) } }).catch(() => undefined);
          continue;
        }
        // Avant toute tentative, rien n'est parti : la ligne de réservation (la nôtre, pas une donnée métier) est retirée,
        // le passage suivant réessaie. Si même ce retrait échoue, la ligne reste visible en échec.
        const released = await prisma.automationDispatch.delete({ where: { id: claimId } }).then(
          () => true,
          () => false,
        );
        if (released) item.detail = `${message} — rien n'est parti, la relance sera retentée au prochain passage.`;
        else await prisma.automationDispatch.update({ where: { id: claimId }, data: { status: "FAILED", detail: message.slice(0, 500) } }).catch(() => undefined);
      }
    }
  }

  if (adminId) {
    await recordAudit({
      action: "platform.automation_run",
      entityType: "AutomationRule",
      entityId: null,
      platformAdminId: adminId,
      metadata: { enabledRules, planned: report.planned, sent: report.sent, failed: report.failed, simulated: report.simulated, skipped: report.skipped, internal: report.internal, alreadyDone: report.alreadyDone, errors: report.errors.length },
    });
  }
  return report;
}

/**
 * Ce que ferait UNE règle aujourd'hui avec ce délai, active ou non : pour la
 * fenêtre d'activation. Lecture seule.
 */
export async function previewRule(ruleKey: string, offsetDays: number | null, now: Date = new Date()): Promise<AutomationRunItem[] | null> {
  const rules = await loadRules();
  const target = rules.find((r) => r.key === ruleKey);
  if (!target) return null;
  const only = rules.map((r) => (r.key === ruleKey ? { ...r, enabled: true, offsetDays: offsetDays === null ? r.offsetDays : clampOffset(r, offsetDays) } : { ...r, enabled: false }));
  return describePlan(await planWith(only, now));
}

// ---------------------------------------------------------------- Lecture pour le centre des relances

export type RecentDispatch = { id: string; ruleKey: string; createdAt: Date; status: string; recipient: string | null; detail: string | null; pharmacyId: string | null; targetType: string; targetId: string; targetLabel: string | null };

/** Les derniers déclenchements de chaque règle (au plus `perRule`), avec l'officine ou le dossier concerné. */
export async function recentDispatchesByRule(perRule = 5): Promise<Map<string, RecentDispatch[]>> {
  const rows = await Promise.all(
    AUTOMATION_RULES.map((rule) =>
      prisma.automationDispatch.findMany({
        where: { ruleKey: rule.key },
        orderBy: { createdAt: "desc" },
        take: perRule,
        select: { id: true, ruleKey: true, createdAt: true, status: true, recipient: true, detail: true, pharmacyId: true, targetType: true, targetId: true },
      }),
    ),
  );
  const flat = rows.flat();
  const pharmacyIds = [...new Set(flat.map((r) => r.pharmacyId).filter((id): id is string => Boolean(id)))];
  const prospectIds = [...new Set(flat.filter((r) => r.targetType === "Prospect").map((r) => r.targetId))];
  const [pharmacies, prospects] = await Promise.all([
    pharmacyIds.length ? prisma.pharmacy.findMany({ where: { id: { in: pharmacyIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    prospectIds.length ? prisma.prospect.findMany({ where: { id: { in: prospectIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const pharmacyNames = new Map(pharmacies.map((p) => [p.id, p.name]));
  const prospectNames = new Map(prospects.map((p) => [p.id, p.name]));
  const out = new Map<string, RecentDispatch[]>();
  for (const row of flat) {
    const list = out.get(row.ruleKey) ?? [];
    const targetLabel = row.pharmacyId ? (pharmacyNames.get(row.pharmacyId) ?? null) : row.targetType === "Prospect" ? (prospectNames.get(row.targetId) ?? null) : null;
    list.push({ ...row, targetLabel });
    out.set(row.ruleKey, list);
  }
  return out;
}

/**
 * Les tuiles du centre des relances et la liste que chacune ouvre dans
 * l'historique des communications : le même filtre donne le chiffre et le
 * lien, la liste affiche donc exactement le chiffre de la tuile.
 */
export const RELANCES_TILES = {
  /** E-mails automatiques remis au prestataire (relances et cadence des contrats). */
  automaticEmailsSent: { type: "email", declencheur: "automatique", statut: "envoye", periode: "30j" },
  /** Alertes levées par le moteur pour l'équipe (une notification chacune). */
  internalAlerts: { type: "notification", declencheur: "automatique", periode: "30j" },
  /** Relances écartées : sans destinataire, sans information, ou déjà envoyées à la main. */
  skipped: { type: "relance", statut: "ignoree", periode: "30j" },
  /** E-mails automatiques en échec, plus les relances que le moteur n'a pas pu mener au bout. */
  automaticFailures: { declencheur: "automatique", statut: "echec", periode: "30j" },
  /** Relances de signature de contrat remises au prestataire (automatiques ou depuis le bouton « Relancer »). */
  contractRemindersSent: { type: "email", nature: "relance-contrat", statut: "envoye", periode: "30j" },
} as const satisfies Record<string, Record<string, string>>;

export type RelancesTile = keyof typeof RELANCES_TILES;

/** L'historique filtré comme la tuile. */
export function relancesTileHref(tile: RelancesTile): string {
  return `/admin/communications?${new URLSearchParams(RELANCES_TILES[tile]).toString()}`;
}

export type RelancesOverview = Record<RelancesTile, number> & {
  /** Contrats à signer : le filtre « À signer » du centre des contrats (dernière version, hors démonstration). */
  contractsAwaitingSignature: number;
  recentContractReminders: { id: string; createdAt: Date; recipient: string; status: string; trigger: string | null; pharmacyId: string | null; pharmacyName: string | null; prospectId: string | null }[];
};

/** Les chiffres du centre des relances, sur les 30 derniers jours. Rien d'estimé : les lignes que l'historique affiche, comptées. */
export async function loadRelancesOverview(now: Date): Promise<RelancesOverview> {
  const tiles = Object.keys(RELANCES_TILES) as RelancesTile[];
  const [tileCounts, contracts, recentReminders] = await Promise.all([
    Promise.all(
      tiles.map(async (tile) => {
        const filters = parseCommunicationFilters(RELANCES_TILES[tile]);
        return [tile, shownCount(await countCommunications(filters, now), filters.type)] as const;
      }),
    ),
    contractCounters(now),
    prisma.emailDispatch.findMany({ where: { kind: "CONTRACT_REMINDER" }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, createdAt: true, recipient: true, status: true, trigger: true, pharmacyId: true, prospectId: true } }),
  ]);
  const pharmacyIds = [...new Set(recentReminders.map((r) => r.pharmacyId).filter((id): id is string => Boolean(id)))];
  const pharmacies = pharmacyIds.length ? await prisma.pharmacy.findMany({ where: { id: { in: pharmacyIds } }, select: { id: true, name: true } }) : [];
  const names = new Map(pharmacies.map((p) => [p.id, p.name]));
  return {
    ...(Object.fromEntries(tileCounts) as Record<RelancesTile, number>),
    contractsAwaitingSignature: contracts["a-signer"],
    recentContractReminders: recentReminders.map((r) => ({ ...r, pharmacyName: r.pharmacyId ? (names.get(r.pharmacyId) ?? null) : null })),
  };
}
