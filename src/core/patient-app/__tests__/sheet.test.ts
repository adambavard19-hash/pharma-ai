import { describe, expect, it } from "vitest";
import { buildDrugSheet, isParapharmacy, normalizeScannedCode, type DrugSheetInput } from "../sheet";

const base: DrugSheetInput = {
  cisCode: "65203952",
  name: "DOXYCYCLINE BIOGARAN 100 mg, comprimé pelliculé sécable",
  form: "comprimé pelliculé sécable",
  routes: ["orale"],
  presentation: "plaquette(s) de 5 comprimé(s)",
  substances: [{ label: "HYCLATE DE DOXYCYCLINE", dosage: "100 mg" }],
  prescriptionConditions: ["liste I"],
  reimbursementRate: 65,
  family: { atcCode: "J01AA02", label: "Tetracyclines" },
  officialSideEffects: [],
  editorial: null,
};

describe("appli des patients : le code lu par la caméra ou tapé", () => {
  it("lit un CIP13, un CIP7, un EAN de parapharmacie", () => {
    expect(normalizeScannedCode("3400935332639")).toEqual({ kind: "CIP13", code: "3400935332639" });
    expect(normalizeScannedCode("3533263")).toEqual({ kind: "CIP7", code: "3533263" });
    expect(normalizeScannedCode("3337875597180")).toEqual({ kind: "EAN", code: "3337875597180" });
  });

  it("ramène un Datamatrix de boîte (GS1 01 + GTIN-14 03400…, lot, date) et un GTIN-14 au CIP13", () => {
    expect(normalizeScannedCode("0103400935332639172712311012345")).toEqual({ kind: "CIP13", code: "3400935332639" });
    expect(normalizeScannedCode("(01)03400935332639(17)271231")).toEqual({ kind: "CIP13", code: "3400935332639" });
    expect(normalizeScannedCode("03400935332639")).toEqual({ kind: "CIP13", code: "3400935332639" });
  });

  it("refuse ce qui n'est pas un code : un nom, une longueur impossible", () => {
    expect(normalizeScannedCode("doxycycline")).toBeNull();
    expect(normalizeScannedCode("12345")).toBeNull();
    expect(normalizeScannedCode("")).toBeNull();
  });
});

describe("appli des patients : la fiche ne dit que ce qu'une source publiée dit", () => {
  it("sans fiche éditoriale réelle, ni « À quoi ça sert » ni « Comment le prendre » ; sans RCP lu, pas d'effets indésirables", () => {
    const sheet = buildDrugSheet(base);
    expect(sheet.sections.map((s) => s.key)).toEqual(["family", "composition"]);
    expect(sheet.sections.every((s) => s.source.length > 0)).toBe(true);
  });

  it("les effets du RCP (BDPM 4.8) et la fiche éditoriale apparaissent avec leur source quand ils existent", () => {
    const sheet = buildDrugSheet({ ...base, officialSideEffects: ["nausées"], editorial: { explanation: "Texte de la fiche", intake: null, sourceName: "Fiche éditoriale" } });
    expect(sheet.sections.map((s) => s.key)).toEqual(["usage", "family", "composition", "sideEffects"]);
    expect(sheet.sections.find((s) => s.key === "sideEffects")?.source).toMatch(/rubrique 4\.8/);
  });

  it("dit l'ordonnance d'après la BDPM, le remboursement, et renvoie à la fiche officielle ; jamais de note", () => {
    const sheet = buildDrugSheet(base);
    expect(sheet.delivery).toBe("PRESCRIPTION");
    expect(sheet.reimbursement).toBe("Remboursé à 65 %");
    expect(sheet.sourceUrl).toBe("https://base-donnees-publique.medicaments.gouv.fr/medicament/65203952/extrait");
    expect(JSON.stringify(sheet)).not.toMatch(/note|score|\/10/i);
    expect(buildDrugSheet({ ...base, prescriptionConditions: [] }).delivery).toBe("NO_PRESCRIPTION");
  });

  it("seule la parapharmacie est proposable : un code CIP 3400 ou une condition de délivrance l'écarte", () => {
    expect(isParapharmacy({ ean: "3337875597180" })).toBe(true);
    expect(isParapharmacy({ ean: "3400935332639" })).toBe(false);
    expect(isParapharmacy({ ean: null, cip13: "3400935332639" })).toBe(false);
    expect(isParapharmacy({ ean: "3337875597180", prescriptionConditions: ["liste II"] })).toBe(false);
  });
});
