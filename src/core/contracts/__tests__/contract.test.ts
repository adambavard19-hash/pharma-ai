import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildContractDocument } from "../template";
import { renderContractPdf } from "../pdf";

const input = {
  reference: "PB-2026-0001",
  company: { legalName: "PharmaBoost SAS", legalForm: "SAS", address: "10 rue Exemple, 75001 Paris", siren: "123456789", representativeName: "Adam Bavard", representativeTitle: "Président", representativeEmail: "contact@pharmaboost.app" },
  pharmacy: { name: "Pharmacie du Centre", ownerName: "Claire Dumont", address: "3 place du Marché, 69003 Lyon", finessNumber: "690012345", siret: "12345678900011", email: "claire@centre.fr" },
  terms: { monthlyPriceCents: 24_900, durationMonths: 12, outletCount: 1, startDate: new Date("2026-10-01T00:00:00Z") },
};

describe("contrat d'abonnement", () => {
  it("injecte les parties et les conditions, et fait signer les deux parties", () => {
    const doc = buildContractDocument(input);
    const all = doc.sections.flatMap((s) => s.paragraphs).join(" ");
    expect(all).toContain("PharmaBoost SAS");
    expect(all).toContain("Pharmacie du Centre");
    expect(all).toContain("Claire Dumont, pharmacien titulaire");
    expect(all).toContain("249,00 € HT par mois");
    expect(all).toContain("2988,00 € HT par an");
    expect(all).toContain("12 mois");
    expect(doc.signatures.map((s) => s.role)).toEqual(["PHARMACY", "COMPANY"]);
    expect(doc.signatures[1].name).toBe("Adam Bavard");
    // Le commercial n'apparaît pas comme signataire.
    expect(doc.signatures.some((s) => /commercial/i.test(s.label))).toBe(false);
  });

  it("produit un PDF A4 lisible sans navigateur", async () => {
    const bytes = await renderContractPdf(buildContractDocument(input));
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(pdf.getPageCount()).toBeLessThanOrEqual(3);
    const { width, height } = pdf.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
    expect(pdf.getTitle()).toBe("Contrat d'abonnement au service PharmaBoost");
  });
});

describe("géométrie des signatures", () => {
  it("place les champs de signature dans les cases, sur la dernière page, en coordonnées depuis le haut", async () => {
    const { signatureBoxes, signatureFieldPlacement, CONTRACT_PAGE } = await import("../layout");
    const boxes = signatureBoxes(2);
    expect(boxes).toHaveLength(2);
    expect(boxes[1].x).toBeGreaterThan(boxes[0].x + boxes[0].width);
    const field = signatureFieldPlacement(0, 2, 3);
    expect(field.page).toBe(3);
    expect(field.width).toBeGreaterThanOrEqual(24);
    expect(field.height).toBeGreaterThanOrEqual(24);
    expect(field.y + field.height).toBeLessThanOrEqual(CONTRACT_PAGE.height);
    // La zone est bien à l'intérieur de la case : sous le texte, au-dessus du bas.
    const box = boxes[0];
    expect(CONTRACT_PAGE.height - field.y).toBeLessThan(box.top);
    expect(CONTRACT_PAGE.height - (field.y + field.height)).toBeGreaterThan(box.bottom);
    expect(() => signatureFieldPlacement(2, 2, 1)).toThrow(/hors du bloc/);
  });
});
