import { describe, expect, it } from "vitest";
import { buildPartnerApplicationAcknowledgement, buildPartnerApplicationAlert, type PartnerApplicationSummary } from "../partner-emails";

const ctx = { baseUrl: "https://pharmaboost.app", logoUrl: "https://pharmaboost.app/logo-256.png", company: { legalName: "PharmaBoost SAS", address: null, siren: null, contactEmail: "contact@pharmaboost.app" } };

// Une candidature de test : coordonnées d'une société, rien d'autre.
const application: PartnerApplicationSummary = {
  company: "Laboratoire Test",
  brand: "Marque <Test>",
  contactFirstName: "Claire",
  contactLastName: "Martin",
  contactRole: "Responsable grands comptes",
  email: "claire@exemple.test",
  phone: null,
  website: "https://exemple.test",
  universes: ["DERMOCOSMETIQUE", "BEBE"],
  approxReferences: 120,
  distribution: "Grossistes répartiteurs",
  hasApi: "UNKNOWN",
  hasB2bPortal: true,
  hasCatalog: false,
  hasTrainings: null,
  message: "Nous souhaitons présenter notre gamme solaire.",
};

// Pictogrammes et emojis : aucun dans un e-mail professionnel.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

describe("accusé de réception d'une candidature partenaire", () => {
  const m = buildPartnerApplicationAcknowledgement(ctx, application);

  it("salue le contact, nomme la marque et rappelle que rien n'est automatique", () => {
    expect(m.subject).toBe("Votre candidature PharmaBoost Partenaires est bien reçue");
    expect(m.text).toContain("Bonjour Claire,");
    expect(m.text).toContain("Marque <Test>");
    expect(m.text).toContain("Aucune activation n'est automatique");
    expect(m.text).toContain("- Univers : Dermocosmétique, Bébé");
    expect(m.text).toContain("uniquement à étudier votre candidature et à vous recontacter");
  });

  it("échappe ce que le candidat a saisi et reste sans emoji", () => {
    expect(m.html).toContain("Marque &lt;Test&gt;");
    expect(m.html).not.toContain("Marque <Test>");
    expect(m.html).toContain("/decouvrir/confidentialite");
    expect(EMOJI.test(m.html)).toBe(false);
    expect(EMOJI.test(m.text)).toBe(false);
  });

  it("ne promet ni recommandation ni accès aux données patient", () => {
    expect(m.text).toContain("un partenariat ne donne jamais accès à une recommandation");
    expect(m.text).toContain("aucune donnée patient n'est transmise aux partenaires");
    expect(m.text).not.toMatch(/recommandé par PharmaBoost/i);
  });
});

describe("alerte à l'équipe pour une candidature partenaire", () => {
  const adminUrl = "https://pharmaboost.app/admin/partenaires/candidatures/cand_1";
  const m = buildPartnerApplicationAlert(ctx, { ...application, adminUrl });

  it("reprend toute la candidature et mène à la console", () => {
    expect(m.subject).toBe("Candidature partenaire — Marque <Test> (Laboratoire Test)");
    expect(m.text).toContain("- Contact : Claire Martin");
    expect(m.text).toContain("- Fonction : Responsable grands comptes");
    expect(m.text).toContain("- Références (environ) : 120");
    expect(m.text).toContain("- API disponible : Ne sait pas");
    expect(m.text).toContain("- Portail B2B : Oui");
    expect(m.text).toContain("- Catalogue disponible : Non");
    expect(m.text).toContain("- Formations disponibles : Non précisé");
    expect(m.text).toContain("Message : Nous souhaitons présenter notre gamme solaire.");
    expect(m.text).toContain(`Ouvrir la candidature : ${adminUrl}`);
    expect(m.html).toContain(`href="${adminUrl}"`);
    expect(m.text).toContain("Rien n'a été activé");
  });

  it("omet les champs laissés vides", () => {
    expect(m.text).not.toContain("Téléphone");
    const bare = buildPartnerApplicationAlert(ctx, { ...application, universes: [], website: null, message: null, adminUrl });
    expect(bare.text).not.toContain("Univers");
    expect(bare.text).not.toContain("Site internet");
    expect(bare.text).not.toContain("Message :");
  });
});
