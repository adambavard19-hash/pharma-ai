import { describe, expect, it } from "vitest";
import { normalizeSearchText } from "../search";

/**
 * La règle vaut des deux côtés : ce qui est stocké à l'import et ce que le
 * pharmacien tape passent par cette même fonction. Si elle divergeait d'un
 * côté, la recherche ne rendrait plus rien — sans erreur, sans message.
 */
describe("normalizeSearchText", () => {
  it("retire les accents que la source met partout", () => {
    // 2 309 des 3 988 libellés de substance sont accentués.
    expect(normalizeSearchText("PARACÉTAMOL")).toBe("PARACETAMOL");
    expect(normalizeSearchText("IBUPROFÈNE")).toBe("IBUPROFENE");
    expect(normalizeSearchText("MALÉATE DE CHLORPHÉNAMINE")).toBe("MALEATE DE CHLORPHENAMINE");
    expect(normalizeSearchText("17BÊTA-ESTRADIOL")).toBe("17BETA-ESTRADIOL");
  });

  it("rend la même forme quel que soit le côté du clavier", () => {
    expect(normalizeSearchText("paracetamol")).toBe(normalizeSearchText("PARACÉTAMOL"));
    expect(normalizeSearchText("  Ibuprofène  ")).toBe(normalizeSearchText("IBUPROFENE"));
  });

  it("réduit les espaces sans coller les mots", () => {
    expect(normalizeSearchText("ACIDE   ASCORBIQUE")).toBe("ACIDE ASCORBIQUE");
    expect(normalizeSearchText("\tACIDE\nASCORBIQUE ")).toBe("ACIDE ASCORBIQUE");
  });

  it("laisse intact ce qui n'a pas d'accent", () => {
    expect(normalizeSearchText("DOLIPRANE 1000 mg")).toBe("DOLIPRANE 1000 MG");
    expect(normalizeSearchText("")).toBe("");
  });
});
