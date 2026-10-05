import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { emailFrame, renderEmail, type EmailContent, type EmailContext } from "../email-layout";

const ctx: EmailContext = {
  baseUrl: "https://pharmaboost.app",
  logoUrl: "https://pharmaboost.app/logo-256.png",
  company: { legalName: "PharmaBoost SAS", address: "10 rue de la Santé, 75013 Paris", siren: "123456789", contactEmail: "contact@pharmaboost.app" },
};

const content: EmailContent = {
  subject: "Un sujet <test>",
  preheader: "Aperçu",
  eyebrow: "PharmaBoost",
  title: "Un titre",
  greeting: "Bonjour Camille,",
  blocks: [
    { kind: "paragraph", text: "Un paragraphe & une esperluette." },
    { kind: "button", url: "https://pharmaboost.app/parametres", label: "Ouvrir" },
    { kind: "note", text: "Une note." },
  ],
  reason: "Vous recevez ce message parce que test.",
};

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

describe("pied de page « Ne plus recevoir ces offres »", () => {
  it("sans l'option, la sortie est identique à celle d'avant son ajout (empreintes relevées avant la modification)", () => {
    const out = renderEmail(ctx, content);
    // Si le gabarit change volontairement, ces deux empreintes se mettent à jour : elles prouvent que l'option n'a rien déplacé.
    expect(sha(out.text)).toBe("ae21432685980ec74ab708469e7dd41a879bb141dabbc7a8318acd9eeed4c4cc");
    expect(sha(out.html)).toBe("25470e386392d3a8c4ca4e40bd797f38bb1ef904ffb4e7dd2fdd9225f4950944");
  });

  it("une option absente, nulle ou vide ne change rien", () => {
    const base = renderEmail(ctx, content);
    for (const unsubscribeUrl of [undefined, null, ""]) {
      expect(renderEmail(ctx, { ...content, unsubscribeUrl })).toEqual(base);
    }
    expect(base.text).not.toContain("Ne plus recevoir");
    expect(base.html).not.toContain("Ne plus recevoir");
  });

  it("avec l'option, le lien est dit en texte et en HTML, et rien d'autre ne bouge", () => {
    const url = "https://pharmaboost.app/offres/desinscription/jeton.signature";
    const base = renderEmail(ctx, content);
    const out = renderEmail(ctx, { ...content, unsubscribeUrl: url });
    expect(out.text).toContain(`Ne plus recevoir ces offres : ${url}`);
    expect(out.html).toContain(`<a href="${url}"`);
    expect(out.html).toContain("Ne plus recevoir ces offres");
    // Retiré, ce qu'elle ajoute laisse exactement la sortie d'origine : l'ajout est strictement additif.
    expect(out.text.replace(`Ne plus recevoir ces offres : ${url}\n`, "")).toBe(base.text);
    expect(out.html.replace(/<p style="margin:0 0 10px">Ne plus recevoir ces offres[^]*?<\/p>/, "")).toBe(base.html);
  });

  it("le lien vient après la raison du message et avant les mentions légales", () => {
    const out = renderEmail(ctx, { ...content, unsubscribeUrl: "https://pharmaboost.app/offres/desinscription/x" });
    const order = ["Vous recevez ce message", "Ne plus recevoir ces offres", "Contact :", "Mentions légales"].map((needle) => out.text.indexOf(needle));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("l'adresse est échappée dans le HTML", () => {
    const out = renderEmail(ctx, { ...content, unsubscribeUrl: 'https://pharmaboost.app/x?a=1&b="2"' });
    expect(out.html).toContain("a=1&amp;b=&quot;2&quot;");
    expect(out.html).not.toContain('b="2"');
  });

  it("l'enveloppe commune porte l'option aussi, pour les gabarits qui composent leur HTML", () => {
    const frame = (unsubscribeUrl?: string) => emailFrame(ctx, { subject: "S", title: "T", bodyHtml: "<p>x</p>", reason: "Raison", unsubscribeUrl });
    expect(frame("https://pharmaboost.app/offres/desinscription/x")).toContain("Ne plus recevoir ces offres");
    expect(frame()).not.toContain("Ne plus recevoir");
  });
});
