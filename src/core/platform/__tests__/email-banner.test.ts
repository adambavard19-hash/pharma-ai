import { describe, expect, it } from "vitest";
import { EMAIL_BANNER, emailBannerUrls, emailFrame, renderEmail, type EmailContext } from "../email-layout";
import { buildTeamInvitationEmail } from "@/core/team/access-emails";
import { buildUserPasswordEmail } from "../welcome-email";
import { buildAdminPasswordEmail } from "../reset-email";
import { buildSalesInvitationEmail, buildDirectorInvitationEmail } from "../sales-emails";
import { buildSupportAlertEmail } from "@/core/support/emails";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Le bandeau de l'hélice d'ADN en tête de tous les e-mails PharmaBoost (gabarit commun) : adresse absolue https,
 * texte de remplacement, largeur adaptable, image fixe pour Outlook bureau.
 */

const ctx: EmailContext = { baseUrl: "https://pharmaboost.app", company: { legalName: "PharmaBoost", contactEmail: "contact@pharmaboost.app" } };
const GIF = 'src="https://pharmaboost.app/email/bandeau-adn.gif"';
const PNG = 'src="https://pharmaboost.app/email/bandeau-adn.png"';

const expectBanner = (html: string) => {
  expect(html).toContain(GIF);
  expect(html).toContain(PNG);
  expect(html).toMatch(/alt="PharmaBoost — le copilote intelligent de l(&#39;|&#x27;|')officine"/);
  // Une seule fois chacune, avant le titre de la carte.
  expect(html.split("bandeau-adn.gif").length - 1).toBe(1);
  expect(html.indexOf("bandeau-adn.gif")).toBeLessThan(html.indexOf("<h1"));
};

describe("le bandeau des e-mails", () => {
  it("adresse absolue https ; depuis un poste de développement, les images viennent du site public", () => {
    expect(emailBannerUrls("https://pharmaboost.app/")).toEqual({ gif: "https://pharmaboost.app/email/bandeau-adn.gif", png: "https://pharmaboost.app/email/bandeau-adn.png" });
    expect(emailBannerUrls("https://apercu.pharmaboost.app").gif).toBe("https://apercu.pharmaboost.app/email/bandeau-adn.gif");
    expect(emailBannerUrls("http://localhost:3000").gif).toBe("https://pharmaboost.app/email/bandeau-adn.gif");
  });

  it("GIF animé pour toutes les messageries, image fixe pour Outlook bureau, texte de remplacement, largeur adaptable", () => {
    const html = emailFrame(ctx, { subject: "S", title: "T", bodyHtml: "<p>x</p>" });
    expectBanner(html);
    expect(html).toMatch(/<!--\[if mso\]><img src="https:\/\/pharmaboost\.app\/email\/bandeau-adn\.png"[^>]*><!\[endif\]-->/);
    expect(html).toMatch(/<!--\[if !mso\]><!--><img src="https:\/\/pharmaboost\.app\/email\/bandeau-adn\.gif"[^>]*><!--<!\[endif\]-->/);
    expect(html).toContain(`width="${EMAIL_BANNER.width}" height="${EMAIL_BANNER.height}"`);
    expect(html).toContain("width:100%;max-width:600px;height:auto");
  });

  it("le texte brut ne change pas", () => {
    expect(renderEmail(ctx, { subject: "S", preheader: "P", title: "T", blocks: [] }).text).not.toContain("bandeau");
  });

  it("les e-mails réels le portent : invitation d'équipe, bienvenue, mot de passe, commerciaux, direction, support", () => {
    const expiresAt = new Date("2026-10-20T10:00:00+02:00");
    expectBanner(buildTeamInvitationEmail({ firstName: "Léa", pharmacyName: "Pharmacie du Port", inviterName: "Marc", roleLabel: "préparatrice", url: "https://pharmaboost.app/invitation/x", expiresAt }).html);
    expectBanner(buildUserPasswordEmail({ firstName: "Léa", pharmacyName: "Pharmacie du Port", url: "https://pharmaboost.app/mot-de-passe/x", loginUrl: "https://pharmaboost.app/login", expiresAt, kind: "welcome" }).html);
    expectBanner(buildUserPasswordEmail({ firstName: "Léa", pharmacyName: null, url: "https://pharmaboost.app/mot-de-passe/x", loginUrl: "https://pharmaboost.app/login", expiresAt, kind: "reset" }).html);
    expectBanner(buildAdminPasswordEmail({ fullName: "Alex", url: "https://pharmaboost.app/admin-connexion/mot-de-passe/x", expiresAt }).html);
    expectBanner(buildSalesInvitationEmail({ firstName: "Sam", url: "https://pharmaboost.app/extranet/mot-de-passe/x", expiresAt }).html);
    expectBanner(buildDirectorInvitationEmail({ firstName: "Camille", url: "https://pharmaboost.app/directeur/mot-de-passe/x", expiresAt }).html);
    expectBanner(buildSupportAlertEmail({ pharmacyName: "Pharmacie du Port", city: null, authorName: "Léa", subject: "Question", topicLabel: "Autre", excerpt: "Bonjour", isNewThread: true, isReply: false, adminUrl: "https://pharmaboost.app/admin/support/x" }).html);
  });

  it("les images existent dans public/ et restent légères", () => {
    for (const file of [EMAIL_BANNER.gif, EMAIL_BANNER.png]) {
      const full = path.join(process.cwd(), "public", file);
      expect(existsSync(full)).toBe(true);
      expect(statSync(full).size).toBeLessThan(600 * 1024);
    }
  });
});
