import { boxExpiry } from "@/core/counter/box-expiry";
import "server-only";
import { studioPhotoUrl } from "@/core/catalog/studio-photo";
import { prisma } from "@/server/db/client";
import { buildCounterNotice, type CounterNotice } from "@/core/counter/notice";
import { stockReminderLevel } from "@/core/stock-deposit/rules";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { answersFromRows, treeState } from "@/core/counter/tree-state";
import { TREE_RULE_KEYS } from "@/core/counter/question-tree";
import { counterSheetOf, routineStepOf, withoutOriginLabel } from "@/core/counter/advice-sheet";
import { parseSuggestionVigilances } from "@/config/vigilances";
import { loadCentralAdvice } from "@/server/services/central-advice";
import { activeChallengeTitlesFor, activeChallengesFor } from "@/server/services/challenges";
import { nearestShortDatesFor } from "@/server/services/stock-lots";
import { trustedRobotRuleKeys } from "@/server/services/robot-trust";
import { unitMarginHt } from "@/core/catalog/margin";
import { answersForSheet, pitchesFor, pitchKey, stockCandidates } from "@/server/services/counter-pitches";
import type { CounterSheetAnswer } from "../../../agent/src/counter-sheet";

/** Vrai quand le prix de vente HT est sous le prix d'achat HT : le fichier de stock a été mal lu, pas une vraie vente à perte. */
function salePriceLooksWrong(product: { salePriceCents: number; purchasePriceCents: number; vatRate: number | null }): boolean {
  const margin = unitMarginHt(product);
  return margin !== null && margin.marginCents < 0;
}

/**
 * Ce que la fenêtre du poste de caisse affiche pour une vente bipée, lu en base : les alertes, les conseils (avec le médicament
 * concerné, la photo, le stock, un éventuel challenge, une date courte réelle) et l'état du suivi de la vente (adresse du
 * patient enregistrée ? vente terminée ?). `null` quand la vente n'est pas celle de cette officine.
 */
export type CounterSaleRead = {
  status: string;
  notice: CounterNotice;
  followUp: { emailSaved: boolean; closed: boolean };
};

/** Une boîte arrivée plus tard que cela après la précédente : peut-être le client suivant (« C'est un autre client ? »). */
export const LATE_BOX_MS = 30 * 1000;

/**
 * Les boîtes bipées, pour « Retirer » sur la bannière du poste : dès le bip, analyse finie ou non. La DERNIÈRE boîte, arrivée plus
 * de 30 secondes après la précédente, est marquée `late` : la bannière demande si c'est un autre client.
 */
const boxesOf = (lines: { id: string; drugName: string | null; createdAt: Date; expiresOn?: Date | null }[], challenges: Map<string, { title: string; reward: string }> = new Map(), now = new Date()) => {
  const named = lines.filter((line) => line.drugName);
  const byTime = [...named].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const last = byTime[byTime.length - 1];
  const before = byTime[byTime.length - 2];
  const lateId = last && before && last.createdAt.getTime() - before.createdAt.getTime() > LATE_BOX_MS ? last.id : null;
  // La péremption lue dans le Datamatrix : seulement une boîte périmée, ou qui périme dans le mois (voir box-expiry.ts).
  return named.map((line) => ({ id: line.id, name: line.drugName ?? "", challenge: challenges.get(line.id)?.title ?? null, reward: challenges.get(line.id)?.reward ?? null, late: line.id === lateId, expiry: boxExpiry(line.expiresOn, now) }));
};

/** Les boîtes scannées qui sont en challenge (un produit du stock, retrouvé par son code-barres) : ligne → challenge. */
async function boxChallenges(pharmacyId: string, lines: { id: string; rawText: string | null; drugSpecialtyId: string | null }[], now: Date): Promise<Map<string, { title: string; reward: string }>> {
  const byEan = lines.filter((line) => line.rawText && !line.drugSpecialtyId);
  if (byEan.length === 0) return new Map();
  const products = await prisma.product.findMany({ where: { pharmacyId, ean: { in: byEan.map((line) => line.rawText as string) } }, select: { id: true, ean: true } });
  const challenges = await activeChallengesFor(pharmacyId, products.map((product) => product.id), now).catch(() => new Map<string, { title: string; reward: string }>());
  const found = new Map<string, { title: string; reward: string }>();
  for (const line of byEan) {
    const product = products.find((candidate) => candidate.ean === line.rawText);
    const challenge = product ? challenges.get(product.id) : undefined;
    if (challenge) found.set(line.id, challenge);
  }
  return found;
}

export async function readCounterNotice(pharmacyId: string, id: string, now: Date = new Date()): Promise<CounterSaleRead | null> {
  const prescription = await prisma.prescription.findFirst({
    where: { id, pharmacyId, source: "COUNTER_SCAN" },
    select: {
      reference: true,
      status: true,
      counterFollowUp: { select: { emailEncrypted: true, consentAt: true, closedAt: true } },
      lines: { orderBy: { position: "asc" }, select: { id: true, drugName: true, drugSpecialtyId: true, rawText: true, createdAt: true, expiresOn: true } },
      analysisRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
        select: {
          outcome: true,
          safetyFindings: { select: { severity: true, subjectType: true, code: true, message: true, acknowledgedAt: true } },
          opportunities: { select: { ruleKey: true, answer: true, triggeredLineIds: true } },
        },
      },
      questionAnswers: { select: { treeKey: true, nodeKey: true, choices: true } },
      recommendations: {
        orderBy: { totalScore: "desc" },
        select: {
          id: true,
          status: true,
          origin: true,
          productId: true,
          presentationId: true,
          opportunity: { select: { ruleKey: true, triggeredLineIds: true, answer: true, confirmedReason: true, rationale: true, clinicalContext: true, safetyNotes: true, benefits: true } },
          shortReason: true,
          justification: true,
          // La carte déployée de la bannière : la même fiche complète que la page de vente (core/counter/advice-sheet.ts).
          counterScript: true,
          patientReason: true,
          precautions: true,
          vigilances: true,
          routine: true,
          product: {
            select: {
              id: true,
              name: true,
              brand: true,
              category: true,
              matchingTags: true,
              salePriceCents: true,
              purchasePriceCents: true,
              vatRate: true,
              ean: true,
              stockItem: { select: { quantity: true, alertThreshold: true } },
              description: true,
              contraindications: true,
              precautions: true,
              // Les vigilances que CETTE officine a déclarées sur le produit, jamais celles d'une autre.
              vigilances: { where: { pharmacyId }, select: { population: true, level: true, note: true }, orderBy: { population: "asc" } },
            },
          },
          presentation: { select: { priceCents: true, specialty: { select: { name: true } }, pharmacyStocks: { where: { pharmacyId }, select: { priceCents: true, quantity: true } } } },
        },
      },
    },
  });
  if (!prescription) return null;
  const followUp = { emailSaved: Boolean(prescription.counterFollowUp?.emailEncrypted && prescription.counterFollowUp.consentAt), closed: Boolean(prescription.counterFollowUp?.closedAt) };
  // La vente que le pharmacien a terminée ne redevient jamais « en cours » : la fenêtre se ferme et attend la suivante.
  if (followUp.closed) {
    return { status: prescription.status, followUp, notice: buildCounterNotice({ reference: prescription.reference, prescriptionStatus: "DELIVERED", lineNames: [], alerts: [], recommendations: [], outcome: null }) };
  }
  if (prescription.status === "NEEDS_VERIFICATION") {
    return { status: prescription.status, followUp, notice: buildCounterNotice({ reference: prescription.reference, prescriptionStatus: "NEEDS_VERIFICATION", lineNames: [], lines: boxesOf(prescription.lines, new Map(), now), alerts: [], recommendations: [], outcome: null }) };
  }

  const run = prescription.analysisRuns[0];
  // Prix et « En stock » viennent du même export : un stock ancien ne s'affiche pas comme un fait.
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { stockSyncedAt: true, isDemo: true } });
  const stockReliable = stockReminderLevel(pharmacy?.stockSyncedAt ?? null, now) === "none";
  // Dans la fenêtre du poste comme sur l'écran de la vente, une règle supprimée dans la console de PharmaBoost n'existe plus :
  // un conseil resté dans une analyse ancienne ne s'affiche pas. Les règles en ligne parlent, validées ou non.
  const central = await loadCentralAdvice();
  const removed = new Set(central.removed);
  const known = new Set([...ADVICE_RULES.map((rule) => rule.key), ...central.custom.map((rule) => rule.key)]);
  // Une suggestion du robot parle tant que sa proposition n'a pas été refusée dans la console de PharmaBoost.
  for (const key of await trustedRobotRuleKeys(prescription.recommendations.map((rec) => rec.opportunity?.ruleKey))) known.add(key);

  const productIds = prescription.recommendations.map((rec) => rec.productId).filter((value): value is string => Boolean(value));
  const [challenges, shortDates] = await Promise.all([
    activeChallengeTitlesFor(pharmacyId, productIds, now).catch(() => new Map<string, string>()),
    nearestShortDatesFor(pharmacyId, now).catch(() => new Map<string, { expiresOn: string }>()),
  ]);
  const lineName = new Map(prescription.lines.map((line) => [line.id, line.drugName ?? ""]));
  // L'arbre de questions : pourquoi le patient prend son antalgique, où il a mal… Un conseil du bout d'une branche (la poche du dos,
  // le thermomètre) ne se montre qu'une fois la question répondue : jamais un Thérapearl « dos » sur la foi d'un Fervex.
  const tree = treeState({ opportunities: run?.opportunities ?? [], lineNames: lineName, answers: answersFromRows(prescription.questionAnswers) });

  // Les deux questions et le conseil en deux phrases de chaque conseil (18 oct. 2026) : gardés, ou rédigés en arrière-plan.
  const pitchTargets = prescription.recommendations
    .filter((rec) => rec.product && rec.opportunity?.ruleKey)
    .map((rec) => ({
      recId: rec.id,
      target: {
        ruleKey: rec.opportunity!.ruleKey!,
        productEan: rec.product!.ean ?? null,
        productName: rec.product!.name,
        request: {
          trigger: rec.opportunity?.triggeredLineIds.map((lineId) => lineName.get(lineId) ?? "").find(Boolean) ?? prescription.lines.map((line) => line.drugName ?? "").find(Boolean) ?? "",
          product: { name: rec.product!.name, brand: rec.product!.brand ?? null, category: rec.product!.category ?? null, tags: rec.product!.matchingTags ?? [] },
          reason: withoutOriginLabel(rec.shortReason ?? rec.justification) || null,
        },
        loadCandidates: () => stockCandidates(pharmacyId, { id: rec.productId ?? rec.product!.id, category: rec.product!.category, brand: rec.product!.brand ?? null, matchingTags: rec.product!.matchingTags ?? [] }),
      },
    }));
  const pitches = await pitchesFor(pitchTargets.map((entry) => entry.target), { demo: pharmacy?.isDemo === true }).catch(() => new Map<string, Awaited<ReturnType<typeof pitchesFor>> extends Map<string, infer V> ? V : never>());
  // Les réponses cliquables : leur produit plus précis relu dans le stock de la pharmacie (prix, marge, stock du jour).
  const answerCache = new Map<string, CounterSheetAnswer["product"] | null>();
  const answersByRec = new Map<string, CounterSheetAnswer[]>();
  for (const entry of pitchTargets) {
    const found = pitches.get(pitchKey(entry.target));
    if (found?.answers.length) answersByRec.set(entry.recId, await answersForSheet(pharmacyId, found.answers, stockReliable, answerCache));
  }
  const pitchOf = (recId: string) => {
    const entry = pitchTargets.find((candidate) => candidate.recId === recId);
    const found = entry ? pitches.get(pitchKey(entry.target)) : undefined;
    return found ? { ask: found.ask, pitch: found.pitch, ...(answersByRec.get(recId)?.length ? { answers: answersByRec.get(recId) } : {}) } : {};
  };

  const notice = buildCounterNotice({
    reference: prescription.reference,
    prescriptionStatus: prescription.status,
    lineNames: prescription.lines.map((line) => line.drugName ?? "").filter(Boolean),
    lineKinds: prescription.lines.filter((line) => line.drugName).map((line) => (line.drugSpecialtyId ? ("DRUG" as const) : ("PRODUCT" as const))),
    lines: boxesOf(prescription.lines, await boxChallenges(pharmacyId, prescription.lines, now), now),
    alerts: (run?.safetyFindings ?? []).map((finding) => ({ severity: finding.severity, subjectType: finding.subjectType, code: finding.code, message: finding.message, acknowledged: finding.acknowledgedAt !== null })),
    questions: tree.view.questions,
    guidance: tree.view.guidance,
    // Le conseil que le pharmacien vient de débloquer d'un clic (la poche de l'épaule, le thermomètre) passe devant : la fenêtre
    // n'a que trois places, et c'est la réponse qu'il attend à l'écran — tri stable, les autres gardent leur ordre.
    recommendations: prescription.recommendations
      .filter((rec) => tree.isVisible(rec.opportunity?.ruleKey))
      .sort((a, b) => Number(TREE_RULE_KEYS.has(b.opportunity?.ruleKey ?? "")) - Number(TREE_RULE_KEYS.has(a.opportunity?.ruleKey ?? "")))
      .map((rec) => {
        const triggered = rec.opportunity?.triggeredLineIds.map((lineId) => lineName.get(lineId) ?? "").find(Boolean) ?? null;
        const shortDate = rec.productId ? shortDates.get(`p:${rec.productId}`) : rec.presentationId ? shortDates.get(`d:${rec.presentationId}`) : undefined;
        return {
          id: rec.id,
          name: rec.product?.name ?? rec.presentation?.specialty.name ?? "Produit",
          forDrug: triggered,
          challengeTitle: rec.productId ? (challenges.get(rec.productId) ?? null) : null,
          shortDateOn: shortDate?.expiresOn ?? null,
          // Un prix de vente sous le prix d'achat est un prix mal reçu : il n'est pas affiché (rien plutôt qu'un chiffre faux).
          priceCents: rec.product && salePriceLooksWrong(rec.product) ? null : (rec.product?.salePriceCents ?? rec.presentation?.pharmacyStocks[0]?.priceCents ?? rec.presentation?.priceCents ?? null),
          // La marge HT d'un produit du stock (prix de vente TTC ramené au HT, moins le prix d'achat HT) : pour le pharmacien seul.
          marginCents: rec.product ? (unitMarginHt({ salePriceCents: rec.product.salePriceCents, purchasePriceCents: rec.product.purchasePriceCents, vatRate: rec.product.vatRate })?.marginCents ?? null) : null,
          // Jamais l'origine du conseil sur la carte (« Suggestion du robot… ») : décision du fondateur, 13 oct. 2026.
          reason: withoutOriginLabel(rec.shortReason ?? rec.justification) || null,
          status: rec.status,
          trusted: rec.origin !== "AI" || (rec.opportunity?.ruleKey != null && known.has(rec.opportunity.ruleKey) && !removed.has(rec.opportunity.ruleKey)),
          // Une association du pharmacien (règle « association:… ») a ses propres places dans la fenêtre, en plus des conseils du moteur.
          association: rec.origin === "RULE" && (rec.opportunity?.ruleKey?.startsWith("association:") ?? false),
          imageUrl: studioPhotoUrl(rec.product?.ean),
          quantity: rec.product ? (rec.product.stockItem?.quantity ?? null) : (rec.presentation?.pharmacyStocks[0]?.quantity ?? null),
          alertThreshold: rec.product?.stockItem?.alertThreshold ?? null,
          sheet: { ...counterSheetOf(
            {
              shortReason: rec.shortReason,
              counterScript: rec.counterScript,
              patientReason: rec.patientReason,
              precautions: rec.precautions,
              vigilances: parseSuggestionVigilances(rec.vigilances),
              routine: routineStepOf(rec.routine),
              opportunity: rec.opportunity,
              product: rec.product
                ? { sheet: { description: rec.product.description ?? null, contraindications: rec.product.contraindications ?? [], precautions: rec.product.precautions ?? [], vigilances: rec.product.vigilances ?? [] } }
                : null,
            },
            rec.product?.name ?? rec.presentation?.specialty.name ?? "Produit",
          ), ...pitchOf(rec.id) },
        };
      }),
    outcome: run?.outcome ?? null,
    stockReliable,
  });
  return { status: prescription.status, notice, followUp };
}
