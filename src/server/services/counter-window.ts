import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import type { AgentContext } from "@/server/services/stock-sync";
import { encryptField, decryptField } from "@/server/security/encryption";
import { getMessagingProvider } from "@/server/ai/registry";
import { traceDispatch } from "@/server/services/email-dispatch";
import { validatedRuleKeys } from "@/server/services/central-advice";
import { readCounterNotice } from "@/server/services/counter-notice";
import { activeChallengeTitlesFor } from "@/server/services/challenges";
import { nearestShortDatesFor } from "@/server/services/stock-lots";
import { buildPatientReport, maskEmail, parsePatientEmail } from "@/core/counter/patient-report";
import { outcomeOf, type NoticeOutcome } from "@/core/counter/notice";
import { zonedStartOfDay } from "@/core/performance/periods";

/**
 * La fenêtre du poste de caisse, côté serveur : ce que le pharmacien déclare pendant la vente, et ce qui se passe à « Vente terminée ».
 *
 * Trois règles tiennent tout :
 * - un conseil affiché n'est jamais une vente. Seul un clic « Vendu » le devient, et il est marqué COUNTER_DECLARED : une
 *   déclaration au comptoir, distincte d'une vente lue dans le logiciel de gestion (réservée : LGO_CONFIRMED) et d'une vente
 *   enregistrée dans PharmaBoost (Sale), que ce module ne touche jamais ;
 * - le collaborateur n'est pas identifiable depuis le poste : la décision porte le poste (« Comptoir 2 »), jamais un nom inventé ;
 * - rien ne part au patient sans son accord, saisi au comptoir, ni sans un produit retenu.
 */

export const COUNTER_DECLARED = "COUNTER_DECLARED";

type Failure = { ok: false; error: string };

/** Les statuts où le conseil peut encore changer de réponse depuis la fenêtre. */
const ANSWERABLE = new Set(["PROPOSED", "PRESENTED", "ACCEPTED", "MODIFIED", "PURCHASED", "DECLINED"]);

async function ownedSale(agent: AgentContext, prescriptionId: string) {
  return prisma.prescription.findFirst({
    where: { id: prescriptionId, pharmacyId: agent.scope.pharmacyId, source: "COUNTER_SCAN" },
    select: { id: true, counterPost: true, counterFollowUp: { select: { id: true, closedAt: true } } },
  });
}

async function ensureFollowUp(pharmacyId: string, prescriptionId: string): Promise<void> {
  await prisma.counterSaleFollowUp.upsert({ where: { prescriptionId }, create: { pharmacyId, prescriptionId }, update: {} });
}

/** Le début de la journée de l'officine, pour « le 18e conseil vendu aujourd'hui ». */
async function startOfOfficeDay(pharmacyId: string, now: Date): Promise<Date> {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { timezone: true } });
  return zonedStartOfDay(now, pharmacy?.timezone || "Europe/Paris");
}

/** Combien de conseils ont été déclarés vendus au comptoir aujourd'hui dans l'officine (celui qu'on vient de marquer compris). */
export async function soldTodayAtCounter(pharmacyId: string, now: Date = new Date()): Promise<number> {
  const since = await startOfOfficeDay(pharmacyId, now);
  return prisma.recommendation.count({ where: { pharmacyId, status: "PURCHASED", outcomeSource: COUNTER_DECLARED, decidedAt: { gte: since } } });
}


/** Le challenge actif et la date courte du produit conseillé, à l'instant de la réponse (vides s'il n'y en a pas). */
async function adviceContext(pharmacyId: string, recommendationId: string, now: Date): Promise<{ challenge: string | null; shortDateOn: string | null }> {
  try {
    const rec = await prisma.recommendation.findFirst({ where: { id: recommendationId, pharmacyId }, select: { productId: true, presentationId: true } });
    if (!rec) return { challenge: null, shortDateOn: null };
    const [challenges, shortDates] = await Promise.all([rec.productId ? activeChallengeTitlesFor(pharmacyId, [rec.productId], now) : Promise.resolve(new Map<string, string>()), nearestShortDatesFor(pharmacyId, now)]);
    const shortDate = rec.productId ? shortDates.get(`p:${rec.productId}`) : rec.presentationId ? shortDates.get(`d:${rec.presentationId}`) : undefined;
    return { challenge: rec.productId ? (challenges.get(rec.productId) ?? null) : null, shortDateOn: shortDate?.expiresOn ?? null };
  } catch (error) {
    console.error("[fenêtre du poste] contexte du conseil illisible", error);
    return { challenge: null, shortDateOn: null };
  }
}

export type DecisionResult = { ok: true; outcome: NoticeOutcome; changed: boolean } | Failure;

/**
 * « Vendu » / « Non vendu » (ou le retour en arrière « Pas de réponse ») pour un conseil de la vente en cours.
 * Une vente lue dans PharmaBoost (Sale) n'est jamais réécrite d'ici.
 */
export async function decideCounterAdvice(agent: AgentContext, input: { prescriptionId: string; recommendationId: string; outcome: NoticeOutcome }): Promise<DecisionResult> {
  const sale = await ownedSale(agent, input.prescriptionId);
  if (!sale) return { ok: false, error: "Vente inconnue pour ce poste." };
  if (sale.counterFollowUp?.closedAt) return { ok: false, error: "Cette vente est terminée." };
  const rec = await prisma.recommendation.findFirst({
    where: { id: input.recommendationId, prescriptionId: sale.id, pharmacyId: agent.scope.pharmacyId },
    select: { id: true, status: true, outcomeSource: true, _count: { select: { saleLines: true } } },
  });
  if (!rec) return { ok: false, error: "Conseil inconnu pour cette vente." };
  if (!ANSWERABLE.has(rec.status)) return { ok: false, error: "Ce conseil n'est plus actif." };
  if (rec.status === "PURCHASED" && (rec.outcomeSource !== COUNTER_DECLARED || rec._count.saleLines > 0)) {
    return { ok: false, error: "Ce conseil est lié à une vente enregistrée dans PharmaBoost : il ne se modifie plus d'ici." };
  }
  const current = outcomeOf(rec.status);
  if (current === input.outcome) return { ok: true, outcome: current, changed: false };

  const post = (sale.counterPost ?? "poste").slice(0, 60);
  const now = new Date();
  // Ce que le pharmacien avait sous les yeux à cet instant (challenge, date courte) est gardé tel quel dans l'historique :
  // les statistiques ne le reconstituent jamais après coup.
  const context = input.outcome === "NONE" ? {} : await adviceContext(agent.scope.pharmacyId, input.recommendationId, now);
  const status = input.outcome === "SOLD" ? "PURCHASED" : input.outcome === "NOT_SOLD" ? "DECLINED" : "PROPOSED";
  const eventType = input.outcome === "SOLD" ? "PURCHASED" : input.outcome === "NOT_SOLD" ? "DECLINED_BY_PATIENT" : "REOPENED";
  await prisma.$transaction(async (tx) => {
    await tx.recommendation.update({
      where: { id: rec.id },
      data:
        input.outcome === "NONE"
          ? { status, decidedByUserId: null, decidedAt: null, outcomeSource: null, outcomePost: null }
          : { status, decidedByUserId: null, decidedAt: now, outcomeSource: COUNTER_DECLARED, outcomePost: post },
    });
    await tx.recommendationEvent.create({ data: { recommendationId: rec.id, type: eventType, userId: null, metadata: { source: COUNTER_DECLARED, post, previousStatus: rec.status, ...context } as never } });
  });
  await ensureFollowUp(agent.scope.pharmacyId, sale.id);
  await recordAudit({ action: "counter_window.advice_decided", entityType: "Recommendation", entityId: rec.id, pharmacyId: agent.scope.pharmacyId, metadata: { outcome: input.outcome, source: COUNTER_DECLARED, post, previousStatus: rec.status, prescriptionId: sale.id } });
  return { ok: true, outcome: input.outcome, changed: true };
}

export type EmailResult = { ok: true; saved: boolean } | Failure;

/**
 * L'adresse e-mail du patient, saisie au comptoir. Elle n'est enregistrée qu'avec son accord explicite (`consent: true`), chiffrée,
 * et ne sert qu'au bilan de cette vente. Vide + accord : l'adresse est retirée.
 */
export async function saveCounterEmail(agent: AgentContext, input: { prescriptionId: string; email: string | null; consent: boolean }): Promise<EmailResult> {
  const sale = await ownedSale(agent, input.prescriptionId);
  if (!sale) return { ok: false, error: "Vente inconnue pour ce poste." };
  if (sale.counterFollowUp?.closedAt) return { ok: false, error: "Cette vente est terminée." };
  const post = (sale.counterPost ?? "poste").slice(0, 60);
  if (!input.email) {
    await prisma.counterSaleFollowUp.upsert({
      where: { prescriptionId: sale.id },
      create: { pharmacyId: agent.scope.pharmacyId, prescriptionId: sale.id },
      update: { emailEncrypted: null, consentAt: null, consentPost: null },
    });
    await recordAudit({ action: "counter_window.email_saved", entityType: "Prescription", entityId: sale.id, pharmacyId: agent.scope.pharmacyId, metadata: { removed: true, post } });
    return { ok: true, saved: false };
  }
  if (!input.consent) return { ok: false, error: "Le patient doit donner son accord avant d'enregistrer son adresse." };
  const parsed = parsePatientEmail(input.email);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const encrypted = encryptField(parsed.email);
  if (!encrypted) return { ok: false, error: "L'adresse n'a pas pu être protégée : elle n'est pas enregistrée." };
  const now = new Date();
  await prisma.counterSaleFollowUp.upsert({
    where: { prescriptionId: sale.id },
    create: { pharmacyId: agent.scope.pharmacyId, prescriptionId: sale.id, emailEncrypted: encrypted, consentAt: now, consentPost: post },
    update: { emailEncrypted: encrypted, consentAt: now, consentPost: post },
  });
  await recordAudit({ action: "counter_window.email_saved", entityType: "Prescription", entityId: sale.id, pharmacyId: agent.scope.pharmacyId, metadata: { email: maskEmail(parsed.email), consent: true, post } });
  return { ok: true, saved: true };
}

export type FinishResult =
  | {
      ok: true;
      alreadyClosed: boolean;
      proposed: number;
      sold: number;
      notSold: number;
      unanswered: number;
      /** Le rang du dernier conseil vendu aujourd'hui, seulement quand un conseil a réellement été déclaré vendu dans CETTE vente. */
      soldToday: number | null;
      report: "SENT" | "SIMULATED" | "FAILED" | "NONE";
    }
  | Failure;

/**
 * « Vente terminée » : tout est enregistré (vendu / non vendu / sans réponse), les conseils restés sans réponse passent « sans
 * réponse », et le bilan part au patient s'il a donné son accord, avec seulement les produits déclarés vendus. Rejouable sans effet :
 * une vente déjà terminée renvoie son résumé et n'envoie rien une seconde fois.
 */
export async function finishCounterSale(agent: AgentContext, input: { prescriptionId: string }): Promise<FinishResult> {
  const sale = await ownedSale(agent, input.prescriptionId);
  if (!sale) return { ok: false, error: "Vente inconnue pour ce poste." };
  const now = new Date();
  const pharmacyId = agent.scope.pharmacyId;
  const post = (sale.counterPost ?? "poste").slice(0, 60);

  // Ce que le pharmacien avait sous les yeux : exactement les conseils de la fenêtre, pas ceux que le moteur a gardés en réserve.
  const read = await readCounterNotice(pharmacyId, sale.id, now);
  const items = read?.notice.items ?? [];
  const ids = items.map((item) => item.id).filter((value): value is string => Boolean(value));
  const sold = items.filter((item) => item.outcome === "SOLD");
  const notSold = items.filter((item) => item.outcome === "NOT_SOLD");
  const unanswered = items.filter((item) => item.outcome === "NONE");

  // La vente se ferme UNE seule fois, même si « Vente terminée » arrive deux fois en même temps (double clic, nouvel essai après une
  // coupure, deux postes) : la fermeture est réservée d'un seul coup, et seul celui qui l'a obtenue enregistre et envoie le bilan.
  await ensureFollowUp(pharmacyId, sale.id);
  const claimed = await prisma.counterSaleFollowUp.updateMany({ where: { prescriptionId: sale.id, closedAt: null }, data: { closedAt: now, closedPost: post } });
  if (claimed.count === 0) {
    const existing = await prisma.counterSaleFollowUp.findUnique({ where: { prescriptionId: sale.id } });
    const report = existing?.reportStatus === "SENT" || existing?.reportStatus === "SIMULATED" || existing?.reportStatus === "FAILED" ? existing.reportStatus : "NONE";
    return { ok: true, alreadyClosed: true, proposed: existing?.proposedCount ?? 0, sold: existing?.soldCount ?? 0, notSold: existing?.notSoldCount ?? 0, unanswered: existing?.unansweredCount ?? 0, soldToday: null, report };
  }

  await prisma.$transaction(async (tx) => {
    // Sans réponse : comme à la fin d'une vente enregistrée, c'est un résultat à part entière, distinct d'un refus.
    const pending = ids.length ? await tx.recommendation.findMany({ where: { id: { in: ids }, pharmacyId, status: "PROPOSED" }, select: { id: true } }) : [];
    if (pending.length > 0) {
      await tx.recommendation.updateMany({ where: { id: { in: pending.map((rec) => rec.id) } }, data: { status: "IGNORED" } });
      await tx.recommendationEvent.createMany({ data: pending.map((rec) => ({ recommendationId: rec.id, type: "IGNORED" as const, userId: null, metadata: { source: COUNTER_DECLARED, post } as never })) });
    }
    await tx.counterSaleFollowUp.update({
      where: { prescriptionId: sale.id },
      data: { closedPost: post, proposedCount: items.length, soldCount: sold.length, notSoldCount: notSold.length, unansweredCount: unanswered.length },
    });
  });

  // Le bilan : accord + adresse + au moins un produit déclaré vendu. Sinon rien ne part, et le résumé le dit.
  let report: "SENT" | "SIMULATED" | "FAILED" | "NONE" = "NONE";
  const followUp = await prisma.counterSaleFollowUp.findUnique({ where: { prescriptionId: sale.id }, select: { emailEncrypted: true, consentAt: true } });
  const email = followUp?.consentAt ? decryptField(followUp.emailEncrypted) : null;
  if (email && sold.length > 0) {
    report = await sendPatientReport({ agent, prescriptionId: sale.id, email, soldIds: sold.map((item) => item.id).filter((value): value is string => Boolean(value)), fallbackNames: sold.map((item) => item.name) });
  }
  await prisma.counterSaleFollowUp.update({ where: { prescriptionId: sale.id }, data: { reportStatus: report, reportSentAt: report === "NONE" ? null : now } });

  const soldToday = sold.length > 0 ? await soldTodayAtCounter(pharmacyId, now) : null;
  await recordAudit({ action: "counter_window.sale_finished", entityType: "Prescription", entityId: sale.id, pharmacyId, metadata: { post, proposed: items.length, sold: sold.length, notSold: notSold.length, unanswered: unanswered.length, report } });
  return { ok: true, alreadyClosed: false, proposed: items.length, sold: sold.length, notSold: notSold.length, unanswered: unanswered.length, soldToday, report };
}

/**
 * Le bilan professionnel envoyé au patient. Les produits sont ceux déclarés vendus ; leur phrase « patient » n'est reprise que si
 * la règle qui les a proposés est validée par le pharmacien de PharmaBoost. Le journal des e-mails ne garde que l'adresse masquée.
 */
async function sendPatientReport(input: { agent: AgentContext; prescriptionId: string; email: string; soldIds: string[]; fallbackNames: string[] }): Promise<"SENT" | "SIMULATED" | "FAILED" | "NONE"> {
  const { agent } = input;
  const pharmacyId = agent.scope.pharmacyId;
  const [pharmacy, recs, validated] = await Promise.all([
    prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { name: true, isDemo: true } }),
    prisma.recommendation.findMany({
      where: { id: { in: input.soldIds }, pharmacyId },
      select: { patientReason: true, opportunity: { select: { ruleKey: true } }, product: { select: { name: true } }, presentation: { select: { specialty: { select: { name: true } } } } },
    }),
    validatedRuleKeys(),
  ]);
  const products = recs.map((rec) => ({
    name: (rec.product?.name ?? rec.presentation?.specialty.name ?? "").replace(/,.*$/, "").trim(),
    reason: rec.opportunity?.ruleKey && validated.has(rec.opportunity.ruleKey) ? rec.patientReason : null,
  }));
  const mail = buildPatientReport({ pharmacyName: pharmacy?.name ?? "", products: products.length ? products : input.fallbackNames.map((name) => ({ name, reason: null })) });
  if (!mail) return "NONE";
  const messaging = getMessagingProvider({ demo: pharmacy?.isDemo === true });
  const outcome = await messaging
    .sendEmail({ to: input.email, fromName: pharmacy?.name || "PharmaBoost", subject: mail.subject, text: mail.text, html: mail.html })
    .catch((error: unknown) => ({ status: "FAILED" as const, provider: messaging.info.id, detail: error instanceof Error ? error.message : "Envoi impossible." }));
  await traceDispatch({ kind: "PATIENT_REPORT", recipient: maskEmail(input.email), outcome, subject: mail.subject, trigger: "SYSTEM", pharmacyId });
  await recordAudit({ action: "counter_window.patient_report_sent", entityType: "Prescription", entityId: input.prescriptionId, pharmacyId, metadata: { kind: "patient_report", to: maskEmail(input.email), status: outcome.status, provider: outcome.provider } });
  return outcome.status === "SENT" ? "SENT" : outcome.status === "SIMULATED" ? "SIMULATED" : "FAILED";
}
