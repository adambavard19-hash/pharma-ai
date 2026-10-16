import { describe, expect, it } from "vitest";
import { buildPartnerEmail, PARTNER_CONSENT_TEXT } from "../patient-email";
import { buildPatientReport } from "../../counter/patient-report";

const ctx = { baseUrl: "https://pharmaboost.app", company: { legalName: "PharmaBoost", contactEmail: "contact@pharmaboost.app" } };

describe("les e-mails partenaires aux patients (17 oct. 2026)", () => {
  it("l'accord dit tout : partenaires, une fois par semaine au plus, jamais de médicament, désinscription", () => {
    expect(PARTNER_CONSENT_TEXT).toContain("au plus une fois par semaine");
    expect(PARTNER_CONSENT_TEXT).toContain("Jamais de médicament");
    expect(PARTNER_CONSENT_TEXT).toContain("me désinscrire");
  });
  it("l'offre : la marque, l'image, le bouton par le lien suivi, la commission dite, la désinscription", () => {
    const mail = buildPartnerEmail({ brand: "Marque Test", subject: "Votre flore", body: "Un.\n\nDeux.", imageUrl: "https://cdn.example/img.jpg", clickUrl: "https://pharmaboost.app/go/abc", unsubscribeUrl: "https://pharmaboost.app/offres-partenaires/stop/x" }, ctx);
    expect(mail.html).toContain("https://pharmaboost.app/go/abc");
    expect(mail.html).toContain("https://cdn.example/img.jpg");
    expect(mail.text).toContain("commission");
    expect(mail.text).toContain("Ne plus recevoir d'offres partenaires : https://pharmaboost.app/offres-partenaires/stop/x");
  });
  it("le bilan propose l'offre seulement quand on lui donne le lien", () => {
    const withLink = buildPatientReport({ pharmacyName: "Pharmacie du Port", products: [{ name: "Probiotique", reason: null }], partnerConsentUrl: "https://pharmaboost.app/offres-partenaires/t" })!;
    expect(withLink.html).toContain("Oui, je veux recevoir ces offres");
    expect(withLink.text).toContain("Je veux les recevoir : https://pharmaboost.app/offres-partenaires/t");
    const without = buildPatientReport({ pharmacyName: "Pharmacie du Port", products: [{ name: "Probiotique", reason: null }] })!;
    expect(without.html).not.toContain("marques partenaires");
  });
});
