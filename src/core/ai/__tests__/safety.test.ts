import { describe, expect, it } from "vitest";
import {
  evaluateExtractionSafety,
  evaluateKnowledgeCoverage,
  evaluateOpportunitySafety,
  evaluateProductSafety,
  hasBlockingFinding,
} from "../engines/safety";
import { detectAdviceOpportunities } from "../engines/advice";
import { drug, officialFacts, patient, product } from "./fixtures";
import type { ExtractedPrescriptionLine } from "../types";

function line(
  overrides: Partial<ExtractedPrescriptionLine> = {},
): ExtractedPrescriptionLine {
  const field = <T>(value: T | null, confidence = 0.95, unreadable = false) => ({
    value,
    confidence,
    unreadable,
  });
  return {
    position: 0,
    rawText: "Amoxicilline 1 g",
    drugName: field<string>("Amoxicilline"),
    dosage: field<string>("1 g"),
    form: field<string>("Comprimé"),
    posology: field<string>("1 matin et soir"),
    durationDays: field<number>(6),
    quantity: field<number>(12),
    instructions: field<string>("Au cours des repas"),
    ...overrides,
  };
}

describe("moteur de sécurité — extraction", () => {
  it("bloque une ordonnance sans aucune ligne", () => {
    const findings = evaluateExtractionSafety([]);
    expect(hasBlockingFinding(findings)).toBe(true);
    expect(findings[0].code).toBe("EXTRACTION_EMPTY");
  });

  it("bloque une ligne dont le nom du médicament est illisible", () => {
    const findings = evaluateExtractionSafety([
      line({ drugName: { value: null, confidence: 0, unreadable: true } }),
    ]);
    expect(hasBlockingFinding(findings)).toBe(true);
    expect(findings.some((f) => f.code === "DRUG_NAME_UNREADABLE")).toBe(true);
  });

  it("signale un nom lu avec une confiance insuffisante sans bloquer", () => {
    const findings = evaluateExtractionSafety([
      line({ drugName: { value: "Amoxicilline", confidence: 0.6, unreadable: false } }),
    ]);
    expect(hasBlockingFinding(findings)).toBe(false);
    expect(findings.some((f) => f.code === "DRUG_NAME_LOW_CONFIDENCE")).toBe(true);
  });

  it("signale un champ illisible sans jamais lui inventer de valeur", () => {
    const extracted = line({
      posology: { value: null, confidence: 0, unreadable: true },
    });
    const findings = evaluateExtractionSafety([extracted]);

    expect(extracted.posology.value).toBeNull();
    expect(findings.some((f) => f.code === "POSOLOGY_UNREADABLE")).toBe(true);
  });
});

describe("moteur de sécurité — référentiel", () => {
  it("signale un médicament absent du référentiel", () => {
    const findings = evaluateKnowledgeCoverage(
      [{ drugName: "Molécule inconnue" }],
      new Map(),
    );
    expect(findings.some((f) => f.code === "DRUG_NOT_IN_REFERENTIAL")).toBe(true);
  });

  it("dit qu'une ligne n'est pas rattachée au catalogue national", () => {
    const findings = evaluateKnowledgeCoverage(
      [{ drugName: "Amoxicilline" }],
      new Map([["amoxicilline", drug({ interactionClasses: ["anticoagulants"] })]]),
      new Map([["amoxicilline", null]]),
    );
    expect(findings.some((f) => f.code === "DRUG_NOT_IDENTIFIED")).toBe(true);
  });

  it("avertit qu'un médicament identifié n'a aucune interaction renseignée", () => {
    // Le catalogue national dit ce qu'EST un médicament ; il ne dit rien de ses
    // interactions. Sans ce signal, un écran sans alerte se lirait « rien à
    // signaler » — ce qui serait faux.
    const findings = evaluateKnowledgeCoverage(
      [{ drugName: "Amoxicilline" }],
      new Map([["amoxicilline", drug({ interactionClasses: [], cautionPopulations: [] })]]),
      new Map([["amoxicilline", officialFacts()]]),
    );
    const finding = findings.find((f) => f.code === "DRUG_NO_INTERACTION_DATA");
    expect(finding?.severity).toBe("WARNING");
    expect(finding?.message).toContain("L'absence d'alerte ne vaut pas absence de risque");
  });

  it("avertit même quand d'autres données de vigilance existent", () => {
    // Des populations à surveiller ne sont pas des interactions : renseigner
    // les unes ne dit rien des autres.
    const findings = evaluateKnowledgeCoverage(
      [{ drugName: "Paracétamol" }],
      new Map([
        [
          "paracétamol",
          drug({
            interactionClasses: [],
            cautionPopulations: ["insuffisance hépatique"],
          }),
        ],
      ]),
      new Map([["paracétamol", officialFacts({ name: "DAFALGAN 1 g, comprimé pelliculé" })]]),
    );
    expect(findings.some((f) => f.code === "DRUG_NO_INTERACTION_DATA")).toBe(true);
  });

  it("se tait quand le médicament est identifié ET couvert", () => {
    const findings = evaluateKnowledgeCoverage(
      [{ drugName: "Amoxicilline" }],
      new Map([["amoxicilline", drug({ interactionClasses: ["anticoagulants oraux"] })]]),
      new Map([["amoxicilline", officialFacts()]]),
    );
    expect(findings).toHaveLength(0);
  });

  it("signale explicitement une donnée de démonstration", () => {
    const findings = evaluateKnowledgeCoverage(
      [{ drugName: "Amoxicilline" }],
      new Map([["amoxicilline", drug({ isDemoData: true })]]),
    );
    expect(findings.some((f) => f.code === "DEMO_REFERENTIAL")).toBe(true);
  });
});

describe("moteur de sécurité — opportunités", () => {
  it("bloque un apport minéral en cas d'insuffisance rénale", () => {
    const opportunities = detectAdviceOpportunities({
      drugs: [
        {
          lineIndex: 0,
          drugName: "Escitalopram",
          knowledge: drug({
            name: "Escitalopram",
            atcCode: "N06AB10",
            therapeuticClass: "Antidépresseur",
            commonSideEffects: ["fatigue"],
          }),
        },
      ],
      patient: patient({ renalImpairment: true }),
    });

    const magnesium = opportunities.find((o) => o.key === "magnesium-fatigue");
    expect(magnesium).toBeDefined();
    expect(magnesium?.isBlocked).toBe(true);
  });

  it("bloque un conseil dont la classe interagit avec le traitement", () => {
    const opportunities = detectAdviceOpportunities({
      drugs: [
        {
          lineIndex: 0,
          drugName: "Amoxicilline",
          knowledge: drug(),
        },
      ],
      patient: patient(),
    });

    const evaluation = evaluateOpportunitySafety(
      opportunities,
      patient(),
      [drug({ interactionClasses: ["probiotique"] })],
    );

    expect(evaluation.blockedOpportunityKeys.has("digestive-tolerance-antibiotics")).toBe(true);
    expect(
      evaluation.findings.some((f) => f.code === "DOCUMENTED_INTERACTION"),
    ).toBe(true);
  });
});

describe("moteur de sécurité — produits", () => {
  it("écarte un produit correspondant à une allergie déclarée", () => {
    const { blockedProductIds, findings } = evaluateProductSafety(
      [product({ id: "p1", matchingTags: ["arachide", "protéine"] })],
      patient({ allergies: ["arachide"] }),
    );

    expect(blockedProductIds.has("p1")).toBe(true);
    expect(findings.some((f) => f.code === "PATIENT_ALLERGY")).toBe(true);
  });

  it("écarte un produit contre-indiqué pendant la grossesse", () => {
    const { blockedProductIds } = evaluateProductSafety(
      [product({ id: "p2", contraindications: ["grossesse"] })],
      patient({ isPregnant: true }),
    );
    expect(blockedProductIds.has("p2")).toBe(true);
  });

  it("écarte un produit inactif", () => {
    const { blockedProductIds } = evaluateProductSafety(
      [product({ id: "p3", isActive: false })],
      patient(),
    );
    expect(blockedProductIds.has("p3")).toBe(true);
  });

  it("laisse passer un produit sans signal", () => {
    const { blockedProductIds, findings } = evaluateProductSafety(
      [product({ id: "p4" })],
      patient(),
    );
    expect(blockedProductIds.size).toBe(0);
    expect(findings).toHaveLength(0);
  });
});
