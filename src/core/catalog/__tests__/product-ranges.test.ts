import { describe, expect, it } from "vitest";
import { PRODUCT_RANGES, rangeOf } from "../product-ranges";

describe("les gammes proposées sans parfum imposé", () => {
  it("toute référence Hydratis se propose comme la gamme, le patient choisit le goût", () => {
    for (const name of ["HYDRATIS PAST EFF MANGUE PASSION X20", "Hydratis citron fleur de sureau 20 pastilles", "hydratis neutre"]) {
      expect(rangeOf(name)?.name).toBe("Hydratis, pastilles d'électrolytes · goût au choix");
    }
    expect(rangeOf("HYDRAFIZZ")).toBeNull();
    expect(rangeOf(null)).toBeNull();
  });

  it("la posologie dit combien et combien de fois par jour, jamais une mise en garde ; elle tient dans la fiche du comptoir", () => {
    for (const range of PRODUCT_RANGES) {
      const text = range.posology.join(" ");
      expect(text).toMatch(/par jour/);
      expect(text).not.toMatch(/consultez|diarrh|fièvre|selles/i);
      expect(text.length).toBeLessThanOrEqual(360);
      expect(range.source.url).toMatch(/^https:\/\//);
    }
  });
});
