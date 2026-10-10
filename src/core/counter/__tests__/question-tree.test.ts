import { describe, expect, it } from "vitest";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { PAIN_ZONE_RULES } from "@/core/ai/engines/pain-zones";
import { ANALGESIC_TREE, TREE_RULE_KEYS, applyAnswer, evaluateTree, type TreeAnswers } from "../question-tree";

/**
 * L'arbre de questions du comptoir : POURQUOI le patient prend son antalgique, puis OÙ il a mal, ou la fièvre.
 * Retour d'officine du 10 octobre 2026 : un produit ciblé (Thérapearl dos) ne se conseille qu'après la réponse.
 */

const DRUG = "DOLIPRANE 1000 mg";
const answer = (answers: TreeAnswers, node: string, choice: string): TreeAnswers => {
  const next = applyAnswer(ANALGESIC_TREE, answers, node, choice);
  if (!next) throw new Error(`réponse refusée : ${node}/${choice}`);
  return next;
};
const view = (answers: TreeAnswers) => evaluateTree(ANALGESIC_TREE, answers, DRUG);

describe("au départ : une seule question, et aucun produit", () => {
  const start = view({});

  it("demande pourquoi le patient prend le médicament, avec le nom du médicament", () => {
    expect(start.questions).toHaveLength(1);
    expect(start.questions[0]).toMatchObject({ node: "why", text: "Pourquoi le patient prend-il DOLIPRANE 1000 mg ?", mode: "MULTI", answered: false });
    expect(start.questions[0].choices.map((choice) => choice.label)).toEqual(["Fièvre", "Mal de tête", "Douleur localisée", "Autre raison"]);
  });

  it("n'ouvre aucun produit : ni poche ciblée, ni thermomètre (le bug du Fervex et du Thérapearl dos)", () => {
    expect(start.unlocked).toEqual([]);
    expect(start.guidance).toEqual([]);
  });
});

describe("la douleur localisée : où ?", () => {
  it("« douleur localisée » ouvre « où », mais ne débloque encore AUCUNE poche : il faut la zone", () => {
    const state = view(answer({}, "why", "PAIN"));
    expect(state.questions.map((q) => q.node)).toEqual(["why", "where"]);
    expect(state.questions[1].choices.map((choice) => choice.label)).toEqual(["Dos", "Nuque", "Épaule", "Genou", "Hanche", "Cheville", "Ailleurs"]);
    expect(state.unlocked).toEqual([]);
  });

  it("chaque zone débloque SA poche, et une seule", () => {
    const zones: [string, string][] = [["BACK", "pain-pack-back"], ["NECK", "pain-pack-neck"], ["SHOULDER", "pain-pack-shoulder"], ["KNEE", "pain-pack-knee"], ["HIP", "pain-pack-hip"], ["ANKLE", "pain-pack-ankle"], ["ELSEWHERE", "pain-pack-other"]];
    for (const [choice, rule] of zones) {
      const state = view(answer(answer({}, "why", "PAIN"), "where", choice));
      expect(state.unlocked, choice).toEqual([rule]);
    }
  });

  it("plusieurs zones : chacune sa poche (le dos ET le genou)", () => {
    const state = view(answer(answer(answer({}, "why", "PAIN"), "where", "BACK"), "where", "KNEE"));
    expect(state.unlocked).toEqual(["pain-pack-back", "pain-pack-knee"]);
  });

  it("décocher « douleur localisée » referme « où » et oublie la zone", () => {
    const withBack = answer(answer({}, "why", "PAIN"), "where", "BACK");
    const closed = answer(withBack, "why", "PAIN");
    expect(view(closed).questions.map((q) => q.node)).toEqual(["why"]);
    expect(view(closed).unlocked).toEqual([]);
    expect(closed).toEqual({});
  });
});

describe("la fièvre : d'autres questions, indépendantes de la douleur", () => {
  it("« fièvre » ouvre le thermomètre et la durée", () => {
    const state = view(answer({}, "why", "FEVER"));
    expect(state.questions.map((q) => q.node)).toEqual(["why", "fever-thermometer", "fever-duration"]);
  });

  it("pas de thermomètre : le thermomètre est débloqué ; un thermomètre : rien", () => {
    const base = answer({}, "why", "FEVER");
    expect(view(answer(base, "fever-thermometer", "NO")).unlocked).toEqual(["fever-thermometer-analgesic"]);
    expect(view(answer(base, "fever-thermometer", "YES")).unlocked).toEqual([]);
  });

  it("fièvre depuis 3 jours ou plus : une phrase d'orientation vers le médecin, jamais un produit", () => {
    const state = view(answer(answer({}, "why", "FEVER"), "fever-duration", "LONG"));
    expect(state.guidance).toEqual(["Fièvre depuis 3 jours ou plus, ou supérieure à 39 °C : orienter vers le médecin."]);
    expect(state.unlocked).toEqual([]);
  });

  it("un seul choix par question à choix unique : répondre « oui » après « non » remplace, et répéter le même choix le retire", () => {
    const base = answer({}, "why", "FEVER");
    const no = answer(base, "fever-thermometer", "NO");
    const yes = answer(no, "fever-thermometer", "YES");
    expect(yes["fever-thermometer"]).toEqual(["YES"]);
    expect(answer(yes, "fever-thermometer", "YES")["fever-thermometer"]).toBeUndefined();
  });

  it("la fièvre ET la douleur à la fois : les deux branches sont ouvertes, sans se gêner", () => {
    const both = answer(answer(answer(answer({}, "why", "FEVER"), "why", "PAIN"), "where", "BACK"), "fever-thermometer", "NO");
    const state = view(both);
    expect(state.questions.map((q) => q.node)).toEqual(["why", "fever-thermometer", "fever-duration", "where"]);
    expect(state.unlocked).toEqual(["fever-thermometer-analgesic", "pain-pack-back"]);
    // Refermer la fièvre ne touche pas la douleur.
    const withoutFever = view(answer(both, "why", "FEVER"));
    expect(withoutFever.unlocked).toEqual(["pain-pack-back"]);
  });
});

describe("le mal de tête : une orientation, pas un produit", () => {
  it("coché, il dit d'orienter vers le médecin quand il est inhabituel, et ne débloque rien", () => {
    const state = view(answer({}, "why", "HEADACHE"));
    expect(state.guidance[0]).toMatch(/inhabituel, brutal ou qui revient souvent/);
    expect(state.unlocked).toEqual([]);
  });
});

describe("les garde-fous de l'arbre", () => {
  it("une réponse à une question fermée ou hors de l'arbre ne change rien", () => {
    expect(applyAnswer(ANALGESIC_TREE, {}, "where", "BACK")).toBeNull();
    expect(applyAnswer(ANALGESIC_TREE, {}, "inconnue", "BACK")).toBeNull();
    expect(applyAnswer(ANALGESIC_TREE, {}, "why", "INCONNU")).toBeNull();
  });

  it("chaque règle débloquée par l'arbre existe dans le moteur, et chaque règle de zone est débloquée par un choix", () => {
    const known = new Set(ADVICE_RULES.map((rule) => rule.key));
    for (const key of TREE_RULE_KEYS) expect(known.has(key), key).toBe(true);
    for (const rule of PAIN_ZONE_RULES) expect(TREE_RULE_KEYS.has(rule.key), rule.key).toBe(true);
  });

  it("toutes les phrases de l'arbre sont écrites (pas de repère laissé) et sourcées", () => {
    for (const node of Object.values(ANALGESIC_TREE.nodes)) {
      expect(node.question.replace("{drug}", "X")).not.toMatch(/[{}]/);
      expect(node.choices.length).toBeGreaterThan(1);
    }
    expect(ANALGESIC_TREE.sources.length).toBeGreaterThan(0);
  });

  it("les identifiants de question sont stables : « arbre:question »", () => {
    expect(view({}).questions[0].id).toBe("douleur-fievre:why");
  });
});
