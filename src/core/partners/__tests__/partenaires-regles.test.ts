import { describe, expect, it } from "vitest";
import { brandVisibility, itemVisible, type VisibilityInput } from "../visibility";
import { canMoveApplication, canMovePublication, nextApplicationStatuses, slugify } from "../status";
import { ATTRIBUTION_CODE_PATTERN, attributionCodeFrom, b2bLinkFor } from "../attribution";
import { estimateCommission } from "../commission";
import { MODE_CAPABILITIES, modeAllowsOrder } from "../connector";

/** Diffusion, workflow, attribution, commission et connecteurs : les règles du lot Partenaires, sans base. */

const visible = (overrides: Partial<VisibilityInput> = {}) =>
  brandVisibility({ partnerStatus: "ACTIVE", brandStatus: "ACTIVE", audience: "ALL_PHARMACIES", selected: false, pilot: false, preference: null, ...overrides });

describe("diffusion d'une marque à une officine", () => {
  it("activée pour toutes les officines : visible au catalogue et au comptoir", () => {
    expect(visible()).toEqual({ catalog: true, counter: true, reason: "VISIBLE" });
  });

  it("brouillon, suspendue ou archivée : invisible", () => {
    for (const status of ["DRAFT", "SUSPENDED", "ARCHIVED"] as const) {
      expect(visible({ brandStatus: status }).catalog, status).toBe(false);
    }
  });

  it("désactiver le partenaire retire toutes ses marques, même actives", () => {
    expect(visible({ partnerStatus: "SUSPENDED" })).toMatchObject({ catalog: false, reason: "PARTNER_NOT_PUBLISHED" });
    expect(visible({ partnerStatus: "ARCHIVED" }).counter).toBe(false);
  });

  it("en TEST (marque ou partenaire) : groupe pilote seulement", () => {
    expect(visible({ brandStatus: "TEST" }).catalog).toBe(false);
    expect(visible({ brandStatus: "TEST", pilot: true }).catalog).toBe(true);
    expect(visible({ partnerStatus: "TEST" }).reason).toBe("TEST_PILOT_ONLY");
  });

  it("officines sélectionnées / groupe pilote : seulement elles", () => {
    expect(visible({ audience: "SELECTED_PHARMACIES" }).catalog).toBe(false);
    expect(visible({ audience: "SELECTED_PHARMACIES", selected: true }).catalog).toBe(true);
    expect(visible({ audience: "PILOT_GROUP" }).catalog).toBe(false);
    expect(visible({ audience: "PILOT_GROUP", pilot: true }).catalog).toBe(true);
  });

  it("masquée par l'officine : consultable au catalogue, absente du comptoir ; refusée : absente partout", () => {
    expect(visible({ preference: "HIDDEN" })).toEqual({ catalog: true, counter: false, reason: "VISIBLE" });
    expect(visible({ preference: "REFUSED" })).toMatchObject({ catalog: false, counter: false, reason: "REFUSED_BY_PHARMACY" });
  });

  it("une gamme ou une offre suit le même cycle", () => {
    expect(itemVisible("ACTIVE", false)).toBe(true);
    expect(itemVisible("TEST", false)).toBe(false);
    expect(itemVisible("TEST", true)).toBe(true);
    expect(itemVisible("DRAFT", true)).toBe(false);
  });
});

describe("workflow d'une candidature et cycle de publication", () => {
  it("aucune activation automatique : une candidature neuve ne devient pas partenaire actif", () => {
    expect(canMoveApplication("NEW", "ACTIVE_PARTNER", true)).toBe(false);
    expect(nextApplicationStatuses("NEW")).not.toContain("ACCEPTED");
  });

  it("« partenaire actif » exige une acceptation ET une fiche partenaire", () => {
    expect(canMoveApplication("ACCEPTED", "ACTIVE_PARTNER", false)).toBe(false);
    expect(canMoveApplication("ACCEPTED", "ACTIVE_PARTNER", true)).toBe(true);
  });

  it("un refus peut être rouvert, pas accepté directement", () => {
    expect(canMoveApplication("REFUSED", "REVIEWING", false)).toBe(true);
    expect(canMoveApplication("REFUSED", "ACCEPTED", false)).toBe(false);
  });

  it("une archive repasse par le brouillon avant toute diffusion", () => {
    expect(canMovePublication("ARCHIVED", "ACTIVE")).toBe(false);
    expect(canMovePublication("ARCHIVED", "DRAFT")).toBe(true);
    expect(canMovePublication("DRAFT", "ACTIVE")).toBe(true);
    expect(canMovePublication("ACTIVE", "SUSPENDED")).toBe(true);
  });

  it("slug lisible", () => {
    expect(slugify("Laboratoire Éxemple & Cie")).toBe("laboratoire-exemple-cie");
  });
});

describe("identifiant d'attribution", () => {
  it("format PB-XXXX-XXXX, sans caractère ambigu, déterministe à aléa égal", () => {
    const code = attributionCodeFrom(new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253]));
    expect(code).toMatch(ATTRIBUTION_CODE_PATTERN);
    expect(code).not.toMatch(/[01IOL]/);
    expect(attributionCodeFrom(new Uint8Array([0, 1, 2, 3, 250, 251, 252, 253]))).toBe(code);
    expect(attributionCodeFrom(new Uint8Array([9, 1, 2, 3, 250, 251, 252, 253]))).not.toBe(code);
  });

  it("lien B2B : {code} remplacé, sinon paramètre pb ; https obligatoire", () => {
    expect(b2bLinkFor("https://pro.exemple.fr/commande?ref={code}", "PB-AAAA-BBBB")).toBe("https://pro.exemple.fr/commande?ref=PB-AAAA-BBBB");
    expect(b2bLinkFor("https://pro.exemple.fr/commande", "PB-AAAA-BBBB")).toBe("https://pro.exemple.fr/commande?pb=PB-AAAA-BBBB");
    expect(b2bLinkFor("http://pro.exemple.fr/{code}", "PB-AAAA-BBBB")).toBeNull();
    expect(b2bLinkFor("javascript:alert(1)", "PB-AAAA-BBBB")).toBeNull();
  });
});

describe("commission indicative (jamais facturée)", () => {
  const terms = { fixedAmountCents: null, commissionPercent: null, commissionPerUnitCents: null, minimumCents: null };
  it("forfait, pourcentage, par unité, minimum, hybride", () => {
    expect(estimateCommission({ ...terms, type: "FLAT_FEE", fixedAmountCents: 30000 }, { amountCents: 99999, units: 9 }).totalCents).toBe(30000);
    expect(estimateCommission({ ...terms, type: "COMMISSION", commissionPercent: 10 }, { amountCents: 50000, units: 0 }).totalCents).toBe(5000);
    expect(estimateCommission({ ...terms, type: "COMMISSION", commissionPerUnitCents: 25 }, { amountCents: 0, units: 40 }).totalCents).toBe(1000);
    expect(estimateCommission({ ...terms, type: "COMMISSION", commissionPercent: 1, minimumCents: 2000 }, { amountCents: 10000, units: 0 }).totalCents).toBe(2000);
    expect(estimateCommission({ ...terms, type: "HYBRID", fixedAmountCents: 1000, commissionPercent: 10 }, { amountCents: 10000, units: 0 })).toMatchObject({ fixedCents: 1000, variableCents: 1000, totalCents: 2000 });
  });

  it("pilote et gratuit : zéro ; un volume négatif ne crée rien", () => {
    expect(estimateCommission({ ...terms, type: "PILOT", fixedAmountCents: 5000 }, { amountCents: 10000, units: 3 }).totalCents).toBe(0);
    expect(estimateCommission({ ...terms, type: "FREE" }, { amountCents: 10000, units: 3 }).totalCents).toBe(0);
    expect(estimateCommission({ ...terms, type: "COMMISSION", commissionPercent: 10 }, { amountCents: -5000, units: -2 }).totalCents).toBe(0);
  });
});

describe("connecteurs : aucune capacité simulée", () => {
  it("le mode API ne déclare rien tant que l'API du partenaire n'est pas branchée", () => {
    expect(MODE_CAPABILITIES.API.capabilities).toEqual([]);
    expect(modeAllowsOrder("API")).toBe(false);
  });

  it("lien B2B et formulaire attribuent sans commander ; e-mail, import/export et manuel commandent", () => {
    expect(modeAllowsOrder("B2B_LINK")).toBe(false);
    expect(modeAllowsOrder("FORM")).toBe(false);
    expect(modeAllowsOrder("EMAIL")).toBe(true);
    expect(modeAllowsOrder("IMPORT_EXPORT")).toBe(true);
    expect(modeAllowsOrder("MANUAL")).toBe(true);
  });
});
