import { describe, expect, it } from "vitest";
import { buildContractDocument } from "../template";
import {
  companyPartyOf,
  contractReference,
  contractSnapshot,
  diffCompanyProfile,
  pharmacyPartyOf,
  printedAddress,
  printedReference,
  readCompanySnapshot,
  readPharmacySnapshot,
} from "../snapshot";
import { COMPANY_PLACEHOLDERS, companyPartyForPreview, partiesPreview, SPECIMEN_MARK, specimenDocument } from "../specimen";

const profile = {
  legalName: "PharmaBoost SAS",
  legalForm: "SAS",
  addressLine1: "10 rue de la République",
  postalCode: "75011",
  city: "Paris",
  siren: "123456789",
  representativeName: "Adam Bavard",
  representativeTitle: "Président",
  representativeEmail: "contact@pharmaboost.app",
};

const dossier = {
  name: "Pharmacie du Port",
  legalName: "SELARL Pharmacie du Port",
  ownerName: "Marc Delaunay",
  ownerTitle: null,
  addressLine1: "1 quai",
  postalCode: "13002",
  city: "Marseille",
  finessNumber: "130000000",
  siret: "73282932000074",
  email: "marc@port.fr",
};

describe("référence imprimée", () => {
  it("reprend le format historique : année, nom sans accent, version", () => {
    expect(contractReference("Pharmacie de l'Étoile", 2, 2026)).toBe("PB-2026-PHARMACI-V2");
    expect(contractReference("  ", 1, 2026)).toBe("PB-2026-PHARMA-V1");
  });

  it("préfère la référence enregistrée, sinon recalcule avec l'année de génération", () => {
    expect(printedReference({ reference: "PB-2025-PORT-V1", version: 1, createdAt: new Date(2026, 5, 1) }, "Port")).toBe("PB-2025-PORT-V1");
    expect(printedReference({ reference: null, version: 3, createdAt: new Date(2025, 11, 30, 12) }, "Port")).toBe("PB-2025-PORT-V3");
  });
});

describe("copie des parties", () => {
  it("se construit à partir des mêmes valeurs que le PDF", () => {
    const company = companyPartyOf(profile);
    const pharmacy = pharmacyPartyOf(dossier);
    const doc = buildContractDocument({ company, pharmacy, terms: { monthlyPriceCents: 12900, durationMonths: 12, outletCount: 2, startDate: new Date("2026-10-01T10:00:00Z") }, reference: "PB-2026-PORT-V1" });
    const snapshot = contractSnapshot({ company, pharmacy, outletCount: 2 });
    const [companyParagraph, pharmacyParagraph] = doc.sections[0].paragraphs;

    expect(company.address).toBe("10 rue de la République, 75011 Paris");
    expect(companyParagraph).toContain(snapshot.company.legalName);
    expect(companyParagraph).toContain(snapshot.company.address);
    expect(companyParagraph).toContain(`SIREN ${snapshot.company.siren}`);
    expect(companyParagraph).toContain(`${snapshot.company.representativeName}, ${snapshot.company.representativeTitle}`);
    expect(pharmacyParagraph).toContain(`SIRET ${snapshot.pharmacy.siret}`);
    expect(pharmacyParagraph).toContain(`${snapshot.pharmacy.ownerName}, ${snapshot.pharmacy.ownerTitle}`);
    expect(pharmacyParagraph).toContain(snapshot.pharmacy.address);
    expect(doc.signatures.find((s) => s.role === "COMPANY")?.email).toBe(snapshot.company.representativeEmail);
  });

  it("enregistre les valeurs telles qu'imprimées : qualité par défaut, SIRET groupé, vides retirés", () => {
    const snapshot = contractSnapshot({ company: companyPartyOf({ ...profile, legalForm: " ", siren: null }), pharmacy: pharmacyPartyOf({ ...dossier, finessNumber: "" }), outletCount: 0 });
    expect(snapshot.company.legalForm).toBeNull();
    expect(snapshot.company.siren).toBeNull();
    expect(snapshot.pharmacy.ownerTitle).toBe("pharmacien titulaire");
    expect(snapshot.pharmacy.siret).toBe("732 829 320 00074");
    expect(snapshot.pharmacy.finessNumber).toBeNull();
    expect(snapshot.pharmacy.outletCount).toBe(1);
  });

  it("se relit depuis la base ; une copie absente ou illisible donne null", () => {
    const snapshot = contractSnapshot({ company: companyPartyOf(profile), pharmacy: pharmacyPartyOf(dossier), outletCount: 1 });
    const stored = JSON.parse(JSON.stringify(snapshot));
    expect(readCompanySnapshot(stored.company)).toEqual(snapshot.company);
    expect(readPharmacySnapshot(stored.pharmacy)).toEqual(snapshot.pharmacy);
    expect(readCompanySnapshot(null)).toBeNull();
    expect(readCompanySnapshot({ legalName: "X" })).toBeNull();
    expect(readPharmacySnapshot([1, 2])).toBeNull();
  });

  it("imprime l'adresse sans virgule orpheline", () => {
    expect(printedAddress("1 quai", null, "Marseille")).toBe("1 quai, Marseille");
    expect(printedAddress(null, null, null)).toBe("");
  });
});

describe("modifications de la fiche société", () => {
  it("liste chaque champ modifié, avant → après", () => {
    const changes = diffCompanyProfile(profile, { ...profile, siren: "987654321", representativeTitle: "" });
    expect(changes).toEqual({ siren: { from: "123456789", to: "987654321" }, representativeTitle: { from: "Président", to: null } });
  });

  it("une création part de rien ; un champ non transmis n'est pas comparé", () => {
    expect(diffCompanyProfile(null, { legalName: "PharmaBoost SAS" })).toEqual({ legalName: { from: null, to: "PharmaBoost SAS" } });
    expect(diffCompanyProfile(profile, { legalName: "PharmaBoost SAS", city: undefined })).toEqual({});
    expect(diffCompanyProfile({ ...profile, legalForm: null }, { legalForm: "" })).toEqual({});
  });
});

describe("aperçus de la fiche société", () => {
  it("montre les champs exigés manquants entre crochets, sans rien inventer", () => {
    const party = companyPartyForPreview({ legalName: "PharmaBoost SAS" });
    expect(party.legalName).toBe("PharmaBoost SAS");
    expect(party.address).toBe(COMPANY_PLACEHOLDERS.address);
    expect(party.representativeName).toBe(COMPANY_PLACEHOLDERS.representativeName);
    expect(party.siren).toBeNull();
    const preview = partiesPreview(party);
    expect(preview.heading).toBe("Entre les soussignés");
    expect(preview.companyParagraph).toContain("[adresse du siège]");
    expect(preview.companyParagraph).not.toContain("SIREN");
    expect(preview.pharmacyParagraph).toContain("[Nom de l'officine]");
    expect(preview.signatures.map((s) => s.label)).toEqual(["Pour l'Officine", "Pour la Société"]);
  });

  it("le spécimen marque l'officine fictive et n'invente pas de tarif sans offre", () => {
    const doc = specimenDocument({ company: companyPartyOf(profile), plan: null, startDate: new Date("2026-10-03T08:00:00Z") });
    expect(doc.sections[0].heading).toBe(SPECIMEN_MARK);
    expect(doc.title).toContain("SPÉCIMEN");
    expect(doc.signatures.find((s) => s.role === "PHARMACY")?.name).toContain("spécimen");
    const article3 = doc.sections.find((s) => s.heading.startsWith("Article 3"));
    expect(article3?.paragraphs[0]).toContain("[tarif mensuel de l'offre retenue]");
    const priced = specimenDocument({ company: companyPartyOf(profile), plan: { name: "PharmaBoost", monthlyPriceCents: 12900, trialDays: 30 }, startDate: new Date("2026-10-03T08:00:00Z") });
    expect(priced.sections.find((s) => s.heading.startsWith("Article 3"))?.paragraphs[0]).toContain("129,00 € HT");
  });
});
