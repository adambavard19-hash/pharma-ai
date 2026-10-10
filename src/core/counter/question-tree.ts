/**
 * L'arbre de questions du comptoir.
 *
 * Un médicament comme le paracétamol ne dit pas, à lui seul, ce que le patient a : de la fièvre, mal à la tête, mal au dos ?
 * Conseiller une poche chaud/froid « pour le dos » sans l'avoir demandé est un conseil à côté. L'arbre pose donc les questions
 * dans l'ordre, au pharmacien (qui les pose au patient) : POURQUOI prend-il ce médicament, puis, selon la réponse, OÙ a-t-il
 * mal, ou la fièvre dure-t-elle depuis longtemps, a-t-il un thermomètre… Un produit n'est proposé qu'une fois la réponse
 * donnée ; une réponse peut aussi n'être qu'une phrase d'orientation (« mal de tête inhabituel : voir le médecin »).
 *
 * Deux branches sont indépendantes : un patient peut avoir de la fièvre ET mal au dos. La première question se coche donc
 * plusieurs fois, et chaque branche ouvre ses propres questions.
 *
 * Ce module est PUR : il décrit l'arbre, applique une réponse et dit ce qui est ouvert — sans base, sans réseau. Les
 * produits proposés au bout d'une branche sont des règles de conseil (`pain-zones.ts`) : l'arbre ne nomme que leurs clés.
 * Toutes les questions et phrases sont écrites ici, relues, versionnées : jamais formulées à la volée.
 */

export type TreeChoice = {
  key: string;
  label: string;
  /** Les questions que ce choix ouvre. */
  opens?: string[];
  /** Les règles de conseil que ce choix débloque (leur clé). Un produit n'est proposé qu'à ce prix. */
  unlocks?: string[];
  /** Une phrase d'orientation, lue au comptoir tant que ce choix est coché. Jamais un produit. */
  note?: string;
};

export type TreeNode = {
  key: string;
  /** La question, `{drug}` remplacé par le médicament. */
  question: string;
  /** MULTI : plusieurs choix possibles (deux branches indépendantes). SINGLE : un seul. */
  mode: "MULTI" | "SINGLE";
  choices: TreeChoice[];
};

export type QuestionTree = {
  key: string;
  version: string;
  root: string;
  nodes: Record<string, TreeNode>;
  sources: string[];
};

/** Les réponses données : pour chaque question, les choix cochés. */
export type TreeAnswers = Record<string, string[]>;

export type ViewChoice = { key: string; label: string; selected: boolean };

/** Une question ouverte, telle que le comptoir l'affiche. */
export type ViewQuestion = {
  /** Identifiant stable de la question : « arbre:question ». */
  id: string;
  node: string;
  text: string;
  mode: "MULTI" | "SINGLE";
  choices: ViewChoice[];
  /** Au moins un choix est coché. */
  answered: boolean;
};

export type TreeView = {
  /** Les questions ouvertes, dans l'ordre de l'arbre. */
  questions: ViewQuestion[];
  /** Les phrases d'orientation des choix cochés. */
  guidance: string[];
  /** Les règles de conseil débloquées. */
  unlocked: string[];
};

/**
 * L'arbre du paracétamol, de l'ibuprofène et des antalgiques : pourquoi, puis où, ou fièvre.
 *
 * Ce qu'il propose à chaque bout :
 *   • « Où ? » — la poche chaud/froid de la bonne zone (la gamme existe par zone : dos, genou, hanche, cheville…) ;
 *   • fièvre — un thermomètre, si le patient n'en a pas ; et, si elle dure, l'orientation vers le médecin
 *     (« fièvre au-delà de 3 jours ou supérieure à 39 °C : contacter le médecin », comme la règle du thermomètre).
 */
export const ANALGESIC_TREE: QuestionTree = {
  key: "douleur-fievre",
  version: "1.0",
  root: "why",
  sources: [
    "Règles de conseil « chaud / froid par zone » et « thermomètre » de PharmaBoost, à valider par le pharmacien",
    "HAS — prise en charge des entorses de cheville (froid les premières heures) ; thermothérapie des contractures",
    "Consigne du pharmacien fondateur, 10 octobre 2026 : demander POURQUOI, puis OÙ, avant toute poche ciblée",
  ],
  nodes: {
    why: {
      key: "why",
      question: "Pourquoi le patient prend-il {drug} ?",
      mode: "MULTI",
      choices: [
        { key: "FEVER", label: "Fièvre", opens: ["fever-thermometer", "fever-duration"] },
        { key: "HEADACHE", label: "Mal de tête", note: "Un mal de tête inhabituel, brutal ou qui revient souvent : orienter vers le médecin." },
        { key: "PAIN", label: "Douleur localisée", opens: ["where"] },
        { key: "OTHER", label: "Autre raison" },
      ],
    },
    where: {
      key: "where",
      question: "Où le patient a-t-il mal ?",
      mode: "MULTI",
      choices: [
        { key: "BACK", label: "Dos", unlocks: ["pain-pack-back"] },
        { key: "NECK", label: "Nuque", unlocks: ["pain-pack-neck"] },
        { key: "SHOULDER", label: "Épaule", unlocks: ["pain-pack-shoulder"] },
        { key: "KNEE", label: "Genou", unlocks: ["pain-pack-knee"] },
        { key: "HIP", label: "Hanche", unlocks: ["pain-pack-hip"] },
        { key: "ANKLE", label: "Cheville", unlocks: ["pain-pack-ankle"] },
        { key: "ELSEWHERE", label: "Ailleurs", unlocks: ["pain-pack-other"] },
      ],
    },
    "fever-thermometer": {
      key: "fever-thermometer",
      question: "Le patient a-t-il un thermomètre à la maison ?",
      mode: "SINGLE",
      choices: [
        { key: "NO", label: "Non", unlocks: ["fever-thermometer-analgesic"] },
        { key: "YES", label: "Oui" },
      ],
    },
    "fever-duration": {
      key: "fever-duration",
      question: "Depuis combien de temps a-t-il de la fièvre ?",
      mode: "SINGLE",
      choices: [
        { key: "SHORT", label: "Moins de 3 jours" },
        { key: "LONG", label: "3 jours ou plus", note: "Fièvre depuis 3 jours ou plus, ou supérieure à 39 °C : orienter vers le médecin." },
      ],
    },
  },
};

export const QUESTION_TREES: readonly QuestionTree[] = [ANALGESIC_TREE];

/** Toutes les règles de conseil que des choix peuvent débloquer : une règle de cette liste ne s'affiche jamais sans sa réponse. */
export const TREE_RULE_KEYS: ReadonlySet<string> = new Set(
  QUESTION_TREES.flatMap((tree) => Object.values(tree.nodes).flatMap((node) => node.choices.flatMap((choice) => choice.unlocks ?? []))),
);

/** Les nœuds ouverts, dans l'ordre de l'arbre (parcours en largeur depuis la racine), d'après les choix cochés. */
function openNodes(tree: QuestionTree, answers: TreeAnswers): string[] {
  const open: string[] = [];
  const queue = [tree.root];
  while (queue.length > 0) {
    const key = queue.shift()!;
    if (open.includes(key) || !tree.nodes[key]) continue;
    open.push(key);
    const node = tree.nodes[key];
    for (const choice of node.choices) {
      if ((answers[key] ?? []).includes(choice.key)) queue.push(...(choice.opens ?? []));
    }
  }
  return open;
}

/** Ce que le comptoir voit : les questions ouvertes (avec le choix coché), les phrases d'orientation, les règles débloquées. */
export function evaluateTree(tree: QuestionTree, answers: TreeAnswers, drugName: string): TreeView {
  const questions: ViewQuestion[] = [];
  const guidance: string[] = [];
  const unlocked: string[] = [];
  for (const key of openNodes(tree, answers)) {
    const node = tree.nodes[key];
    const picked = answers[key] ?? [];
    questions.push({
      id: `${tree.key}:${key}`,
      node: key,
      text: node.question.replaceAll("{drug}", drugName),
      mode: node.mode,
      choices: node.choices.map((choice) => ({ key: choice.key, label: choice.label, selected: picked.includes(choice.key) })),
      answered: picked.length > 0,
    });
    for (const choice of node.choices) {
      if (!picked.includes(choice.key)) continue;
      if (choice.note) guidance.push(choice.note);
      for (const rule of choice.unlocks ?? []) if (!unlocked.includes(rule)) unlocked.push(rule);
    }
  }
  return { questions, guidance, unlocked };
}

/**
 * Applique une réponse : un choix coché ou décoché (MULTI : il bascule ; SINGLE : il remplace). Les réponses des questions que
 * cette réponse referme sont effacées — décocher « douleur localisée » oublie « où ». Une réponse hors de l'arbre, ou à une
 * question qui n'est pas ouverte, ne change rien (`null`).
 */
export function applyAnswer(tree: QuestionTree, answers: TreeAnswers, node: string, choice: string): TreeAnswers | null {
  if (!openNodes(tree, answers).includes(node)) return null;
  const definition = tree.nodes[node];
  if (!definition?.choices.some((candidate) => candidate.key === choice)) return null;
  const current = answers[node] ?? [];
  const next: TreeAnswers = { ...answers };
  if (definition.mode === "SINGLE") next[node] = current.length === 1 && current[0] === choice ? [] : [choice];
  else next[node] = current.includes(choice) ? current.filter((key) => key !== choice) : [...current, choice];
  // Les questions refermées oublient leurs réponses.
  const stillOpen = new Set(openNodes(tree, next));
  for (const key of Object.keys(next)) if (!stillOpen.has(key) || next[key].length === 0) delete next[key];
  return next;
}
