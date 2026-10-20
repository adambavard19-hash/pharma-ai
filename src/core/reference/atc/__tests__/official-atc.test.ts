import { describe, expect, it } from "vitest";
import { OFFICIAL_ATC_ATTRIBUTION, OFFICIAL_ATC_SOURCE, officialAtcForCis, officialCisForAtcPrefix, officialTherapeuticClass } from "../official-atc";
import { OFFICIAL_ATC_BY_CIS } from "../official-atc-data";

/**
 * La famille officielle, lue dans la table générée depuis Open Medic 2025 et la BDPM (`npm run atc:officiel`). Les codes
 * CIS ci-dessous sont de vraies spécialités du catalogue national : si une régénération les change, le test le dit.
 */

const ANTIHISTAMINIQUE = "Antihistaminiques a usage systemique — derives de la piperazine";

describe("famille officielle d'une spécialité", () => {
  it("cétirizine générique remboursée (CETIRIZINE BIOGARAN 10 mg, comprimé) : R06AE07, d'après ses boîtes", () => {
    expect(officialAtcForCis("61665908")).toEqual({ atcCode: "R06AE07", therapeuticClass: ANTIHISTAMINIQUE, basis: "BOX" });
    // Une autre marque de générique, même famille.
    expect(officialAtcForCis("62005883")?.atcCode).toBe("R06AE07");
  });

  it("cétirizine non remboursée (ZYRTECSET 10 mg, CETIRIZINE BIOGARAN CONSEIL 10 mg) : R06AE07, d'après les mêmes substances", () => {
    expect(officialAtcForCis("62636293")).toEqual({ atcCode: "R06AE07", therapeuticClass: ANTIHISTAMINIQUE, basis: "SUBSTANCE" });
    expect(officialAtcForCis("63148172")).toMatchObject({ atcCode: "R06AE07", basis: "SUBSTANCE" });
  });

  it("finastéride 1 mg (chute de cheveux, jamais remboursé) ne prend pas la famille du 5 mg remboursé (prostate)", () => {
    expect(officialAtcForCis("62828991")).toMatchObject({ atcCode: "G04CB01", basis: "BOX" }); // FINASTERIDE BIOGARAN 5 mg
    expect(officialAtcForCis("66921845")).toBeNull(); // FINASTERIDE BIOGARAN 1 mg : aucun dosage commun, rien n'est deviné
  });

  it("la voie compte : l'acide fusidique en comprimé est un antibiotique systémique, en pommade un antibiotique local", () => {
    expect(officialAtcForCis("65070886")?.atcCode).toBe("J01XC01"); // FUCIDINE 250 mg, comprimé
    expect(officialAtcForCis("62345035")?.atcCode).toBe("D06AX01"); // FUCIDINE 2 %, pommade
  });

  it("un CIS inconnu, absent ou mal formé : null, jamais deviné", () => {
    expect(officialAtcForCis("00000000")).toBeNull();
    expect(officialAtcForCis(null)).toBeNull();
    expect(officialAtcForCis(undefined)).toBeNull();
    expect(officialAtcForCis("")).toBeNull();
    expect(officialAtcForCis("6166590")).toBeNull();
    expect(officialAtcForCis("R06AE07")).toBeNull();
    expect(officialAtcForCis(" 61665908 ")?.atcCode).toBe("R06AE07");
  });

  it("la classe se lit en clair, sigles gardés ; un code sans libellé connu n'en invente pas", () => {
    expect(officialTherapeuticClass("A02BC01")).toBe("Medicaments pour l'ulcere peptique et le reflux gastro-oesophagien (RGO) — inhibiteurs de la pompe a protons");
    expect(officialTherapeuticClass("Z99ZZ99")).toBeNull();
  });
});

describe("la table et sa source", () => {
  it("chaque entrée est un CIS à huit chiffres, un ATC5 valide et une base B ou S ; les chiffres annoncés sont ceux de la table", () => {
    const entries = OFFICIAL_ATC_BY_CIS.split(";");
    expect(entries.every((entry) => /^\d{8}:[A-Z]\d{2}[A-Z]{2}\d{2}:[BS]$/.test(entry))).toBe(true);
    expect(new Set(entries.map((entry) => entry.slice(0, 8))).size).toBe(entries.length);
    expect(entries.length).toBe(OFFICIAL_ATC_SOURCE.specialties);
    expect(entries.filter((entry) => entry.endsWith(":S")).length).toBe(OFFICIAL_ATC_SOURCE.fromSameSubstances);
  });

  it("nomme la source, le millésime, la date de publication et la licence (Licence Ouverte)", () => {
    expect(OFFICIAL_ATC_SOURCE.name).toBe("Open Medic (Assurance Maladie)");
    expect(OFFICIAL_ATC_SOURCE.licence).toContain("Licence Ouverte");
    expect(OFFICIAL_ATC_ATTRIBUTION).toContain("Open Medic (Assurance Maladie), base complète 2025, publiée le 7 juillet 2026");
    expect(OFFICIAL_ATC_ATTRIBUTION).toContain("Licence Ouverte");
    expect(OFFICIAL_ATC_ATTRIBUTION).toContain("Base de données publique des médicaments");
  });
});

describe("ce que couvre un code ATC tapé dans la console", () => {
  it("le code exact et son début couvrent la cétirizine ; un chiffre faux ne la couvre pas", () => {
    expect(officialCisForAtcPrefix("R06AE07")).toContain("61665908");
    expect(officialCisForAtcPrefix("r06ae")).toContain("61665908");
    expect(officialCisForAtcPrefix("R06AE57")).not.toContain("61665908");
  });

  it("le lopéramide seul (A07DA03) n'est pas couvert par A07DA53, mais l'est par A07DA", () => {
    const alone = officialCisForAtcPrefix("A07DA03");
    expect(alone.length).toBeGreaterThan(0);
    expect(officialCisForAtcPrefix("A07DA53").some((cis) => alone.includes(cis))).toBe(false);
    expect(officialCisForAtcPrefix("A07DA")).toEqual(expect.arrayContaining(alone));
  });

  it("un code mal formé ne couvre rien", () => {
    expect(officialCisForAtcPrefix("")).toEqual([]);
    expect(officialCisForAtcPrefix("A0")).toEqual([]);
    expect(officialCisForAtcPrefix("lopéramide")).toEqual([]);
  });
});
