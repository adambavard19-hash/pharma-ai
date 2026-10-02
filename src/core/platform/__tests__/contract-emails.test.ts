import { describe, expect, it } from "vitest";
import { buildContractFinalizedEmail, buildEmailConfirmationEmail, buildPharmacySignedEmail, buildSignatureReminderEmail, buildSignatureRequestEmail, buildSubscriptionReceivedEmail } from "../contract-emails";
import { renderEmail, trialLabel } from "../email-layout";
import { buildContractEmail, shell } from "../sales-emails";

const ctx = { baseUrl: "https://pharmaboost.app", logoUrl: "https://pharmaboost.app/logo-256.png", company: { legalName: "PharmaBoost SAS", address: "10 rue de la Santé, 75013 Paris", siren: "123456789", contactEmail: "contact@pharmaboost.app" } };
const facts = { ownerName: "Marc Delaunay", pharmacyName: "Pharmacie du Port", legalName: "SELARL Pharmacie du Port", offerName: "PharmaBoost Officine", monthlyPriceCents: 6900, durationMonths: 12, trialDays: 30, reference: "PB-2026-PORT-V1" };
// Pictogrammes et emojis : aucun dans un e-mail professionnel.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

describe("gabarit e-mail PharmaBoost", () => {
  it("porte logo, pied de page légal, liens légaux et version texte", () => {
    const email = renderEmail(ctx, { subject: "Test", preheader: "Aperçu", title: "Titre", blocks: [{ kind: "paragraph", text: "Bonjour <script>" }, { kind: "button", url: "https://x.test/a?b=1&c=2", label: "Agir" }] });
    expect(email.html).toContain('src="https://pharmaboost.app/logo-256.png"');
    expect(email.html).toContain("PharmaBoost SAS · 10 rue de la Santé, 75013 Paris · SIREN 123456789");
    expect(email.html).toContain("/decouvrir/mentions-legales");
    expect(email.html).toContain("/decouvrir/confidentialite");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("https://x.test/a?b=1&amp;c=2");
    expect(email.html).toContain("max-width:600px");
    expect(email.text).toContain("Agir : https://x.test/a?b=1&c=2");
  });

  it("habille aussi les anciens e-mails (enveloppe commune)", () => {
    const html = shell("Objet", "Titre", "<p>corps</p>");
    expect(html).toContain("logo-256.png");
    expect(html).toContain("Mentions légales");
    const legacy = buildContractEmail({ ownerName: "A", pharmacyName: "B", salesRepName: "C", salesRepEmail: "c@x.fr", salesRepPhone: null, url: "https://x/c", signingUrl: null, expiresAt: new Date() });
    expect(legacy.html).toContain("Mentions légales");
  });

  it("dit « premier mois offert » quand c'est le cas", () => {
    expect(trialLabel(30)).toBe("Premier mois offert");
    expect(trialLabel(14)).toBe("14 jours offerts");
    expect(trialLabel(0)).toBeNull();
  });
});

describe("e-mails du parcours contractuel", () => {
  it("demande de signature : objet, bouton de signature, récapitulatif complet, aucun emoji", () => {
    const email = buildSignatureRequestEmail(ctx, { ...facts, signingUrl: "https://docuseal.com/s/abc", viewUrl: "https://pharmaboost.app/contrat/tok", expiresAt: new Date("2026-10-31T10:00:00Z") });
    expect(email.subject).toBe("Votre contrat PharmaBoost est prêt à être signé");
    expect(email.html).toContain("Consulter et signer le contrat");
    expect(email.html).toContain("https://docuseal.com/s/abc");
    for (const value of ["Pharmacie du Port", "SELARL Pharmacie du Port", "PharmaBoost Officine", "69,00", "Premier mois offert", "PB-2026-PORT-V1"]) expect(email.text).toContain(value);
    expect(EMOJI.test(email.html + email.subject)).toBe(false);
  });

  it("sans prestataire de signature, propose de consulter et n'invente pas de lien de signature", () => {
    const email = buildSignatureRequestEmail(ctx, { ...facts, signingUrl: null, viewUrl: "https://pharmaboost.app/contrat/tok", expiresAt: new Date() });
    expect(email.html).toContain("Consulter le contrat");
    expect(email.html).not.toContain("Consulter et signer");
  });

  it("rappel, confirmation, finalisation, demande reçue : sobres et sans emoji", () => {
    const all = [
      buildSignatureReminderEmail(ctx, { ...facts, signingUrl: "https://docuseal.com/s/abc", viewUrl: "https://x", expiresAt: new Date(), reminderNumber: 2 }),
      buildPharmacySignedEmail(ctx, { ...facts, signedAt: new Date() }),
      buildContractFinalizedEmail(ctx, { ...facts, finalizedAt: new Date(), documentUrl: "https://pharmaboost.app/contrat/tok" }),
      buildSubscriptionReceivedEmail(ctx, { ownerName: "Marc", pharmacyName: "Pharmacie du Port", nextStep: "Votre contrat arrive." }),
      buildEmailConfirmationEmail(ctx, { ownerName: "Marc", pharmacyName: "Pharmacie du Port", confirmUrl: "https://pharmaboost.app/decouvrir/abonnement/confirmer?jeton=x" }),
    ];
    expect(all[4].html).toContain("Confirmer et recevoir mon contrat");
    expect(all[4].text).toContain("aucun contrat ne sera envoyé");
    expect(all[0].subject).toBe("Votre contrat PharmaBoost attend toujours votre signature");
    expect(all[2].html).toContain("Télécharger le contrat signé");
    expect(all[2].text).toContain("Les prochaines étapes");
    for (const email of all) expect(EMOJI.test(email.html + email.subject)).toBe(false);
  });
});
