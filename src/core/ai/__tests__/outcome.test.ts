import { describe, expect, it } from "vitest";
import { OUTCOME_MESSAGES, deriveOutcome, isEngineOutcome, type OutcomeSignals } from "../outcome";

const base: OutcomeSignals = {
  recommendationCount: 0,
  opportunityCount: 3,
  blockedOpportunityCount: 0,
  stockConfigured: true,
  inStockCandidateCount: 0,
  outOfStockCandidateCount: 0,
  safetyRemovedCount: 0,
  aiUnavailable: false,
  failed: false,
};

describe("l'issue d'une analyse", () => {
  it("dit PROPOSALS dès qu'une proposition existe", () => {
    expect(deriveOutcome({ ...base, recommendationCount: 1 })).toBe("PROPOSALS");
  });

  it("distingue « aucun besoin » d'« IA indisponible »", () => {
    expect(deriveOutcome({ ...base, opportunityCount: 0 })).toBe("NO_RELEVANT_NEED");
    expect(deriveOutcome({ ...base, opportunityCount: 0, aiUnavailable: true })).toBe("AI_UNAVAILABLE");
  });

  it("nomme le stock jamais importé avant toute autre explication", () => {
    expect(deriveOutcome({ ...base, stockConfigured: false })).toBe("STOCK_NOT_CONFIGURED");
  });

  it("distingue la rupture de l'absence de référence adaptée", () => {
    expect(deriveOutcome({ ...base, outOfStockCandidateCount: 2 })).toBe("OUT_OF_STOCK");
    expect(deriveOutcome(base)).toBe("NO_COMPATIBLE_PRODUCT");
  });

  it("attribue à la sécurité ce qu'elle a écarté", () => {
    expect(deriveOutcome({ ...base, blockedOpportunityCount: 3 })).toBe("SAFETY_FILTERED");
    expect(deriveOutcome({ ...base, inStockCandidateCount: 2, safetyRemovedCount: 2 })).toBe("SAFETY_FILTERED");
    // Des candidats en stock écartés seulement pour pertinence insuffisante : ce n'est pas la sécurité.
    expect(deriveOutcome({ ...base, inStockCandidateCount: 2, safetyRemovedCount: 1 })).toBe("NO_COMPATIBLE_PRODUCT");
  });

  it("signale une erreur moteur avant tout", () => {
    expect(deriveOutcome({ ...base, failed: true, recommendationCount: 5 })).toBe("ENGINE_ERROR");
  });

  it("a un message lisible pour chaque issue sans proposition, sans code technique", () => {
    for (const [code, message] of Object.entries(OUTCOME_MESSAGES)) {
      expect(message.title.length).toBeGreaterThan(10);
      expect(message.body).not.toContain(code);
      expect(message.body).not.toMatch(/[A-Z]{4,}_[A-Z]+/);
    }
    expect(OUTCOME_MESSAGES.STOCK_NOT_CONFIGURED.action).toBe("IMPORT_STOCK");
    expect(OUTCOME_MESSAGES.NO_RELEVANT_NEED.title).toBe("Aucun complément pertinent identifié");
  });

  it("reconnaît un code d'issue", () => {
    expect(isEngineOutcome("OUT_OF_STOCK")).toBe(true);
    expect(isEngineOutcome("RIEN")).toBe(false);
    expect(isEngineOutcome(null)).toBe(false);
  });
});
