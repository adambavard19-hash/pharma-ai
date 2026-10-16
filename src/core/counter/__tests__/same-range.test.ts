import { describe, expect, it } from "vitest";
import { rangeKey, sameRange } from "../same-range";

describe("deux produits de la même gamme", () => {
  it("un autre parfum ou un autre format de la même gamme : même gamme (essai de Donna, 16 oct. 2026)", () => {
    expect(sameRange({ name: "NEOBIANACID ACID REFLUX MENTHE CPR CROQ70" }, { name: "NEOBIANACID CITRON CPR 70" })).toBe(true);
    expect(sameRange({ name: "BACCIDE GEL MAIN S RINCAG 30ML" }, { name: "BACCIDE GEL MAIN S/RINC BLEU 100ML" })).toBe(true);
  });

  it("un mot courant n'est pas une gamme : « gel », « crème », « vitamine », un mot trop court", () => {
    expect(rangeKey("GEL DOUCHE SURGRAS")).toBeNull();
    expect(rangeKey("Crème hydratante visage")).toBeNull();
    expect(rangeKey("VITAMINE C 1000 effervescent")).toBeNull();
    expect(rangeKey("F TEST FRONTAL")).toBeNull();
    expect(sameRange({ name: "Crème hydratante visage" }, { name: "Crème mains" })).toBe(false);
  });

  it("deux gammes différentes ne se confondent pas ; la marque, quand elle est connue, l'emporte", () => {
    expect(sameRange({ name: "THERAPEARL DOS" }, { name: "THERMCOOL HOT POCHE" })).toBe(false);
    expect(sameRange({ name: "Gel lavant", brand: "Avène" }, { name: "Eau thermale", brand: "AVENE" })).toBe(true);
  });
});
