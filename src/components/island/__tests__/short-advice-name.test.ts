import { describe, expect, it } from "vitest";
import { shortAdviceName, whiteFoundWidth } from "../scan-capsule";

/** Le nom court des conseils sur la petite bannière blanche (poste du 29 oct. 2026 : le nom long débordait, la bannière était coupée). */
describe("le nom court d'un conseil au scan", () => {
  it("garde ce qui vient avant la virgule, le tiret ou la forme", () => {
    expect(shortAdviceName("Hydratis, pastilles d'électrolytes - goût au choix")).toBe("Hydratis");
    expect(shortAdviceName("Cicaplast Lèvres baume réparateur")).toBe("Cicaplast Lèvres");
    expect(shortAdviceName("Lactibiane Imedia")).toBe("Lactibiane Imedia");
  });

  it("coupe un libellé de stock trop long sur un mot, 22 caractères au plus", () => {
    const name = shortAdviceName("HYDRAFIZZ HYDRA CITR CPR EFFERV 16");
    expect(name.length).toBeLessThanOrEqual(22);
    expect(name.startsWith("HYDRAFIZZ")).toBe(true);
  });

  it("la bannière ne dépasse jamais 420 px, même avec trois noms", () => {
    expect(whiteFoundWidth([{ name: "x".repeat(22) }, { name: "y".repeat(22) }, { name: "z".repeat(22) }])).toBeLessThanOrEqual(420);
  });
});
