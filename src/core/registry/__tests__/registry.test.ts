import { describe, expect, it } from "vitest";
import { displayCase, parseCompanySearch, splitSireneAddress } from "../sirene";
import { parseAddressSuggestions, pickOfficialAddress } from "../address";
import { suggestEmailCorrection } from "@/core/site/email-typos";
import { applyCompany, formatSiretInput, revertCompany } from "../prefill";
// Réponses réelles des deux API publiques, enregistrées le 3 octobre 2026 et réduites aux champs lus.
import ainay from "./fixtures/entreprise-ainay.json";
import passerelle from "./fixtures/entreprise-passerelle.json";
import ampere from "./fixtures/adresse-ampere.json";
import autocompletion from "./fixtures/adresse-autocompletion.json";

describe("annuaire des entreprises", () => {
  it("lit l'établissement demandé : raison sociale, enseigne, adresse, FINESS unique, activité", () => {
    expect(parseCompanySearch(passerelle, "797 832 227 00012")).toEqual({
      siret: "79783222700012",
      legalName: "Pharmacie de la Passerelle",
      tradeName: "Pharmacie de la Passerelle",
      addressLine1: "34 Rue du Plat",
      postalCode: "69002",
      city: "Lyon",
      finessNumber: "690018502",
      active: true,
      isPharmacy: true,
      activityCode: "47.73Z",
    });
  });

  it("garde le nom commercial quand l'établissement n'a pas d'enseigne", () => {
    const found = parseCompanySearch(ainay, "93881372200023");
    expect(found?.legalName).toBe("Pharmacie d'Ainay");
    expect(found?.tradeName).toBe("Pharmacie Ampere Ainay");
    expect(found?.addressLine1).toBe("8 Place Ampere");
    expect(found?.finessNumber).toBeNull();
  });

  it("ne renvoie rien pour un SIRET absent de la réponse (pas d'établissement voisin à la place)", () => {
    expect(parseCompanySearch(ainay, "93881372200099")).toBeNull();
    expect(parseCompanySearch({ results: [] }, "93881372200023")).toBeNull();
    expect(parseCompanySearch(null, "93881372200023")).toBeNull();
  });

  it("signale un établissement fermé et une activité qui n'est pas une pharmacie", () => {
    const closed = structuredClone(ainay);
    closed.results[0].matching_etablissements[0].etat_administratif = "F";
    closed.results[0].matching_etablissements[0].activite_principale = "86.21Z";
    const found = parseCompanySearch(closed, "93881372200023");
    expect(found?.active).toBe(false);
    expect(found?.isPharmacy).toBe(false);
  });

  it("n'expose aucune adresse d'un établissement non diffusible", () => {
    const hidden = structuredClone(passerelle);
    hidden.results[0].matching_etablissements[0].statut_diffusion_etablissement = "P";
    const found = parseCompanySearch(hidden, "79783222700012");
    expect(found?.addressLine1).toBeNull();
    expect(found?.postalCode).toBeNull();
    expect(found?.city).toBeNull();
  });

  it("met en casse lisible sans toucher aux formes juridiques ni au texte déjà saisi en casse mixte", () => {
    expect(displayCase("SELARL PHARMACIE DU CENTRE")).toBe("SELARL Pharmacie du Centre");
    expect(displayCase("PHARMACIE D'AINAY")).toBe("Pharmacie d'Ainay");
    expect(displayCase("L'OFFICINE SAINT-JEAN")).toBe("L'Officine Saint-Jean");
    expect(displayCase("Pharmacie du Port")).toBe("Pharmacie du Port");
    expect(displayCase("  ")).toBeNull();
  });

  it("découpe une adresse SIRENE en rue, code postal et commune", () => {
    expect(splitSireneAddress("8 PLACE AMPERE 69002 LYON")).toEqual({ street: "8 PLACE AMPERE", postalCode: "69002", city: "LYON" });
    expect(splitSireneAddress("2 RUE DU PORT 13002 MARSEILLE CEDEX 02")).toEqual({ street: "2 RUE DU PORT", postalCode: "13002", city: "MARSEILLE" });
    expect(splitSireneAddress("[NON-DIFFUSIBLE]")).toEqual({ street: null, postalCode: null, city: null });
  });
});

describe("Base Adresse Nationale", () => {
  it("retrouve la forme officielle d'une adresse lue dans SIRENE, dans le même code postal", () => {
    expect(pickOfficialAddress(ampere, "69002")).toEqual({ label: "8 Place Ampère 69002 Lyon", addressLine1: "8 Place Ampère", postalCode: "69002", city: "Lyon" });
    expect(pickOfficialAddress(ampere, "75001")).toBeNull();
  });

  it("propose des suggestions complètes et sans doublon pendant la saisie", () => {
    const suggestions = parseAddressSuggestions(autocompletion);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(s.postalCode).toMatch(/^\d{5}$/);
      expect(s.addressLine1).not.toBe("");
      expect(s.city).not.toBe("");
    }
    expect(new Set(suggestions.map((s) => s.label)).size).toBe(suggestions.length);
    expect(parseAddressSuggestions({ features: [{ properties: { name: "Rue sans code" } }] })).toEqual([]);
  });
});

describe("faute de frappe dans un e-mail", () => {
  it("propose le domaine courant le plus proche, sans jamais toucher à un domaine connu ou lointain", () => {
    expect(suggestEmailCorrection("titulaire@gmial.com")).toBe("titulaire@gmail.com");
    expect(suggestEmailCorrection("Officine@Orange.fe")).toBe("officine@orange.fr");
    expect(suggestEmailCorrection("contact@wanado.fr")).toBe("contact@wanadoo.fr");
    expect(suggestEmailCorrection("contact@gmail.com")).toBeNull();
    expect(suggestEmailCorrection("contact@pharmacie-passerelle.fr")).toBeNull();
    expect(suggestEmailCorrection("pas-une-adresse")).toBeNull();
  });
});

describe("préremplissage depuis l'annuaire", () => {
  const company = parseCompanySearch(passerelle, "79783222700012")!;
  const fields = { name: "pharmacyName", legalName: "legalName", addressLine1: "addressLine1", postalCode: "postalCode", city: "city", finessNumber: "finessNumber" } as const;
  const empty = { pharmacyName: "", legalName: "", addressLine1: "", postalCode: "", city: "", finessNumber: "" };

  it("remplit les champs vides et note ce qui vient de l'annuaire", () => {
    const { patch, prefill } = applyCompany(empty, company, fields, {});
    expect(patch).toEqual({ pharmacyName: "Pharmacie de la Passerelle", legalName: "Pharmacie de la Passerelle", addressLine1: "34 Rue du Plat", postalCode: "69002", city: "Lyon", finessNumber: "690018502" });
    expect(prefill._siret).toBe("79783222700012");
    expect(prefill.city).toBe("Lyon");
  });

  it("n'écrase jamais une valeur saisie par la personne", () => {
    const typed = { ...empty, pharmacyName: "Grande Pharmacie du Plat" };
    const { patch } = applyCompany(typed, company, fields, {});
    expect(patch.pharmacyName).toBeUndefined();
    expect(patch.legalName).toBe("Pharmacie de la Passerelle");
  });

  it("remplace ce qu'un précédent SIRET avait rempli, tant que la personne n'y a pas touché", () => {
    const first = applyCompany(empty, parseCompanySearch(ainay, "93881372200023")!, fields, {});
    const afterFirst = { ...empty, ...first.patch, city: "Lyon 2e" };
    const second = applyCompany(afterFirst, company, fields, first.prefill);
    expect(second.patch.pharmacyName).toBe("Pharmacie de la Passerelle");
    expect(second.patch.addressLine1).toBe("34 Rue du Plat");
    expect(second.patch.city).toBeUndefined();
  });

  it("« Ce n'est pas mon officine » retire ce qui venait de l'annuaire, et seulement cela", () => {
    const applied = applyCompany(empty, company, fields, {});
    const edited = { ...empty, ...applied.patch, legalName: "SELARL Pharmacie de la Passerelle" };
    const { patch, prefill } = revertCompany(edited, applied.prefill, "79783222700012");
    expect(patch.pharmacyName).toBe("");
    expect(patch.legalName).toBeUndefined();
    expect(prefill).toEqual({ _rejected: "79783222700012" });
  });

  it("met en forme un SIRET au fil de la frappe", () => {
    expect(formatSiretInput("7978322270")).toBe("797 832 227 0");
    expect(formatSiretInput("797 832 227 00012 99")).toBe("797 832 227 00012");
  });
});
