import "server-only";
import { prisma } from "@/server/db/client";
import { recordAudit } from "@/server/audit/log";
import { ANALGESIC_TREE, TREE_RULE_KEYS, applyAnswer, evaluateTree, type TreeAnswers } from "@/core/counter/question-tree";
import { answersFromRows, treeState } from "@/core/counter/tree-state";

/**
 * Répondre à l'arbre de questions du comptoir (« pourquoi le patient prend-il son paracétamol ? », « où a-t-il mal ? »).
 *
 * Une réponse est un choix coché ou décoché. Elle est gardée par vente et par question, et elle débloque les conseils du bout de
 * la branche : la poche chaud/froid de la bonne zone, le thermomètre. Ces conseils existent déjà dans l'analyse (appariés au
 * stock dès le bip) ; ce qui change, c'est qu'ils se montrent. Pour que l'écran de la vente et le poste disent la même chose,
 * un conseil débloqué est aussi marqué « oui » (`answer`) — c'est ce que l'écran de la vente lit pour une question de règle.
 *
 * Rien n'est supposé : une réponse à une question qui n'est pas ouverte, ou à une vente qui n'ouvre pas l'arbre, est refusée.
 */

export type AnswerSource = "POSTE" | "ECRAN";

export type CounterQuestionResult = { ok: true } | { ok: false; error: string };

export async function answerCounterQuestion(input: {
  pharmacyId: string;
  userId: string | null;
  source: AnswerSource;
  prescriptionId: string;
  node: string;
  choice: string;
}): Promise<CounterQuestionResult> {
  const prescription = await prisma.prescription.findFirst({
    where: { id: input.prescriptionId, pharmacyId: input.pharmacyId },
    select: {
      id: true,
      lines: { select: { id: true, drugName: true } },
      questionAnswers: { select: { treeKey: true, nodeKey: true, choices: true } },
      analysisRuns: { orderBy: { startedAt: "desc" }, take: 1, select: { id: true, opportunities: { select: { id: true, ruleKey: true, answer: true, triggeredLineIds: true } } } },
    },
  });
  if (!prescription) return { ok: false, error: "Vente introuvable dans cette officine." };
  const run = prescription.analysisRuns[0];
  const opportunities = run?.opportunities ?? [];
  const lineNames = new Map(prescription.lines.map((line) => [line.id, line.drugName ?? ""]));
  const before = answersFromRows(prescription.questionAnswers);
  const state = treeState({ opportunities, lineNames, answers: before });
  if (!state.active) return { ok: false, error: "Cette vente n'appelle aucune question." };

  const after = applyAnswer(ANALGESIC_TREE, before, input.node, input.choice);
  if (!after) return { ok: false, error: "Cette question n'est pas ouverte." };

  const unlockedBefore = new Set(evaluateTree(ANALGESIC_TREE, before, "").unlocked);
  const unlockedAfter = new Set(evaluateTree(ANALGESIC_TREE, after, "").unlocked);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Les questions refermées oublient leurs réponses ; les autres sont enregistrées telles quelles (une ligne par question).
    for (const [node, choices] of Object.entries(after)) {
      await tx.counterQuestionAnswer.upsert({
        where: { prescriptionId_treeKey_nodeKey: { prescriptionId: prescription.id, treeKey: ANALGESIC_TREE.key, nodeKey: node } },
        create: { pharmacyId: input.pharmacyId, prescriptionId: prescription.id, treeKey: ANALGESIC_TREE.key, nodeKey: node, choices, source: input.source, answeredByUserId: input.userId },
        update: { choices, source: input.source, answeredByUserId: input.userId },
      });
    }
    await tx.counterQuestionAnswer.deleteMany({ where: { prescriptionId: prescription.id, treeKey: ANALGESIC_TREE.key, nodeKey: { notIn: Object.keys(after) } } });
    // Le conseil débloqué est « oui » sur l'écran de la vente ; un conseil qui se referme redevient sans réponse (seulement s'il
    // avait été débloqué par l'arbre : un « oui » donné ailleurs n'est pas défait).
    for (const opportunity of opportunities) {
      if (!opportunity.ruleKey || !TREE_RULE_KEYS.has(opportunity.ruleKey)) continue;
      if (unlockedAfter.has(opportunity.ruleKey) && opportunity.answer !== true) {
        await tx.adviceOpportunity.update({ where: { id: opportunity.id }, data: { answer: true, answeredAt: now, answeredByUserId: input.userId } });
      } else if (unlockedBefore.has(opportunity.ruleKey) && !unlockedAfter.has(opportunity.ruleKey) && opportunity.answer === true) {
        await tx.adviceOpportunity.update({ where: { id: opportunity.id }, data: { answer: null, answeredAt: null, answeredByUserId: null } });
      }
    }
  });

  await recordAudit({
    action: "counter_question.answered",
    entityType: "Prescription",
    entityId: prescription.id,
    pharmacyId: input.pharmacyId,
    userId: input.userId,
    // Des clés de choix, jamais du texte libre : aucune donnée de santé nominative.
    metadata: { tree: ANALGESIC_TREE.key, node: input.node, choice: input.choice, source: input.source },
  }).catch(() => undefined);
  return { ok: true };
}

export type { TreeAnswers };
