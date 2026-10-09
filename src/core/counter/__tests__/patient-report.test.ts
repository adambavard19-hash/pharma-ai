import { describe, expect, it } from "vitest";
import { buildPatientReport, maskEmail, parsePatientEmail, reportProducts } from "../patient-report";

describe("le bilan envoyé au patient", () => {
  it("ne dit que les produits retenus, avec leur phrase patient quand il y en a une", () => {
    const mail = buildPatientReport({ pharmacyName: "Pharmacie du Port", products: [{ name: "ELUDAY GENCIVE 500 ml", reason: "Apaise la bouche sèche." }, { name: "SÉRUM PHYSIOLOGIQUE", reason: null }] });
    expect(mail?.subject).toBe("Votre bilan Pharmacie du Port");
    expect(mail?.text).toContain("• ELUDAY GENCIVE 500 ml");
    expect(mail?.text).toContain("Apaise la bouche sèche.");
    expect(mail?.text).toContain("• SÉRUM PHYSIOLOGIQUE");
    expect(mail?.html).toContain("Votre bilan du jour");
  });

  it("n'envoie rien quand aucun produit n'est retenu", () => {
    expect(buildPatientReport({ pharmacyName: "Pharmacie du Port", products: [] })).toBeNull();
    expect(buildPatientReport({ pharmacyName: "Pharmacie du Port", products: [{ name: "   ", reason: "x" }] })).toBeNull();
  });

  it("ne cite ni médicament, ni posologie, ni nom : seulement ce que la pharmacie a retenu", () => {
    const mail = buildPatientReport({ pharmacyName: "Pharmacie du Port", products: [{ name: "ELUDAY", reason: null }] });
    expect(mail?.text).not.toMatch(/posologie|mg|comprimé|ordonnance/i);
    expect(mail?.text).toContain("ne remplace ni l'avis de votre pharmacien");
    expect(mail?.text).toContain("vous avez donné votre accord");
  });

  it("protège le HTML et écarte les doublons", () => {
    const mail = buildPatientReport({ pharmacyName: "Pharmacie <b>X</b>", products: [{ name: "A & B", reason: "<script>x</script>" }, { name: "a & b", reason: null }] });
    expect(mail?.html).not.toContain("<script>");
    expect(mail?.html).toContain("A &amp; B");
    expect(reportProducts([{ name: "A", reason: null }, { name: "a", reason: null }])).toHaveLength(1);
  });

  it("garde huit produits au plus", () => {
    const many = Array.from({ length: 12 }, (_, index) => ({ name: `Produit ${index}`, reason: null }));
    expect(reportProducts(many)).toHaveLength(8);
  });
});

describe("l'adresse du patient", () => {
  it("accepte une adresse bien formée, en minuscules", () => {
    expect(parsePatientEmail("  Jean.Dupont@Gmail.com ")).toEqual({ ok: true, email: "jean.dupont@gmail.com" });
  });
  it("refuse ce qui n'est pas une adresse", () => {
    for (const bad of ["", "   ", "jean", "jean@", "@gmail.com", "jean@gmail", "jean..d@gmail.com", "jean dupont@gmail.com", null, undefined]) {
      expect(parsePatientEmail(bad as string).ok).toBe(false);
    }
  });
  it("ne montre jamais l'adresse entière dans un journal", () => {
    expect(maskEmail("jean.dupont@gmail.com")).toBe("j***@gmail.com");
    expect(maskEmail("n'importe quoi")).toBe("***");
  });
});
