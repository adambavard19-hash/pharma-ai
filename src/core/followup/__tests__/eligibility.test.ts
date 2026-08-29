import { describe, expect, it } from "vitest";
import { evaluateSendEligibility, type SendEligibilityInput } from "../eligibility";

const NOW = new Date("2026-03-20T10:00:00Z");

const input = (overrides: Partial<SendEligibilityInput> = {}): SendEligibilityInput => ({
  hasConsent: true,
  optedOut: false,
  hasContact: true,
  hasSharableLink: true,
  lastFollowUpAt: null,
  minIntervalDays: 30,
  now: NOW,
  ...overrides,
});

describe("droit d'envoyer un suivi", () => {
  it("autorise un patient consentant, joignable, jamais sollicité", () => {
    expect(evaluateSendEligibility(input())).toEqual({ allowed: true });
  });

  /**
   * La désinscription prime sur tout, y compris sur un consentement recueilli
   * plus tôt au comptoir : c'est la dernière volonté exprimée par le patient.
   */
  it("respecte la désinscription avant toute autre condition", () => {
    const result = evaluateSendEligibility(input({ optedOut: true, hasConsent: true }));
    expect(result).toMatchObject({ allowed: false, code: "OPTED_OUT" });
  });

  it("refuse sans consentement explicite", () => {
    expect(evaluateSendEligibility(input({ hasConsent: false }))).toMatchObject({
      allowed: false,
      code: "NO_CONSENT",
    });
  });

  it("refuse sans adresse de contact", () => {
    expect(evaluateSendEligibility(input({ hasContact: false }))).toMatchObject({
      allowed: false,
      code: "NO_CONTACT",
    });
  });

  /**
   * Le message ne contenant aucune donnée de santé, le lien EST son contenu :
   * sans fiche à partager, il n'y a rien à envoyer.
   */
  it("refuse quand il n'y a aucune fiche à partager", () => {
    expect(evaluateSendEligibility(input({ hasSharableLink: false }))).toMatchObject({
      allowed: false,
      code: "NO_LINK",
    });
  });
});

describe("plafond anti-sollicitation", () => {
  it("bloque un second suivi trop rapproché", () => {
    const result = evaluateSendEligibility(
      input({ lastFollowUpAt: new Date("2026-03-10T10:00:00Z"), minIntervalDays: 30 }),
    );
    expect(result).toMatchObject({ allowed: false, code: "TOO_SOON" });
    if (!result.allowed) {
      expect(result.nextPossibleAt?.toISOString()).toBe("2026-04-09T10:00:00.000Z");
    }
  });

  it("rouvre l'envoi une fois le délai écoulé", () => {
    expect(
      evaluateSendEligibility(
        input({ lastFollowUpAt: new Date("2026-01-01T10:00:00Z"), minIntervalDays: 30 }),
      ),
    ).toEqual({ allowed: true });
  });

  it("n'applique aucun plafond quand l'officine le met à zéro", () => {
    expect(
      evaluateSendEligibility(
        input({ lastFollowUpAt: new Date("2026-03-19T10:00:00Z"), minIntervalDays: 0 }),
      ),
    ).toEqual({ allowed: true });
  });
});
