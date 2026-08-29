import { describe, expect, it } from "vitest";
import { blocksCounter, counterIsBlocked } from "../safety-gate";

const finding = (overrides: Partial<Parameters<typeof blocksCounter>[0]> = {}) => ({
  severity: "BLOCKING",
  subjectType: "PRESCRIPTION_LINE",
  acknowledged: false,
  ...overrides,
});

describe("garde-fou du comptoir", () => {
  it("ferme les conseils quand le traitement lui-même n'est pas fiable", () => {
    expect(blocksCounter(finding({ subjectType: "ANALYSIS" }))).toBe(true);
    expect(blocksCounter(finding({ subjectType: "PRESCRIPTION_LINE" }))).toBe(true);
  });

  /**
   * Une allergie ou une interaction documentée a déjà fait écarter la
   * proposition en amont : la répéter comme un barrage n'ajoute aucune sécurité
   * et coûte un clic sur chaque ordonnance.
   */
  it("n'arrête pas le comptoir pour une exclusion déjà appliquée par le moteur", () => {
    expect(blocksCounter(finding({ subjectType: "PRODUCT" }))).toBe(false);
    expect(blocksCounter(finding({ subjectType: "OPPORTUNITY" }))).toBe(false);
  });

  it("rouvre les conseils une fois l'alerte acquittée par un professionnel", () => {
    expect(blocksCounter(finding({ acknowledged: true }))).toBe(false);
  });

  it("ne bloque jamais sur une alerte non bloquante", () => {
    for (const severity of ["INFO", "CAUTION", "WARNING"]) {
      expect(blocksCounter(finding({ severity }))).toBe(false);
    }
  });

  it("bloque dès qu'une seule alerte du lot l'exige", () => {
    expect(
      counterIsBlocked([
        finding({ severity: "INFO", subjectType: "PRESCRIPTION_LINE" }),
        finding({ subjectType: "PRODUCT" }),
        finding({ subjectType: "ANALYSIS" }),
      ]),
    ).toBe(true);

    expect(
      counterIsBlocked([
        finding({ severity: "WARNING" }),
        finding({ subjectType: "OPPORTUNITY" }),
        finding({ acknowledged: true }),
      ]),
    ).toBe(false);
  });
});
