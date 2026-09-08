import { describe, expect, it } from "vitest";
import { buildAdminPasswordEmail } from "../reset-email";

describe("e-mail de définition du mot de passe admin", () => {
  const message = buildAdminPasswordEmail({
    fullName: "Alex Moreau",
    url: "https://pharmaboost.app/admin-connexion/mot-de-passe/abc123",
    expiresAt: new Date("2026-09-15T10:00:00+02:00"),
  });

  it("porte le lien, l'expiration et aucun secret", () => {
    expect(message.subject).toBe("Définissez votre mot de passe — PharmaBoost");
    expect(message.text).toContain("https://pharmaboost.app/admin-connexion/mot-de-passe/abc123");
    expect(message.html).toContain('href="https://pharmaboost.app/admin-connexion/mot-de-passe/abc123"');
    expect(message.text).toMatch(/valable jusqu'au 15 septembre/);
    expect(`${message.text}${message.html}`).not.toMatch(/mot de passe\s*:/i);
  });

  it("échappe le nom", () => {
    const m = buildAdminPasswordEmail({ fullName: "<b>x</b>", url: "https://x", expiresAt: new Date() });
    expect(m.html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});
