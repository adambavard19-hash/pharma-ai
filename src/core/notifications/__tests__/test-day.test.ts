import { describe, expect, it } from "vitest";
import { buildTestDayEmail } from "../test-day";

const ctx = { baseUrl: "https://pharmaboost.app", logoUrl: "https://pharmaboost.app/logo.png", company: { legalName: "PharmaBoost", address: null, siren: null, contactEmail: "contact@pharmaboost.app" } };

describe("l'e-mail de la journée test", () => {
  it("dit le jour, la pharmacie, ce qu'il faut essayer et où signaler un souci", () => {
    const mail = buildTestDayEmail({ firstName: "Evelyne", pharmacyName: "PHARMACIE DU DOCTEUR NICOLAS", dayLabel: "vendredi 23 octobre" }, ctx as never);
    expect(mail.subject).toBe("Aujourd'hui, on teste PharmaBoost au comptoir");
    expect(mail.text).toContain("Vendredi 23 octobre : on teste PharmaBoost");
    expect(mail.text).toContain("Bonjour Evelyne,");
    expect(mail.text).toContain("toute l'équipe de PHARMACIE DU DOCTEUR NICOLAS commence à tester");
    expect(mail.text).toContain("« Demander un conseil »");
    expect(mail.text).toContain("« Contact support »");
    expect(mail.text).not.toMatch(/gratuit|essai gratuit/i);
  });
});
