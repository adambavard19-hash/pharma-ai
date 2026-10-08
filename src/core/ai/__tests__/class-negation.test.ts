import { describe, expect, it } from "vitest";
import { classNames, detectAdviceOpportunities } from "../engines/advice";
import { drug, patient } from "./fixtures";

/**
 * Une classe écrite « Antalgique antipyrétique non opioïde » nomme un opioïde dans le texte, mais dit le contraire.
 * Constaté au comptoir (8 oct. 2026) : le Doliprane 100 mg déclenchait « Opioïde (PARACETAMOL) : la constipation est un effet
 * quasi constant » et proposait des fibres.
 */

describe("classNames — un terme précédé d'une négation n'est pas nommé", () => {
  it("« non opioïde », « sans opioïde », « pas d'opioïde » ne nomment pas un opioïde", () => {
    for (const text of ["Antalgique antipyrétique non opioïde", "Antalgique non-opioïde", "Antalgique sans opioïde", "Antalgique, pas d'opioïde", "antalgique AUCUN opioïde"]) {
      expect(classNames(text, "Opioïde"), text).toBe(false);
    }
  });

  it("un opioïde est reconnu, avec ou sans majuscule", () => {
    for (const text of ["Antalgique opioïde", "Opioïde", "antalgique de palier 2 (opioïde faible)", "Analgésique OPIOÏDE"]) {
      expect(classNames(text, "Opioïde"), text).toBe(true);
    }
  });

  it("une mention négative n'empêche pas une mention positive plus loin", () => {
    expect(classNames("Antalgique non opioïde, associé à un opioïde", "opioïde")).toBe(true);
  });

  it("un terme absent, ou vide, ne correspond à rien", () => {
    expect(classNames("Antibiotique", "Opioïde")).toBe(false);
    expect(classNames("Antibiotique", "")).toBe(false);
  });
});

describe("le parcours complet : le paracétamol n'ouvre pas la règle des opioïdes", () => {
  const keysFor = (name: string, atcCode: string, therapeuticClass: string) =>
    detectAdviceOpportunities({
      drugs: [{ lineIndex: 0, drugName: name, knowledge: drug({ name, inn: name.toUpperCase(), atcCode, therapeuticClass, commonSideEffects: [] }) }],
      patient: patient(),
    }).map((opportunity) => opportunity.key);

  it("Doliprane (classe « non opioïde ») : pas de conseil de transit", () => {
    expect(keysFor("DOLIPRANE 100 mg", "N02BE01", "Antalgique antipyrétique non opioïde")).not.toContain("opioid-transit");
  });

  it("tramadol (opioïde) : le conseil de transit reste proposé", () => {
    expect(keysFor("TRAMADOL 50 mg", "N02AX02", "Antalgique opioïde")).toContain("opioid-transit");
  });
});
