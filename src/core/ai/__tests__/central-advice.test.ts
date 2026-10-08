import { describe, expect, it } from "vitest";
import {
  buildCustomRule,
  centralAssociationError,
  centralState,
  customRulesFrom,
  parseCustomRuleDefinition,
  removedRuleKeys,
  rowsByKey,
  type CentralRuleRow,
} from "../central-advice";
import { ADVICE_RULES, detectAdviceOpportunities } from "../engines/advice";
import { ADVICE_VOCABULARY } from "@/core/catalog/product-vocabulary";
import { drug, patient } from "./fixtures";

/**
 * Le centre de contrôle des conseils : ce que l'équipe PharmaBoost décide UNE fois pour toutes les officines.
 */

const row = (overrides: Partial<CentralRuleRow> & { ruleKey: string }): CentralRuleRow => ({
  source: "BUILT_IN",
  status: "ACTIVE",
  ruleVersion: null,
  definition: null,
  decidedAt: null,
  decidedByName: null,
  ...overrides,
});

const RULE = ADVICE_RULES[0];
const TAG = ADVICE_VOCABULARY[0];

const validDefinition = () => ({
  title: "Bouche sèche sous antidépresseur",
  kind: "COMFORT",
  atcPrefixes: ["n06a"],
  therapeuticClasses: [],
  category: "SOINS",
  matchingTags: [TAG],
  question: "",
  shortReason: "Antidépresseur ({drug}) : la bouche sèche est fréquente.",
  counterScript: "{drug} assèche souvent la bouche. {product} peut soulager cette gêne.",
  patientReason: "",
  source: "Retour du comptoir",
  safetyNotes: ["Aucune amélioration en une semaine : en parler au médecin."],
});

describe("l'état d'une règle du code", () => {
  it("toute règle est en ligne dès le départ : sans décision, elle parle partout, « à relire »", () => {
    for (const rule of ADVICE_RULES) expect(centralState(rule, rowsByKey([]))).toEqual({ status: "ACTIVE", outdated: false });
  });

  it("validée sous sa version actuelle : validée ; réécrite depuis : à relire, et le dit", () => {
    const validated = rowsByKey([row({ ruleKey: RULE.key, status: "VALIDATED", ruleVersion: RULE.version })]);
    expect(centralState(RULE, validated)).toEqual({ status: "VALIDATED", outdated: false });
    const older = rowsByKey([row({ ruleKey: RULE.key, status: "VALIDATED", ruleVersion: "0.1-ancienne" })]);
    expect(centralState(RULE, older)).toEqual({ status: "ACTIVE", outdated: true });
  });

  it("supprimée : supprimée, quelle que soit la version (c'est une décision explicite)", () => {
    for (const version of [RULE.version, "0.1-ancienne", null]) {
      expect(centralState(RULE, rowsByKey([row({ ruleKey: RULE.key, status: "REMOVED", ruleVersion: version })])).status).toBe("REMOVED");
    }
  });

  it("une règle que le code dit déjà validée l'est sans décision en base", () => {
    expect(centralState({ ...RULE, validation: { status: "VALIDATED", validatedAt: "2026-10-01", validatedBy: "Donna" } }, rowsByKey([])).status).toBe("VALIDATED");
  });

  it("les règles supprimées sont celles qui sortent du moteur — du code ou ajoutées", () => {
    const rows = [row({ ruleKey: "a", status: "REMOVED" }), row({ ruleKey: "b", status: "VALIDATED" }), row({ ruleKey: "custom-1", source: "CUSTOM", status: "REMOVED" })];
    expect(removedRuleKeys(rows)).toEqual(["a", "custom-1"]);
  });
});

describe("ajouter un conseil : ce que la console accepte", () => {
  it("accepte un conseil complet, nettoie les codes ATC (majuscules) et garde le reste tel quel", () => {
    const parsed = parseCustomRuleDefinition(validDefinition());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.atcPrefixes).toEqual(["N06A"]);
      expect(parsed.value.question).toBeNull();
      expect(parsed.value.patientReason).toBeNull();
      expect(parsed.value.matchingTags).toEqual([TAG]);
    }
  });

  const refused: [string, (input: ReturnType<typeof validDefinition>) => unknown, RegExp][] = [
    ["sans nom", (d) => ({ ...d, title: " " }), /nom au conseil/],
    ["un type de sécurité (réservé au code)", (d) => ({ ...d, kind: "SAFETY" }), /tolérance ou confort/],
    ["un code ATC mal écrit", (d) => ({ ...d, atcPrefixes: ["N06AAAA9"] }), /pas un code ATC valide/],
    ["aucun déclencheur", (d) => ({ ...d, atcPrefixes: [], therapeuticClasses: [] }), /code ATC ou une classe/],
    ["une catégorie inconnue", (d) => ({ ...d, category: "INCONNUE" }), /catégorie du produit/],
    ["aucune étiquette", (d) => ({ ...d, matchingTags: [] }), /au moins une étiquette/],
    ["une étiquette inventée", (d) => ({ ...d, matchingTags: ["étiquette-inventée-xyz"] }), /n'existe pas/],
    ["une raison trop courte", (d) => ({ ...d, shortReason: "Court" }), /raison/],
    ["une raison avec un mot à remplacer inconnu", (d) => ({ ...d, shortReason: "Antidépresseur ({medicament}) : la bouche sèche est fréquente." }), /\{medicament\}/],
    ["une phrase sans {product}", (d) => ({ ...d, counterScript: "{drug} assèche souvent la bouche, c'est fréquent." }), /\{product\}/],
    ["une phrase avec un mot à remplacer inconnu", (d) => ({ ...d, counterScript: "{drug} assèche. {product} aide. {prix}" }), /\{prix\}/],
    ["trop de précautions", (d) => ({ ...d, safetyNotes: ["1", "2", "3", "4", "5", "6"] }), /précautions/],
  ];
  for (const [name, change, message] of refused) {
    it(`refuse ${name}, avec un message lisible`, () => {
      const parsed = parseCustomRuleDefinition(change(validDefinition()));
      expect(parsed.ok).toBe(false);
      if (!parsed.ok) expect(parsed.error).toMatch(message);
    });
  }

  it("ne lit jamais autre chose qu'un objet", () => {
    for (const raw of [null, undefined, "texte", 12, []]) expect(parseCustomRuleDefinition(raw).ok).toBe(false);
  });
});

describe("un conseil ajouté se comporte comme une règle du code", () => {
  const definition = (() => {
    const parsed = parseCustomRuleDefinition(validDefinition());
    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.value;
  })();

  it("devient une règle que le moteur lit, en ligne « à relire » tant qu'elle n'est pas validée", () => {
    const rule = buildCustomRule({ ruleKey: "custom-abc", status: "ACTIVE", decidedAt: null, decidedByName: null }, definition);
    expect(rule).toMatchObject({ key: "custom-abc", kind: "COMFORT", triggerMode: "CLASS_ONLY", atcPrefixes: ["N06A"], validation: { status: "PENDING" } });
    expect(rule.counterScriptTemplate).toContain("{product}");
    expect(rule.clinicalContext).toMatch(/Retour du comptoir/);
  });

  it("validée, elle porte le nom de la personne et la date", () => {
    const decidedAt = new Date("2026-10-09T10:00:00Z");
    const rule = buildCustomRule({ ruleKey: "custom-abc", status: "VALIDATED", decidedAt, decidedByName: "Donna Benveniste" }, definition);
    expect(rule.validation).toEqual({ status: "VALIDATED", validatedAt: decidedAt.toISOString(), validatedBy: "Donna Benveniste" });
  });

  it("une règle ajoutée se déclenche sur sa classe, nomme le médicament et ne se déclenche pas sur une autre classe", () => {
    const rule = buildCustomRule({ ruleKey: "custom-abc", status: "ACTIVE", decidedAt: null, decidedByName: null }, definition);
    const keysFor = (atcCode: string) =>
      detectAdviceOpportunities({
        drugs: [{ lineIndex: 0, drugName: "DEROXAT 20 mg", knowledge: drug({ name: "DEROXAT 20 mg", inn: "PAROXETINE", atcCode, therapeuticClass: "Antidépresseur", commonSideEffects: [] }) }],
        patient: patient(),
        extraRules: [rule],
      });
    const hit = keysFor("N06AB05").find((opportunity) => opportunity.key === "custom-abc");
    expect(hit?.shortReason).toContain("DEROXAT") ;
    expect(keysFor("J01CA04").some((opportunity) => opportunity.key === "custom-abc")).toBe(false);
  });

  it("une règle supprimée ne se déclenche pas, qu'elle vienne du code ou ait été ajoutée", () => {
    const rule = buildCustomRule({ ruleKey: "custom-abc", status: "ACTIVE", decidedAt: null, decidedByName: null }, definition);
    const call = (disabled: string[]) =>
      detectAdviceOpportunities({
        drugs: [{ lineIndex: 0, drugName: "AMOXICILLINE", knowledge: drug({ atcCode: "J01CA04" }) }, { lineIndex: 1, drugName: "DEROXAT", knowledge: drug({ name: "DEROXAT", atcCode: "N06AB05", therapeuticClass: "Antidépresseur", commonSideEffects: [] }) }],
        patient: patient(),
        extraRules: [rule],
        disabledRuleKeys: new Set(disabled),
      }).map((opportunity) => opportunity.key);
    expect(call([])).toContain("custom-abc");
    expect(call([])).toContain("digestive-tolerance-antibiotics");
    expect(call(["custom-abc", "digestive-tolerance-antibiotics"])).not.toContain("custom-abc");
    expect(call(["custom-abc", "digestive-tolerance-antibiotics"])).not.toContain("digestive-tolerance-antibiotics");
  });

  it("les conseils ajoutés prêts pour le moteur : ni supprimés, ni illisibles", () => {
    const rows = [
      row({ ruleKey: "custom-ok", source: "CUSTOM", definition: validDefinition() }),
      row({ ruleKey: "custom-supprime", source: "CUSTOM", status: "REMOVED", definition: validDefinition() }),
      row({ ruleKey: "custom-abime", source: "CUSTOM", definition: { title: "x" } }),
      row({ ruleKey: RULE.key, status: "VALIDATED", ruleVersion: RULE.version }),
    ];
    expect(customRulesFrom(rows).map((rule) => rule.key)).toEqual(["custom-ok"]);
  });
});

describe("une association commune", () => {
  it("a un déclencheur et un produit conseillé avec un code-barres, et ne s'associe pas à elle-même", () => {
    expect(centralAssociationError({ triggerKey: "drug:coryzalia", adviceEan: "3401234567890", sentence: null })).toBeNull();
    expect(centralAssociationError({ triggerKey: "", adviceEan: "3401234567890", sentence: null })).toMatch(/déclenche/);
    expect(centralAssociationError({ triggerKey: "drug:coryzalia", adviceEan: "abc", sentence: null })).toMatch(/code-barres/);
    expect(centralAssociationError({ triggerKey: "ean:3401234567890", adviceEan: "3401234567890", sentence: null })).toMatch(/lui-même/);
    expect(centralAssociationError({ triggerKey: "drug:coryzalia", adviceEan: "3401234567890", sentence: "x".repeat(281) })).toMatch(/trop longue/);
  });
});
