import { describe, expect, it } from "vitest";
import { buildOfferAlertEmail } from "../offer-alert-email";

const base = { from: "Pharmacie Saint-Michel", funding: "PHARMACY" as const, title: "Nouvelle gamme solaire", rangeLabel: "Avène Solaire", discountPercent: 20, endsAt: new Date("2026-11-30T22:00:00Z"), locked: false, offerUrl: "https://pharmaboost.app/app/offres/o1", unsubscribeUrl: "https://pharmaboost.app/app/alertes/desinscription/t" };

describe("e-mail « nouvelle offre »", () => {
  it("dit l'offre, la pharmacie, la date et porte le lien de désinscription", () => {
    const mail = buildOfferAlertEmail(base);
    expect(mail.subject).toBe("Pharmacie Saint-Michel : nouvelle offre -20 % · Avène Solaire");
    expect(mail.text).toContain("chez Pharmacie Saint-Michel");
    expect(mail.text).toContain("jusqu'au 30 novembre");
    expect(mail.html).toContain(base.unsubscribeUrl);
    expect(mail.text).not.toContain("abonnés");
  });
  it("prévient l'inscrit non abonné, et l'offre de laboratoire vaut partout", () => {
    const mail = buildOfferAlertEmail({ ...base, funding: "LAB", from: "NHCO", locked: true });
    expect(mail.subject).toBe("Nouvelle offre NHCO : -20 % · Avène Solaire");
    expect(mail.text).toContain("dans toutes les pharmacies PharmaBoost");
    expect(mail.text).toContain("réservée aux abonnés PharmaBoost+");
  });
  it("échappe le HTML", () => {
    expect(buildOfferAlertEmail({ ...base, title: "<b>x</b>" }).html).not.toContain("<b>x</b>");
  });
});
