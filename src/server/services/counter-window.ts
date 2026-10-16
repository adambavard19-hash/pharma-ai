import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import type { AgentContext } from "@/server/services/stock-sync";
import { encryptField, decryptField } from "@/server/security/encryption";
import { getMessagingProvider } from "@/server/ai/registry";
import { traceDispatch } from "@/server/services/email-dispatch";
import { loadCentralRuleRows, validatedRuleKeys } from "@/server/services/central-advice";
import { readCounterNotice } from "@/server/services/counter-notice";
import { activeChallengeTitlesFor } from "@/server/services/challenges";
import { nearestShortDatesFor } from "@/server/services/stock-lots";
import type { Prisma } from "@/generated/prisma";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { customRulesFrom, overriddenRulesFrom } from "@/core/ai/central-advice";
import { patientCardsFor } from "@/server/services/patient-cards";
import { planCureReminders, scheduleCureReminders, isOptedOut as isCureOptedOut } from "@/server/services/cure-reminders";
import { reminderDay } from "@/core/cure/cure";
import { buildPatientReport, maskEmail, parsePatientEmail, patientSafeLine, patientSafeReason, type ReportLeaflet } from "@/core/counter/patient-report";
import { ensureLeaflet, leafletsFor } from "@/server/services/product-leaflets";
import { leafletKey } from "@/core/leaflet/leaflet";
import { getEnv } from "@/config/env";
import { counterEmailPurgeCutoff } from "@/core/counter/email-retention";
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
 * - rien ne part au patient sans son accord, saisi au comptoir, ni sans un produit retenu ; et son adresse ne sert qu'à ce bilan :
 *   effacée à « Vente terminée », ou par le passage quotidien si la vente n'est jamais terminée (voir core/counter/email-retention.ts).
 */

export const COUNTER_DECLARED = "COUNTER_DECLARED";

type Failure = { ok: false; error: string };

/** Les statuts où le conseil peut encore changer de réponse depuis la fenêtre. */
const ANSWERABLE = new Set(["PROPOSED", "PRESENTED", "ACCEPTED", "MODIFIED", "PURCHASED", "DECLINED"]);

async function ownedSale(agent: AgentContext, prescriptionId: string) {
  return prisma.prescription.findFirst({
    where: { id: prescriptionId, pharmacyId: agent.scope.pharmacyId, source: "COUNTER_SCAN" },
    select: { id: true, counterPost: true, handledByUserId: true, counterFollowUp: { select: { id: true, closedAt: true } } },
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
export async function decideCounterAdvice(agent: AgentContext, input: { prescriptionId: string; recommendationId: string; outcome: NoticeOutcome; via?: "SCAN" }): Promise<DecisionResult> {
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
          : { status, decidedByUserId: sale.handledByUserId ?? null, decidedAt: now, outcomeSource: COUNTER_DECLARED, outcomePost: post },
    });
    await tx.recommendationEvent.create({ data: { recommendationId: rec.id, type: eventType, userId: input.outcome === "NONE" ? null : (sale.handledByUserId ?? null), metadata: { source: COUNTER_DECLARED, post, previousStatus: rec.status, ...(input.via ? { via: input.via } : {}), ...context } as never } });
  });
  await ensureFollowUp(agent.scope.pharmacyId, sale.id);
  await recordAudit({ action: "counter_window.advice_decided", entityType: "Recommendation", entityId: rec.id, pharmacyId: agent.scope.pharmacyId, metadata: { outcome: input.outcome, source: COUNTER_DECLARED, post, previousStatus: rec.status, prescriptionId: sale.id, ...(input.via ? { via: input.via } : {}) } });
  return { ok: true, outcome: input.outcome, changed: true };
}

export type EmailResult = { ok: true; saved: boolean } | Failure;

/**
 * L'adresse e-mail du patient, saisie au comptoir. Elle n'est enregistrée qu'avec son accord explicite (`consent: true`), chiffrée,
 * et ne sert qu'au bilan de cette vente : « Vente terminée » l'efface. Vide + accord : l'adresse est retirée.
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
 * réponse », et le bilan part au patient s'il a donné son accord, avec seulement les produits déclarés vendus ; puis son adresse
 * est effacée, quelle que soit l'issue. Rejouable sans effet : une vente déjà terminée renvoie son résumé et n'envoie rien une
 * seconde fois.
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
  // Un conseil que personne n'a bipé ni marqué « Vendu » n'a pas été vendu (fondateur, 16 oct. 2026 : « s'il ne le scanne pas,
  // ça fait non vendu ») : il compte avec les refus, et rien ne reste « sans réponse ».
  const notSold = items.filter((item) => item.outcome === "NOT_SOLD" || item.outcome === "NONE");
  const unanswered: typeof items = [];

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
    // Sans réponse : le conseil n'a été ni bipé ni marqué « Vendu » — il est « Non vendu », daté de la fin de la vente.
    const pending = ids.length ? await tx.recommendation.findMany({ where: { id: { in: ids }, pharmacyId, status: "PROPOSED" }, select: { id: true } }) : [];
    if (pending.length > 0) {
      await tx.recommendation.updateMany({ where: { id: { in: pending.map((rec) => rec.id) } }, data: { status: "DECLINED", decidedByUserId: sale.handledByUserId ?? null, decidedAt: now, outcomeSource: COUNTER_DECLARED, outcomePost: post } });
      await tx.recommendationEvent.createMany({ data: pending.map((rec) => ({ recommendationId: rec.id, type: "DECLINED_BY_PATIENT" as const, userId: null, metadata: { source: COUNTER_DECLARED, post, via: "NOT_SCANNED", previousStatus: "PROPOSED" } as never })) });
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
  let curesScheduled = 0;
  if (email && sold.length > 0) {
    try {
      const soldIds = sold.map((item) => item.id).filter((value): value is string => Boolean(value));
      // Les rappels de fin de cure (17 oct. 2026) : les compléments en cure vendus, annoncés dans le bilan, programmés s'il part.
      // Un incident ici ne retient jamais le bilan : il part alors sans rappel.
      const cures = await (async () => {
        const pharmacyRow = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { isDemo: true } });
        return pharmacyRow?.isDemo || (await isCureOptedOut(email)) ? [] : await planCureReminders(pharmacyId, soldIds, now);
      })().catch(() => []);
      report = await sendPatientReport({ agent, prescriptionId: sale.id, email, soldIds, fallbackNames: sold.map((item) => item.name), cures: cures.map((cure) => ({ name: cure.productName, day: reminderDay(cure.sendAt) })) });
      if (cures.length > 0 && (report === "SENT" || report === "SIMULATED")) {
        curesScheduled = await scheduleCureReminders({ pharmacyId, prescriptionId: sale.id, email, plans: cures, soldAt: now }).catch((error: unknown) => {
          console.error("[rappels de cure] programmation", error);
          return 0;
        });
      }
    } catch (error) {
      // Un envoi qui casse en route (base, journal) : la vente est déjà fermée et ne renverra jamais rien, l'adresse n'a plus
      // aucun usage. Elle est effacée quand même ; l'issue du bilan, elle, reste inconnue plutôt que devinée.
      await prisma.counterSaleFollowUp.update({ where: { prescriptionId: sale.id }, data: { emailEncrypted: null } }).catch(() => undefined);
      throw error;
    }
  }
  // L'adresse n'a servi qu'à ce bilan : elle est effacée dans la même écriture que son issue, qu'il soit parti, simulé, en échec
  // ou qu'il n'y ait rien eu à envoyer. L'accord (date et poste) reste : il ne désigne personne et dit que l'envoi était demandé.
  await prisma.counterSaleFollowUp.update({ where: { prescriptionId: sale.id }, data: { reportStatus: report, reportSentAt: report === "NONE" ? null : now, emailEncrypted: null } });

  const soldToday = sold.length > 0 ? await soldTodayAtCounter(pharmacyId, now) : null;
  await recordAudit({ action: "counter_window.sale_finished", entityType: "Prescription", entityId: sale.id, pharmacyId, metadata: { post, proposed: items.length, sold: sold.length, notSold: notSold.length, unanswered: unanswered.length, report, emailErased: Boolean(followUp?.emailEncrypted), curesScheduled } });
  return { ok: true, alreadyClosed: false, proposed: items.length, sold: sold.length, notSold: notSold.length, unanswered: unanswered.length, soldToday, report };
}

/**
 * Le modèle de la phrase « patient » de chaque règle demandée, tel que la règle l'écrit (avec `{drug}` et `{product}`) : celui du
 * code, ou, pour un conseil ajouté depuis la console ou accepté depuis la base de connaissances, celui que sa définition garde en
 * base (sa phrase patient, sinon sa raison courte : exactement ce que le moteur a rendu). Une règle introuvable n'a pas de
 * modèle, et sa phrase ne part pas.
 */
async function patientReasonTemplates(ruleKeys: ReadonlySet<string>): Promise<Map<string, { template: string; benefits: string[] }>> {
  const templates = new Map<string, { template: string; benefits: string[] }>();
  for (const rule of ADVICE_RULES) if (ruleKeys.has(rule.key)) templates.set(rule.key, { template: rule.patientReasonTemplate, benefits: rule.benefits ?? [] });
  // La table centrale est relue dès qu'une règle est en jeu : un conseil ajouté, ou une règle du code MODIFIÉE depuis la console
  // (sa phrase patient est celle de la modification — exactement ce que le moteur a rendu).
  if (ruleKeys.size > 0) {
    const rows = (await loadCentralRuleRows()).filter((row) => ruleKeys.has(row.ruleKey));
    for (const rule of [...customRulesFrom(rows), ...overriddenRulesFrom(rows)]) templates.set(rule.key, { template: rule.patientReasonTemplate, benefits: rule.benefits ?? [] });
  }
  return templates;
}

/** L'adresse publique du site, pour les images du bilan (une messagerie ne charge que du https). */
function emailAssetBase(): string {
  try {
    const env = getEnv();
    const url = env.PUBLIC_APP_URL ?? env.APP_URL;
    return /^https:\/\//.test(url) ? url : "https://pharmaboost.app";
  } catch {
    // Configuration illisible : le bilan part quand même, avec les images du site public.
    return "https://pharmaboost.app";
  }
}

/** La notice d'un produit pour le bilan, passée au même verrou que le reste (rien qui nomme ce que la pharmacie a délivré). */
function leafletForReport(row: { indications: string | null; posology: string | null; duration: string | null; sourceUrl: string | null; sourceKind: string | null } | undefined, safe: (line: string) => string | null): ReportLeaflet | null {
  if (!row) return null;
  const pass = (value: string | null) => (value ? safe(value) : null);
  return { indications: pass(row.indications), posology: pass(row.posology), duration: pass(row.duration), sourceUrl: row.sourceUrl, sourceLabel: row.sourceKind === "BDPM" ? "base de données publique des médicaments" : "site officiel du fabricant" };
}

/**
 * Le bilan professionnel envoyé au patient. Les produits sont ceux déclarés vendus ; leur phrase « patient » n'est reprise que si
 * la règle qui les a proposés est validée par le pharmacien de PharmaBoost ET qu'elle ne peut pas nommer ce qui a été délivré
 * (`patientSafeReason`) : sinon le produit part seul. Le journal des e-mails ne garde que l'adresse masquée.
 */
async function sendPatientReport(input: { agent: AgentContext; prescriptionId: string; email: string; soldIds: string[]; fallbackNames: string[]; cures?: { name: string; day: string }[] }): Promise<"SENT" | "SIMULATED" | "FAILED" | "NONE"> {
  const { agent } = input;
  const pharmacyId = agent.scope.pharmacyId;
  const [pharmacy, recs, validated, lines] = await Promise.all([
    prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { name: true, isDemo: true, brandColor: true, logoUrl: true, phone: true, addressLine1: true, addressLine2: true, postalCode: true, city: true } }),
    prisma.recommendation.findMany({
      where: { id: { in: input.soldIds }, pharmacyId },
      select: { patientReason: true, shortReason: true, opportunity: { select: { ruleKey: true, triggeredLineIds: true } }, product: { select: { name: true, brand: true, category: true, matchingTags: true, description: true, commercialClaims: true, imageUrl: true, precautions: true, ean: true } }, presentation: { select: { specialty: { select: { name: true, cisCode: true } } } } },
    }),
    validatedRuleKeys(),
    // Ce que la vente a délivré, pour qu'aucune phrase du bilan ne le nomme : le nom lu au scan, la spécialité et ses substances.
    prisma.prescriptionLine.findMany({
      where: { prescriptionId: input.prescriptionId, prescription: { pharmacyId } },
      select: { id: true, drugName: true, specialty: { select: { name: true, compositions: { select: { substanceLabel: true } } } } },
    }),
  ]);
  // La fiche patient de chaque produit (17 oct. 2026) : le lien avec le traitement, les points clés, les gestes — rédigée par le
  // modèle pour ce produit et le médicament qui l'a appelé, en parallèle des notices, dans le même délai.
  const forbidden = lines.flatMap((line) => [line.drugName, line.specialty?.name ?? "", ...(line.specialty?.compositions.map((composition) => composition.substanceLabel) ?? [])]).filter((text): text is string => Boolean(text));
  const cardTargets = recs.map((rec) => {
    const trigger = lines.find((line) => rec.opportunity?.triggeredLineIds?.includes(line.id)) ?? lines[0];
    const name = rec.product?.name ?? rec.presentation?.specialty.name ?? "";
    return {
      ean: rec.product?.ean ?? null,
      forbidden,
      request: {
        product: { name, brand: rec.product?.brand ?? null, category: rec.product?.category ?? null, tags: rec.product?.matchingTags ?? [], description: rec.product?.description ?? null, claims: rec.product?.commercialClaims ?? [], precautions: rec.product?.precautions ?? [] },
        treatment: { drug: trigger?.drugName ?? "", family: null, reason: rec.shortReason ?? null },
      },
    };
  });
  const cardsJob = patientCardsFor({ organizationId: agent.scope.organizationId, pharmacyId }, cardTargets.filter((target) => target.request.treatment.drug), { demo: pharmacy?.isDemo === true, timeoutMs: 20_000 }).catch(() => []);
  const sale = lines.map((line) => ({ names: [line.drugName, line.specialty?.name], substances: line.specialty?.compositions.map((composition) => composition.substanceLabel) ?? [] }));
  const validatedKeys = new Set(recs.map((rec) => rec.opportunity?.ruleKey).filter((key): key is string => Boolean(key) && validated.has(key as string)));
  const templates = validatedKeys.size > 0 ? await patientReasonTemplates(validatedKeys) : new Map<string, { template: string; benefits: string[] }>();
  // Les notices officielles des produits vendus : lues d'avance après l'analyse ; une notice qui manque est cherchée maintenant,
  // 20 secondes au plus, pour que le bilan parte toujours.
  const leafletTargets = recs.map((rec) => ({ name: rec.product?.name ?? rec.presentation?.specialty.name ?? "", ean: rec.product?.ean ?? null, cisCode: rec.presentation?.specialty.cisCode ?? null }));
  let leaflets: Awaited<ReturnType<typeof leafletsFor>> = new Map();
  try {
    leaflets = await leafletsFor(leafletTargets);
    const missing = leafletTargets.filter((target) => { const key = leafletKey(target); return key && !leaflets.has(key); });
    if (missing.length > 0) {
      await Promise.race([Promise.all(missing.map((target) => ensureLeaflet(target).catch(() => undefined))), new Promise((resolve) => setTimeout(resolve, 20_000))]);
      leaflets = await leafletsFor(leafletTargets);
    }
  } catch {
    // Une notice est un plus : le bilan part toujours, sans elle si besoin.
  }
  const cardsDone = await cardsJob;
  const withDrug = cardTargets.map((target) => Boolean(target.request.treatment.drug));
  let cardCursor = 0;
  const cards = withDrug.map((has) => (has ? (cardsDone[cardCursor++] ?? null) : null));
  const products = recs.map((rec, index) => {
    const fullName = rec.product?.name ?? rec.presentation?.specialty.name ?? "";
    const ruleKey = rec.opportunity?.ruleKey ?? null;
    const rule = ruleKey && validatedKeys.has(ruleKey) ? templates.get(ruleKey) : undefined;
    // Chaque ligne ajoutée passe le même verrou que la phrase patient : rien qui nomme ce que la pharmacie a délivré.
    const safe = (line: string) => patientSafeLine({ line, productName: fullName, sale });
    return {
      name: fullName.replace(/,.*$/, "").trim(),
      reason: rule ? patientSafeReason({ reason: rec.patientReason, template: rule.template, productName: fullName, sale }) : null,
      imageUrl: rec.product?.imageUrl ?? null,
      // Les mots-clés de la règle VALIDÉE (écrits et relus) ; les précautions d'emploi que la pharmacie a saisies sur sa fiche produit.
      benefits: (rule?.benefits ?? []).map(safe).filter((line): line is string => line !== null),
      precautions: (rec.product?.precautions ?? []).map(safe).filter((line): line is string => line !== null),
      leaflet: leafletForReport(leaflets.get(leafletKey(leafletTargets[index]) ?? ""), safe),
      card: cards[index] ?? null,
    };
  });
  const mail = buildPatientReport({
    pharmacy: pharmacy ? { name: pharmacy.name, brandColor: pharmacy.brandColor, logoUrl: pharmacy.logoUrl, phone: pharmacy.phone, addressLine1: pharmacy.addressLine1, addressLine2: pharmacy.addressLine2, postalCode: pharmacy.postalCode, city: pharmacy.city } : { name: "" },
    products: products.length ? products : input.fallbackNames.map((name) => ({ name, reason: null })),
    assetBaseUrl: emailAssetBase(),
    date: new Date(),
    cures: input.cures,
  });
  if (!mail) return "NONE";
  const messaging = getMessagingProvider({ demo: pharmacy?.isDemo === true });
  const outcome = await messaging
    .sendEmail({ to: input.email, fromName: pharmacy?.name || "PharmaBoost", subject: mail.subject, text: mail.text, html: mail.html })
    .catch((error: unknown) => ({ status: "FAILED" as const, provider: messaging.info.id, detail: error instanceof Error ? error.message : "Envoi impossible." }));
  await traceDispatch({ kind: "PATIENT_REPORT", recipient: maskEmail(input.email), outcome, subject: mail.subject, trigger: "SYSTEM", pharmacyId });
  await recordAudit({ action: "counter_window.patient_report_sent", entityType: "Prescription", entityId: input.prescriptionId, pharmacyId, metadata: { kind: "patient_report", to: maskEmail(input.email), status: outcome.status, provider: outcome.provider } });
  return outcome.status === "SENT" ? "SENT" : outcome.status === "SIMULATED" ? "SIMULATED" : "FAILED";
}

/**
 * Les suivis dont l'adresse a fait son temps : donnée il y a plus de COUNTER_EMAIL_PURGE_AFTER_HOURS heures, vente terminée ou non.
 * Une adresse sans accord ne devrait pas exister (l'adresse et l'accord s'écrivent ensemble) ; si elle existe, son âge se lit à la
 * dernière écriture du suivi, et elle part aussi.
 */
export function counterEmailPurgeWhere(now: Date): Prisma.CounterSaleFollowUpWhereInput {
  const cutoff = counterEmailPurgeCutoff(now);
  return { emailEncrypted: { not: null }, OR: [{ consentAt: { lt: cutoff } }, { consentAt: null, updatedAt: { lt: cutoff } }] };
}

/** Une écriture du passage quotidien efface au plus ce nombre d'adresses ; quelques écritures suffisent à vider une journée. */
const EMAIL_PURGE_BATCH = 2_000;
const EMAIL_PURGE_MAX_BATCHES = 10;

/**
 * Le passage quotidien efface les adresses des ventes qui n'ont jamais été terminées, et en filet celles qu'un incident aurait
 * laissées sur une vente terminée (effacement en échec, adresse arrivée au moment même de la fermeture) : sans lui, elles
 * resteraient en base pour toujours. Rejouable : une adresse effacée ne correspond plus. Une seule requête par lot, sans rien lire
 * ni déchiffrer ; une base très en retard est rattrapée au passage suivant, jamais dans une boucle sans fin.
 */
export async function purgeCounterEmails(now: Date): Promise<{ erased: number; moreToDo: boolean }> {
  const where = counterEmailPurgeWhere(now);
  let erased = 0;
  for (let batch = 0; batch < EMAIL_PURGE_MAX_BATCHES; batch += 1) {
    const { count } = await prisma.counterSaleFollowUp.updateMany({ where, data: { emailEncrypted: null }, limit: EMAIL_PURGE_BATCH });
    erased += count;
    if (count < EMAIL_PURGE_BATCH) return { erased, moreToDo: false };
  }
  return { erased, moreToDo: true };
}
