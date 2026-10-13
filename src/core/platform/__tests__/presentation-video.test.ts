import { describe, expect, it } from "vitest";
import { PRESENTATION_VIDEO_LABEL, presentationVideoLinks } from "../presentation-video";
import { buildUserPasswordEmail } from "../welcome-email";
import { buildInstallationGuideEmail } from "../onboarding-emails";
import { buildTeamInvitationEmail } from "@/core/team/access-emails";

const video = presentationVideoLinks((path) => `https://pharmaboost.app${path}`);
const PAGE = "https://pharmaboost.app/decouvrir/video";
const IMAGE = "https://pharmaboost.app/video/pharmaboost-presentation.jpg";

/** L'action principale (le lien personnel) vient AVANT le film ; la vignette et le bouton mènent à la page qui le lit. */
function expectVideo(message: { text: string; html: string }, mainUrl: string) {
  expect(message.text).toContain(PAGE);
  expect(message.html).toContain(`src="${IMAGE}"`);
  expect(message.html.match(new RegExp(`href="${PAGE}"`, "g"))).toHaveLength(2);
  expect(message.html).toContain(PRESENTATION_VIDEO_LABEL);
  expect(message.html.indexOf(`href="${mainUrl}"`)).toBeGreaterThan(-1);
  expect(message.html.indexOf(`href="${mainUrl}"`)).toBeLessThan(message.html.indexOf(PAGE));
  expect(message.text.indexOf(mainUrl)).toBeLessThan(message.text.indexOf(PAGE));
}

describe("le film de présentation dans les e-mails", () => {
  it("des adresses absolues sur le domaine public, vers la page qui lit le film et sa vignette", () => {
    expect(video).toEqual({ pageUrl: PAGE, imageUrl: IMAGE });
    expect(PRESENTATION_VIDEO_LABEL).toBe("Voir la vidéo de présentation (1 min)");
  });

  it("l'invitation d'un collaborateur : le lien de création du compte d'abord, puis le film", () => {
    const url = "https://pharmaboost.app/invitation/abc";
    expectVideo(buildTeamInvitationEmail({ firstName: "Léa", pharmacyName: "Pharmacie du Port", inviterName: "Anne Roux", roleLabel: "préparateur", url, expiresAt: new Date(), video }), url);
  });

  it("la bienvenue du titulaire (premier accès) porte le film ; le « mot de passe oublié », jamais", () => {
    const base = { firstName: "Adam", pharmacyName: "Pharmacie 01", url: "https://pharmaboost.app/mot-de-passe/abc", loginUrl: "https://pharmaboost.app/login", expiresAt: new Date(), video };
    expectVideo(buildUserPasswordEmail({ ...base, kind: "welcome" }), base.url);
    const reset = buildUserPasswordEmail({ ...base, kind: "reset" });
    expect(reset.text).not.toContain(PAGE);
    expect(reset.html).not.toContain(IMAGE);
  });

  it("le guide de mise en service du titulaire porte le film, après « Ouvrir PharmaBoost »", () => {
    expectVideo(buildInstallationGuideEmail({ ownerName: "Marie Dupont", pharmacyName: "Pharmacie du Centre", appUrl: "https://pharmaboost.app/", contactEmail: "contact@pharmaboost.app", video }), "https://pharmaboost.app/");
  });

  it("sans film fourni, rien n'est ajouté (anciens appels)", () => {
    const message = buildTeamInvitationEmail({ firstName: null, pharmacyName: "P", inviterName: "A", roleLabel: "r", url: "https://x.test/i", expiresAt: new Date() });
    expect(message.html).not.toContain("pharmaboost-presentation");
  });
});
