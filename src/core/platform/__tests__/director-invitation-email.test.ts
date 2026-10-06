import { describe, expect, it } from "vitest";
import { buildDirectorInvitationEmail } from "../sales-emails";

const URL = "https://pharmaboost.app/directeur/mot-de-passe/abc123def456ghi789";
const EXPIRES = new Date("2026-10-13T10:00:00+02:00");

describe("e-mail d'invitation du directeur commercial", () => {
  const message = buildDirectorInvitationEmail({ firstName: "Camille", url: URL, expiresAt: EXPIRES });

  it("dit que l'espace est prêt et porte le lien personnel, en texte et en HTML", () => {
    expect(message.subject).toBe("Votre espace de direction commerciale — PharmaBoost");
    expect(message.text).toContain("Bonjour Camille,");
    expect(message.text).toContain("Votre espace de direction commerciale PharmaBoost est prêt. Définissez votre mot de passe");
    expect(message.text).toContain(URL);
    expect(message.html).toContain(`href="${URL}"`);
    expect(message.html).toContain("Définir mon mot de passe");
  });

  it("annonce un lien personnel, à usage unique, avec sa date de fin", () => {
    expect(message.text).toMatch(/personnel, à usage unique, et reste valable jusqu'au 13 octobre/);
    expect(message.html).toMatch(/à usage unique/);
  });

  it("ne contient ni mot de passe, ni montant, ni commission", () => {
    const all = `${message.subject}\n${message.text}\n${message.html}`;
    expect(all).not.toMatch(/mot de passe\s*:/i);
    expect(all).not.toMatch(/€|euros?|commission\s+de/i);
    // Le gabarit HTML porte du CSS en pourcentages : les montants se cherchent dans le texte seul.
    expect(`${message.subject}\n${message.text}`).not.toMatch(/\d+\s?%/);
  });

  it("n'est pas un e-mail de réinitialisation : rien à ignorer, rien de « réinitialisé »", () => {
    expect(message.subject).not.toMatch(/réinitialis/i);
    expect(message.text).not.toMatch(/ignorez ce message/);
  });

  it("échappe le prénom dans le HTML", () => {
    const hostile = buildDirectorInvitationEmail({ firstName: "<script>x</script>", url: URL, expiresAt: EXPIRES });
    expect(hostile.html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(hostile.html).not.toContain("<script>x</script>");
  });
});

describe("e-mail de réinitialisation du mot de passe du directeur", () => {
  const message = buildDirectorInvitationEmail({ firstName: "Camille", url: URL, expiresAt: EXPIRES, kind: "reset" });

  it("est intitulé « Réinitialiser votre mot de passe » et garde le lien à usage unique", () => {
    expect(message.subject).toBe("Réinitialiser votre mot de passe — PharmaBoost");
    expect(message.html).toContain("Réinitialiser votre mot de passe");
    expect(message.text).toContain(URL);
    expect(message.html).toContain(`href="${URL}"`);
    expect(message.text).toMatch(/à usage unique/);
  });

  it("rassure celui qui n'a rien demandé", () => {
    expect(message.text).toContain("Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : rien ne sera modifié.");
    expect(message.html).toContain("rien ne sera modifié");
  });

  it("ne dit pas que l'espace vient d'être créé", () => {
    expect(message.text).not.toMatch(/est prêt/);
  });

  it("le type par défaut est l'invitation", () => {
    expect(buildDirectorInvitationEmail({ firstName: "Camille", url: URL, expiresAt: EXPIRES, kind: "invitation" })).toEqual(buildDirectorInvitationEmail({ firstName: "Camille", url: URL, expiresAt: EXPIRES }));
  });
});
