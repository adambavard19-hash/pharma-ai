import { ANALGESIC_TREE, TREE_RULE_KEYS, evaluateTree, type TreeAnswers, type TreeView } from "./question-tree";

/**
 * Où en est l'arbre de questions d'UNE vente : actif ou non, quelles questions sont ouvertes, quels conseils sont visibles.
 *
 * Pure : elle reçoit les opportunités de la dernière analyse et les réponses données, et dit quoi montrer. Le poste de caisse et
 * l'écran de la vente s'en servent tous deux, pour dire la même chose.
 */

export type TreeOpportunity = { ruleKey: string | null; answer: boolean | null; triggeredLineIds: string[] };

export type TreeState = {
  /** Le traitement de la vente ouvre l'arbre : au moins un conseil du bout d'une branche a été apparié. */
  active: boolean;
  view: TreeView;
  /** Ce conseil peut-il se montrer ? Vrai pour tout conseil hors de l'arbre ; pour un conseil d'arbre, seulement une fois débloqué. */
  isVisible: (ruleKey: string | null | undefined) => boolean;
};

const NOBODY: TreeView = { questions: [], guidance: [], unlocked: [] };

export function treeState(input: { opportunities: TreeOpportunity[]; lineNames: ReadonlyMap<string, string>; answers: TreeAnswers }): TreeState {
  const inTree = input.opportunities.filter((opportunity) => opportunity.ruleKey !== null && TREE_RULE_KEYS.has(opportunity.ruleKey));
  if (inTree.length === 0) return { active: false, view: NOBODY, isVisible: () => true };
  // La question nomme le médicament qui a ouvert l'arbre : le premier de la vente qui l'a déclenché.
  const drugName =
    inTree
      .flatMap((opportunity) => opportunity.triggeredLineIds)
      .map((lineId) => input.lineNames.get(lineId) ?? "")
      .find(Boolean) ?? "ce médicament";
  const view = evaluateTree(ANALGESIC_TREE, input.answers, shortDrug(drugName));
  // Une réponse « oui » donnée sur l'écran de la vente (la question propre à la règle) débloque aussi le conseil.
  const answeredYes = new Set(inTree.filter((opportunity) => opportunity.answer === true).map((opportunity) => opportunity.ruleKey as string));
  const unlocked = new Set(view.unlocked);
  return { active: true, view, isVisible: (ruleKey) => !ruleKey || !TREE_RULE_KEYS.has(ruleKey) || unlocked.has(ruleKey) || answeredYes.has(ruleKey) };
}

/** « DOLIPRANE 1000 mg, comprimé » → « DOLIPRANE 1000 mg » : la forme n'aide pas dans une question. */
function shortDrug(name: string): string {
  return name.replace(/,.*$/, "").trim() || "ce médicament";
}

/** Les réponses d'une vente, telles que la base les garde (une ligne par question), en « question → choix cochés ». */
export function answersFromRows(rows: { treeKey: string; nodeKey: string; choices: string[] }[]): TreeAnswers {
  const answers: TreeAnswers = {};
  for (const row of rows) if (row.treeKey === ANALGESIC_TREE.key && row.choices.length > 0) answers[row.nodeKey] = row.choices;
  return answers;
}

/**
 * Une carte par produit parmi les conseils de l'arbre débloqués. La question « Où le patient a-t-il mal ? » se coche à
 * plusieurs (épaule ET genou) et chaque zone garde sa propre recommandation, souvent la même poche multi-zones : sans ce
 * tri, l'écran de la vente montrerait deux cartes pour un seul produit (deux places, deux lignes de panier). La fenêtre du
 * poste fait déjà ce tri (core/counter/notice.ts). Une carte déjà tranchée (acceptée, refusée…) passe avant une carte
 * neuve pour que la décision du pharmacien reste visible ; sinon la première dans l'ordre reçu garde la place. Les
 * conseils hors de l'arbre et les recommandations sans produit ne sont jamais touchés.
 */
export function oneTreeCardPerProduct<T extends { productId: string | null; status: string; opportunity?: { ruleKey: string | null } | null }>(recommendations: readonly T[]): T[] {
  const isTree = (recommendation: T) => Boolean(recommendation.productId && recommendation.opportunity?.ruleKey && TREE_RULE_KEYS.has(recommendation.opportunity.ruleKey));
  const kept = new Map<string, T>();
  for (const recommendation of recommendations) {
    if (!isTree(recommendation)) continue;
    const current = kept.get(recommendation.productId as string);
    if (!current || (current.status === "PROPOSED" && recommendation.status !== "PROPOSED")) kept.set(recommendation.productId as string, recommendation);
  }
  return recommendations.filter((recommendation) => !isTree(recommendation) || kept.get(recommendation.productId as string) === recommendation);
}
