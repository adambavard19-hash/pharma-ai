import { describe, expect, it } from "vitest";
import { alternativeFromRecommendation, parseStoredAlternatives } from "../alternatives";
import type { ScoredAlternative } from "../types";
import { AMOXICILLINE, analyse, probioticShelf } from "./scenarios-conseils";

/**
 * Ce qui revient de la base n'est jamais cru sur parole : une alternative
 * incomplète est ignorée, jamais réparée ni inventée.
 */

const BREAKDOWN = { relevance: 1, safety: 1, availability: 1, patientFit: 0.95, pharmacistPreference: 0.5, validationHistory: 0.5, commercial: 0.8 };

function entry(overrides: Record<string, unknown> = {}) {
  return {
    productId: "prod-b",
    totalScore: 0.88,
    breakdown: BREAKDOWN,
    justification: "Tolérance digestive — Référence retenue : Probiotique B.",
    shortReason: "Antibiothérapie : la flore intestinale peut être perturbée.",
    patientReason: "Probiotique B l'accompagne.",
    counterScript: "« Probiotique B l'accompagne. »",
    precautions: ["À conserver au frais."],
    explanation: [{ dimension: "relevance", label: "Pertinence du conseil", value: 1, weight: 0.4, detail: "catégorie probiotiques", role: "SCORE" }],
    vigilances: [{ population: "PREGNANCY", level: "CAUTION", status: true, text: "À vérifier.", origin: "PRODUCT", sources: ["Déclaré par la pharmacie"] }],
    shortDate: { expiresOn: "2026-11-20", daysLeft: 40, level: "SOON" },
    ...overrides,
  };
}

describe("parseStoredAlternatives", () => {
  it("ne rend rien d'une colonne vide ou qui n'est pas une liste", () => {
    for (const value of [null, undefined, "x", 3, {}, { productId: "a" }]) expect(parseStoredAlternatives(value)).toEqual([]);
  });

  it("relit une alternative complète, telle qu'écrite", () => {
    const [alternative] = parseStoredAlternatives([entry()]);
    expect(alternative).toMatchObject({
      productId: "prod-b",
      totalScore: 0.88,
      breakdown: BREAKDOWN,
      shortReason: "Antibiothérapie : la flore intestinale peut être perturbée.",
      counterScript: "« Probiotique B l'accompagne. »",
      precautions: ["À conserver au frais."],
      shortDate: { level: "SOON", daysLeft: 40 },
    });
    expect(alternative.vigilances).toHaveLength(1);
    expect(alternative.explanation).toHaveLength(1);
  });

  it("relit ce que le moteur écrit, sans rien perdre", () => {
    const retained = analyse([AMOXICILLINE], probioticShelf()).recommendations[0];
    const written = JSON.parse(JSON.stringify(retained.alternatives)) as unknown;
    const read = parseStoredAlternatives(written);
    expect(read).toHaveLength(3);
    expect(read.map((a) => a.productId)).toEqual((retained.alternatives ?? []).map((a) => a.productId));
    for (const [index, alternative] of read.entries()) {
      const original = (retained.alternatives ?? [])[index] as ScoredAlternative;
      expect(alternative).toMatchObject({
        totalScore: original.totalScore,
        breakdown: original.breakdown,
        justification: original.justification,
        patientReason: original.patientReason,
        counterScript: original.counterScript,
        precautions: original.precautions,
        explanation: original.explanation,
      });
    }
  });

  it("ignore une entrée à laquelle il manque de quoi la substituer", () => {
    const incomplete = [
      entry({ productId: "" }),
      entry({ productId: 12 }),
      entry({ totalScore: "0.9" }),
      entry({ totalScore: Number.NaN }),
      entry({ breakdown: { relevance: 1 } }),
      entry({ breakdown: null }),
      entry({ counterScript: undefined }),
      entry({ patientReason: null }),
      entry({ shortReason: 4 }),
      entry({ justification: undefined }),
      null,
      "prod-b",
      [],
    ];
    expect(parseStoredAlternatives(incomplete)).toEqual([]);
    // Les bonnes entrées voisines sont conservées.
    expect(parseStoredAlternatives([entry({ productId: "" }), entry({ productId: "prod-c" })]).map((a) => a.productId)).toEqual(["prod-c"]);
  });

  it("garde une seule entrée par produit, la première", () => {
    const read = parseStoredAlternatives([entry({ totalScore: 0.9 }), entry({ totalScore: 0.5 }), entry({ productId: "prod-c" })]);
    expect(read.map((a) => [a.productId, a.totalScore])).toEqual([["prod-b", 0.9], ["prod-c", 0.88]]);
  });

  it("nettoie les champs facultatifs sans écarter l'alternative", () => {
    const [alternative] = parseStoredAlternatives([
      entry({
        precautions: ["Une précaution", 4, null],
        explanation: [{ dimension: "inconnue" }, "x", { dimension: "safety", label: "Sécurité", value: 1, weight: 0.26, detail: "aucun signal", role: "SCORE" }],
        vigilances: [{ population: "PREGNANCY" }, "x"],
        shortDate: { expiresOn: "demain" },
        companion: { productId: "seringue" },
      }),
    ]);
    expect(alternative.precautions).toEqual(["Une précaution"]);
    expect(alternative.explanation).toHaveLength(1);
    expect(alternative.vigilances).toEqual([]);
    expect(alternative.shortDate).toBeNull();
    expect(alternative).not.toHaveProperty("companion");
  });

  it("relit un produit associé complet", () => {
    const companion = { productId: "seringue", name: "Seringue nasale", salePriceCents: 590, stockQuantity: 4, label: "Seringue ou dispositif de lavage nasal", reason: "Pour laver le nez." };
    expect(parseStoredAlternatives([entry({ companion })])[0].companion).toEqual(companion);
  });
});

describe("alternativeFromRecommendation", () => {
  const row = (overrides: Record<string, unknown> = {}) => ({
    productId: "prod-a",
    totalScore: 0.89,
    scoreBreakdown: { ...BREAKDOWN, explanation: entry().explanation },
    justification: "Tolérance digestive — Référence retenue : Probiotique A.",
    shortReason: "Antibiothérapie : la flore intestinale peut être perturbée.",
    patientReason: "Probiotique A l'accompagne.",
    counterScript: "« Probiotique A l'accompagne. »",
    precautions: [] as string[],
    vigilances: null,
    companion: null,
    ...overrides,
  });

  it("reconstitue le conseil retenu comme une alternative, détail du score compris", () => {
    expect(alternativeFromRecommendation(row())).toMatchObject({
      productId: "prod-a",
      totalScore: 0.89,
      breakdown: BREAKDOWN,
      justification: "Tolérance digestive — Référence retenue : Probiotique A.",
      counterScript: "« Probiotique A l'accompagne. »",
      precautions: [],
      vigilances: [],
    });
    expect(alternativeFromRecommendation(row())?.explanation).toHaveLength(1);
    expect(alternativeFromRecommendation(row())?.breakdown).not.toHaveProperty("explanation");
  });

  it("garde les vigilances et le produit associé de la ligne", () => {
    const companion = { productId: "seringue", name: "Seringue nasale", salePriceCents: 590, stockQuantity: 4, label: "Seringue ou dispositif de lavage nasal", reason: "Pour laver le nez." };
    const rebuilt = alternativeFromRecommendation(row({ vigilances: entry().vigilances, companion }));
    expect(rebuilt?.vigilances).toHaveLength(1);
    expect(rebuilt?.companion).toEqual(companion);
  });

  it("des textes absents deviennent des textes vides : le conseil retenu reste reconstituable", () => {
    const rebuilt = alternativeFromRecommendation(row({ shortReason: null, patientReason: null, counterScript: null }));
    expect(rebuilt).toMatchObject({ shortReason: "", patientReason: "", counterScript: "" });
  });

  it("ne reconstitue rien d'un conseil sans produit de l'officine ni détail de score", () => {
    expect(alternativeFromRecommendation(row({ productId: null }))).toBeNull();
    // Un conseil ajouté à la main n'a pas de détail de score.
    expect(alternativeFromRecommendation(row({ scoreBreakdown: { manual: true } }))).toBeNull();
    expect(alternativeFromRecommendation(row({ scoreBreakdown: null }))).toBeNull();
  });
});
