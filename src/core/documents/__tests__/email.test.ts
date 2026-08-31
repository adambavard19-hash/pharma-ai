import { describe, expect, it } from "vitest";
import { buildDocumentEmail } from "../email";

/**
 * Le courriel qui accompagne la fiche est la seule chose que Pharma.ai envoie
 * hors de l'officine. Ces tests fixent ce qu'il a le droit de contenir.
 */

const BASE = {
  patientFirstName: "Christine",
  pharmacyName: "Pharmacie Saint-Michel",
  pharmacyPhone: "01 23 45 67 89",
  url: "https://pharma.example/fiche/abc123",
  expiresAt: new Date("2026-09-30T12:00:00Z"),
  isDemo: false,
};

describe("courriel de remise de la fiche", () => {
  it("ne transporte aucune donnée de santé", () => {
    const message = buildDocumentEmail(BASE);
    const tout = `${message.subject}\n${message.text}\n${message.html}`.toLowerCase();

    // Ni médicament, ni pathologie, ni conseil : seul le lien mène au contenu.
    for (const interdit of ["amoxicilline", "ordonnance de", "probiotique", "traitement contre"]) {
      expect(tout).not.toContain(interdit);
    }
    expect(message.text).toContain("ne contient aucune information sur votre santé");
  });

  it("garde un objet lisible sur un écran verrouillé", () => {
    const message = buildDocumentEmail(BASE);
    expect(message.subject).toBe("Pharmacie Saint-Michel — votre fiche conseil");
    // Pas de nom de famille dans l'objet ni dans le corps : le prénom suffit.
    expect(message.subject).not.toMatch(/ANDRÉ/i);
  });

  it("donne le lien, sa date d'expiration et le rappel médical", () => {
    const message = buildDocumentEmail(BASE);
    expect(message.text).toContain(BASE.url);
    expect(message.text).toContain("30 septembre 2026");
    expect(message.text).toContain("ne remplace ni votre ordonnance");
    expect(message.html).toContain(BASE.url);
  });

  it("propose le téléphone de l'officine quand il est connu, et rien d'inventé sinon", () => {
    expect(buildDocumentEmail(BASE).text).toContain("01 23 45 67 89");
    const sansTelephone = buildDocumentEmail({ ...BASE, pharmacyPhone: null });
    expect(sansTelephone.text).toContain("reste à votre disposition");
    expect(sansTelephone.text).not.toMatch(/\d{2} \d{2} \d{2}/);
  });

  it("annonce une fiche de démonstration avant toute autre chose", () => {
    const message = buildDocumentEmail({ ...BASE, isDemo: true });
    expect(message.text.startsWith("MESSAGE DE DÉMONSTRATION")).toBe(true);
    expect(message.html).toContain("MESSAGE DE DÉMONSTRATION");
  });

  it("échappe le HTML au lieu de le recopier", () => {
    const message = buildDocumentEmail({
      ...BASE,
      pharmacyName: 'Pharmacie <script>alert("x")</script> & Fils',
    });
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.html).toContain("&amp; Fils");
  });

  it("dit la même chose en texte et en HTML", () => {
    const message = buildDocumentEmail(BASE);
    const htmlSansBalises = message.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const phrase of [
      "votre pharmacien a préparé une fiche récapitulative",
      "Ce lien est personnel",
      "ne remplace ni votre ordonnance",
    ]) {
      expect(message.text).toContain(phrase);
      expect(htmlSansBalises).toContain(phrase);
    }
  });
});
