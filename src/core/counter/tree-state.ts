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
