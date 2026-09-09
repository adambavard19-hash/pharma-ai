import { describe, expect, it } from "vitest";
import { buildUserPasswordEmail } from "../welcome-email";

const base = {
  firstName: "Adam",
  pharmacyName: "Pharmacie 01",
  url: "https://pharmaboost.app/mot-de-passe/abc",
  loginUrl: "https://pharmaboost.app/login",
  expiresAt: new Date("2026-09-15T10:00:00+02:00"),
};

describe("e-mail d'accueil du titulaire", () => {
  it("souhaite la bienvenue, donne le lien et jamais le mot de passe", () => {
    const m = buildUserPasswordEmail({ ...base, kind: "welcome" });
    expect(m.subject).toBe("Bienvenue sur PharmaBoost — Pharmacie 01");
    expect(m.text).toContain("Bonjour Adam,");
    expect(m.text).toContain(base.url);
    expect(m.text).toContain(base.loginUrl);
    expect(m.html).toContain(`href="${base.url}"`);
    // Le message invite à définir un mot de passe ; il n'en transporte aucun.
    expect(m.text).not.toMatch(/mot de passe initial|MarcheLyon|[A-Za-z0-9!]{12,}\s*$/m);
  });

  it("propose la réinitialisation sans révéler l'existence du compte au-delà du destinataire", () => {
    const m = buildUserPasswordEmail({ ...base, kind: "reset", pharmacyName: null });
    expect(m.subject).toBe("Réinitialisez votre mot de passe — PharmaBoost");
    expect(m.text).toContain("ignorez ce message");
  });
});
