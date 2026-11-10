import { describe, expect, it } from "vitest";
import { cleanRoutes, drugRoutesOf, routesAllow, routesLabel } from "../routes";
import { atcKey, buildAssociationAdvice, type AssociationInput } from "@/core/ai/engines/associations";
import { patient, product } from "@/core/ai/__tests__/fixtures";

/**
 * « Un Niflugel (gel) m'a sorti un oméprazole » (fondateur, 10 nov. 2026) : une association peut ne valoir que pour
 * certaines formes du médicament déclencheur — un IPP sous anti-inflammatoire, à avaler seulement.
 */

describe("la forme d'un médicament", () => {
  it("se lit dans les voies officielles", () => {
    expect([...drugRoutesOf({ routes: ["cutanée"], form: "gel", name: "NIFLUGEL 2,5 %, gel" })]).toEqual(["SKIN"]);
    expect([...drugRoutesOf({ routes: ["orale"], form: "comprimé pelliculé" })]).toEqual(["ORAL"]);
    expect([...drugRoutesOf({ routes: ["transdermique"] })]).toEqual(["SKIN"]);
    expect([...drugRoutesOf({ routes: ["rectale"] })]).toEqual(["RECTAL_VAGINAL"]);
    expect([...drugRoutesOf({ routes: ["sous-cutanée"] })]).toEqual(["INJECTABLE"]);
  });

  it("à défaut, dans la forme ou le nom de la boîte", () => {
    expect([...drugRoutesOf({ name: "VOLTARENE EMULGEL 1 %, gel" })]).toEqual(["SKIN"]);
    expect([...drugRoutesOf({ name: "IBUPROFENE 400 mg, comprimé pelliculé" })]).toEqual(["ORAL"]);
    expect([...drugRoutesOf({ name: "FLECTOR TISSUGEL 1 %, emplâtre médicamenteux" })]).toContain("SKIN");
    expect([...drugRoutesOf({ name: "GAVISCON, suspension buvable" })]).toEqual(["ORAL"]);
    expect([...drugRoutesOf({ name: "XYZ" })]).toEqual([]);
  });

  it("aucune forme cochée : toujours ; forme inconnue avec une limite : jamais", () => {
    expect(routesAllow([], [])).toBe(true);
    expect(routesAllow(["ORAL"], ["ORAL"])).toBe(true);
    expect(routesAllow(["ORAL"], ["SKIN"])).toBe(false);
    expect(routesAllow(["ORAL"], [])).toBe(false);
    expect(cleanRoutes(["SKIN", "ZZZ", "ORAL", "ORAL"])).toEqual(["ORAL", "SKIN"]);
    expect(routesLabel(["ORAL"])).toBe("À avaler (per os)");
    expect(routesLabel([])).toBeNull();
  });
});

describe("au comptoir : IPP sous anti-inflammatoire, à avaler seulement", () => {
  const ipp = product({ id: "ipp", name: "OMEPRAZOLE 20 mg gélule", category: "AUTRE", stockQuantity: 10 });
  const rules: AssociationInput["rules"] = [{ id: "central:ipp", triggerKey: atcKey("M0"), adviceProductId: "ipp", sentence: null, sortOrder: 0, routes: ["ORAL"] }];
  const run = (lineRoutes: string[]) =>
    buildAssociationAdvice({
      association: { rules, lines: [{ lineIndex: 0, keys: [atcKey("M0")], productId: null, routes: lineRoutes }] },
      lines: [{ lineIndex: 0, drugName: "ANTI-INFLAMMATOIRE" }],
      catalog: [ipp],
      blockedProductIds: new Set(),
      alreadyProposedProductIds: new Set(),
      patient: patient(),
    });

  it("un gel ne déclenche pas l'IPP", () => expect(run(["SKIN"]).recommendations).toHaveLength(0));
  it("un comprimé le déclenche", () => expect(run(["ORAL"]).recommendations).toHaveLength(1));
  it("une forme inconnue ne le déclenche pas", () => expect(run([]).recommendations).toHaveLength(0));
});
