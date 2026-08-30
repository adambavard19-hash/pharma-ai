import { describe, expect, it } from "vitest";
import { MAX_RECOMMENDATIONS_PER_PRESCRIPTION } from "@/config/constants";
import { runAnalysisPipeline, type PipelineInput } from "../pipeline";
import { drug, officialFacts, patient, product } from "./fixtures";
import type { DrugKnowledge, OfficialDrugFacts } from "../types";

/**
 * Les garanties du conseil additionnel.
 *
 * Chacune de ces règles a été posée comme condition d'acceptation du lot A.
 * Elles ne décrivent pas un comportement souhaitable : elles décrivent ce sans
 * quoi le produit ne serait pas crédible au comptoir.
 */

function buildInput(overrides: Partial<PipelineInput> = {}): PipelineInput {
  return {
    lines: [
      {
        lineIndex: 0,
        drugName: "Amoxicilline",
        posology: "1 comprimé matin et soir",
        durationDays: 6,
        confirmed: true,
      },
    ],
    knowledge: new Map<string, DrugKnowledge | null>([["amoxicilline", drug()]]),
    official: new Map<string, OfficialDrugFacts | null>([["amoxicilline", officialFacts()]]),
    patient: patient(),
    catalog: [product()],
    rules: [],
    history: {},
    explanations: [],
    extractionFindings: [],
    usedSimulatedProviders: false,
    ...overrides,
  };
}

describe("le moteur part du besoin, jamais du stock", () => {
  it("n'appelle le catalogue qu'après avoir établi une opportunité", () => {
    const result = runAnalysisPipeline(buildInput());
    const stages = result.trace.map((stage) => stage.stage);
    expect(stages.indexOf("ADVICE_OPPORTUNITIES")).toBeLessThan(
      stages.indexOf("CATALOG_MATCHING"),
    );
  });

  it("ne propose rien d'un stock abondant si aucun besoin n'est détecté", () => {
    // Un traitement qui ne déclenche aucune règle de conseil. Le catalogue est
    // plein, le stock est là, et pourtant il ne se passe rien — c'est
    // exactement ce qu'on veut.
    const result = runAnalysisPipeline(
      buildInput({
        lines: [
          { lineIndex: 0, drugName: "Molécule sans règle", posology: null, durationDays: null, confirmed: true },
        ],
        knowledge: new Map([
          [
            "molécule sans règle",
            drug({
              atcCode: "V03AZ",
              therapeuticClass: "Classe sans conseil associé",
              commonSideEffects: [],
            }),
          ],
        ]),
        official: new Map(),
        catalog: [
          product({ id: "a", stockQuantity: 500 }),
          product({ id: "b", stockQuantity: 500 }),
          product({ id: "c", stockQuantity: 500 }),
        ],
      }),
    );

    expect(result.opportunities).toHaveLength(0);
    expect(result.recommendations).toHaveLength(0);
  });
});

describe("« aucune recommandation pertinente » est un résultat normal", () => {
  it("rend une liste vide sans erreur ni statut dégradé", () => {
    const result = runAnalysisPipeline(
      buildInput({
        // Un catalogue qui ne répond à aucune étiquette de l'opportunité.
        catalog: [
          product({
            id: "hors-sujet",
            category: "HYGIENE",
            matchingTags: ["brosse à dents"],
            commercialClaims: [],
            description: "Brosse à dents souple",
            name: "Brosse à dents",
          }),
        ],
      }),
    );

    expect(result.recommendations).toHaveLength(0);
    // Le point important : aucune opportunité n'a été bloquée, aucune erreur
    // n'a été levée. Il n'y avait simplement rien de pertinent à proposer.
    expect(result.status).not.toBe("FAILED");
    expect(result.blockedReasons).toHaveLength(0);
  });

  it("refuse un candidat qui ne correspond que par sa catégorie", () => {
    // Mesuré sur le catalogue de démonstration : des pastilles pour la gorge
    // atteignaient 75 % de score total pour un conseil de confort gastrique,
    // sans une seule étiquette commune — uniquement parce qu'elles étaient
    // rangées dans le même rayon. Une parenté de rayon n'est pas une
    // pertinence.
    const result = runAnalysisPipeline(
      buildInput({
        catalog: [
          product({
            id: "meme-rayon",
            category: "PROBIOTIQUES",
            name: "Produit du même rayon",
            matchingTags: [],
            commercialClaims: [],
            description: null,
            subCategory: null,
            stockQuantity: 60,
          }),
        ],
      }),
    );

    expect(result.recommendations).toHaveLength(0);
  });

  it("laisse une place vide plutôt que de la remplir d'un candidat médiocre", () => {
    // Trois références plausibles par la catégorie, mais aucune n'atteint le
    // seuil de pertinence. Mieux vaut zéro proposition que trois à écarter.
    const médiocre = (id: string) =>
      product({
        id,
        category: "PROBIOTIQUES",
        name: `Référence ${id}`,
        matchingTags: [],
        commercialClaims: [],
        description: null,
        subCategory: null,
      });

    const result = runAnalysisPipeline(
      buildInput({ catalog: [médiocre("a"), médiocre("b"), médiocre("c")] }),
    );

    expect(result.recommendations.length).toBeLessThan(MAX_RECOMMENDATIONS_PER_PRESCRIPTION);
  });
});

describe("exclusions de sécurité du conseil additionnel", () => {
  it("n'propose jamais un médicament soumis à prescription", () => {
    const result = runAnalysisPipeline(
      buildInput({
        catalog: [
          product({
            id: "liste-1",
            origin: "NATIONAL_DRUG",
            presentationId: "pres-1",
            prescriptionConditions: ["liste I"],
            substances: ["SUBSTANCE X"],
            stockQuantity: 40,
          }),
        ],
      }),
    );

    expect(result.recommendations).toHaveLength(0);
    expect(
      result.safetyFindings.some((finding) => finding.code === "PRESCRIPTION_REQUIRED"),
    ).toBe(true);
  });

  it("n'propose jamais une substance déjà présente sur l'ordonnance", () => {
    // Risque de doublement de dose : le patient repartirait avec deux boîtes
    // de la même molécule sans que personne ne l'ait décidé.
    const result = runAnalysisPipeline(
      buildInput({
        catalog: [
          product({
            id: "doublon",
            origin: "NATIONAL_DRUG",
            presentationId: "pres-2",
            substances: ["AMOXICILLINE"],
            stockQuantity: 40,
          }),
        ],
      }),
    );

    expect(result.recommendations).toHaveLength(0);
    expect(
      result.safetyFindings.some((finding) => finding.code === "SUBSTANCE_ALREADY_PRESCRIBED"),
    ).toBe(true);
  });

  it("continue d'appliquer les exclusions patient existantes", () => {
    const result = runAnalysisPipeline(
      buildInput({
        patient: patient({ allergies: ["lactose"] }),
        catalog: [
          product({ id: "allergene", contraindications: ["contient du lactose"], stockQuantity: 40 }),
        ],
      }),
    );

    expect(result.recommendations).toHaveLength(0);
    expect(result.safetyFindings.some((finding) => finding.code === "PATIENT_ALLERGY")).toBe(true);
  });
});

describe("la raison affichée au comptoir", () => {
  it("tient en une ligne et nomme le traitement déclencheur", () => {
    const result = runAnalysisPipeline(buildInput());
    const [recommendation] = result.recommendations;

    expect(recommendation).toBeDefined();
    expect(recommendation.shortReason.length).toBeGreaterThan(10);
    expect(recommendation.shortReason.length).toBeLessThanOrEqual(120);
    // Elle nomme la substance publiée, pas la transcription du prescripteur.
    expect(recommendation.shortReason).toContain(officialFacts().substances[0]);
  });

  it("ne contient aucun argument commercial", () => {
    const result = runAnalysisPipeline(buildInput());
    const [recommendation] = result.recommendations;

    for (const mot of ["promotion", "offre", "remise", "€", "prix", "marge"]) {
      expect(recommendation.shortReason.toLowerCase()).not.toContain(mot);
    }
  });
});
