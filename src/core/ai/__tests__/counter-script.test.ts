import { describe, expect, it } from "vitest";
import { ADVICE_RULES, detectAdviceOpportunities } from "../engines/advice";
import { scoreProductForOpportunity } from "../engines/scoring";
import { drug, patient, product } from "./fixtures";

/**
 * La phrase à dire au patient.
 *
 * Elle est écrite dans la règle de conseil, relue et versionnée : c'est ce qui
 * garantit qu'aucune justification médicale ne peut être improvisée pour vendre
 * davantage. Les tests ci-dessous protègent cette garantie — ils portent sur ce
 * que la phrase a le droit d'affirmer, pas sur son style.
 */

/**
 * Vocabulaire d'affirmation thérapeutique. Un conseil accompagne un traitement,
 * il ne traite pas : ces verbes transformeraient un complément en médicament.
 * « Protéger » en est volontairement absent — une protection solaire protège
 * réellement, et c'est le sujet du conseil de photosensibilisation.
 */
const OVERCLAIM =
  /\b(guérit|guérir|guérison|soigne|soigner|traite|traitent|traiter\s+(?:votre|la|le)|élimine|éliminer|supprime|supprimer|évite\s+(?:la\s+maladie|l'infection)|sans\s+risque|sans\s+aucun\s+effet|garanti[e]?s?|miracle)\b/i;

describe("phrase de comptoir — chaque règle en porte une", () => {
  it.each(ADVICE_RULES.map((rule) => [rule.key, rule] as const))(
    "« %s » énonce une phrase substantielle",
    (_key, rule) => {
      expect(rule.counterScriptTemplate.trim().length).toBeGreaterThan(60);
      expect(rule.counterScriptTemplate).toContain("{product}");
    },
  );
});

describe("phrase de comptoir — ce qu'elle n'a pas le droit d'affirmer", () => {
  it.each(ADVICE_RULES.map((rule) => [rule.key, rule] as const))(
    "« %s » ne promet aucun effet thérapeutique",
    (_key, rule) => {
      expect(rule.counterScriptTemplate).not.toMatch(OVERCLAIM);
    },
  );

  /**
   * Prolongement du garde-fou `triggerMode` jusqu'à l'oral : une règle qui peut
   * se déclencher sur un simple effet indésirable partagé ne doit pas affirmer
   * ce QU'EST le médicament, sans quoi le pharmacien dirait au patient une
   * chose fausse — « Amoxicilline est une supplémentation martiale ».
   */
  it.each(
    ADVICE_RULES.filter((rule) => rule.triggerMode === "CLASS_OR_SIDE_EFFECT").map(
      (rule) => [rule.key, rule] as const,
    ),
  )("« %s » n'affirme pas la classe du médicament", (_key, rule) => {
    expect(rule.counterScriptTemplate).not.toMatch(/\{drug\}\s+est\b/i);
  });
});

describe("phrase de comptoir — au bout de la chaîne", () => {
  const opportunities = detectAdviceOpportunities({
    drugs: [{ lineIndex: 0, drugName: "Amoxicilline", knowledge: drug() }],
    patient: patient(),
  });
  const opportunity = opportunities.find(
    (o) => o.key === "digestive-tolerance-antibiotics",
  )!;

  it("substitue le médicament dès l'étape des opportunités", () => {
    expect(opportunity.counterScriptTemplate).toContain("Amoxicilline");
  });

  /**
   * L'ordre du pipeline est une garantie : l'étape qui juge de la pertinence ne
   * voit pas le catalogue. La référence ne peut donc être insérée qu'après.
   */
  it("laisse la référence en attente tant que le catalogue n'est pas consulté", () => {
    expect(opportunity.counterScriptTemplate).toContain("{product}");
  });

  const scored = scoreProductForOpportunity({
    opportunity,
    product: product(),
    patient: patient(),
    rules: [],
    history: {},
    blockedProductIds: new Set<string>(),
  })!;

  it("insère la référence retenue, et ne laisse aucun trou dans la phrase", () => {
    expect(scored.counterScript).toContain("Flore Équilibre");
    expect(scored.counterScript).not.toMatch(/\{[a-z]+\}/i);
  });

  /**
   * La phrase de comptoir vient de la règle de conseil ; l'argumentaire
   * commercial du produit alimente la fiche patient, pas ce que le pharmacien
   * affirme. Les confondre reviendrait à faire dire une accroche marketing.
   */
  it("ne reprend pas l'argumentaire commercial du produit", () => {
    const claim = product().commercialClaims[0];
    expect(scored.patientReason).toContain(claim);
    expect(scored.counterScript).not.toContain(claim);
  });
});
