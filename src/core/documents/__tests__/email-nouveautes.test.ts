import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildDocumentEmail, buildNewsOptInBlock } from "../email";
import type { DayPlanSummary } from "../compose";

/**
 * Le bloc facultatif « nouveautés de votre pharmacie » s'ajoute à l'e-mail du
 * plan sans le changer. Ces tests épinglent l'e-mail d'avant, octet pour octet,
 * avec les valeurs de email.test.ts : sans lien d'abonnement, le message est
 * strictement le même.
 */

const DAY_PLAN: DayPlanSummary[] = [
  { moment: "morning", label: "Matin", icon: "☀️", count: 2 },
  { moment: "noon", label: "Midi", icon: "🍽", count: 1 },
  { moment: "evening", label: "Soir", icon: "🌙", count: 2 },
];

// Les mêmes valeurs que email.test.ts.
const BASE = {
  patientFirstName: "Adam",
  pharmacyName: "Pharmacie Saint-Michel",
  pharmacyPhone: "01 23 45 67 89",
  brandColor: "#0F766E",
  passageAt: new Date("2026-09-07T10:00:00Z"),
  dayPlan: DAY_PLAN,
  url: "https://pharma.example/fiche/abc123",
  printUrl: "https://pharma.example/fiche/abc123?imprimer=1",
  expiresAt: new Date("2026-09-30T12:00:00Z"),
  isDemo: false,
};

const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

/** Le texte du message tel qu'il partait avant l'ajout du bloc. */
const TEXT_BEFORE = `Bonjour Adam,

À la suite de votre passage à la Pharmacie Saint-Michel le 7 septembre 2026, vous trouverez votre plan personnalisé préparé avec votre pharmacien.

Votre traitement
Matin : 2 prises  |  Midi : 1 prise  |  Soir : 2 prises

Consulter mon plan : https://pharma.example/fiche/abc123
Télécharger / imprimer : https://pharma.example/fiche/abc123?imprimer=1

Ce lien est personnel et reste valable jusqu'au 30 septembre 2026.
Ce plan ne remplace ni votre ordonnance, ni l'avis de votre médecin.
Une question ? Appelez votre pharmacie au 01 23 45 67 89.

Vous recevez ce message parce que vous avez accepté que votre pharmacien vous transmette vos conseils. Il ne contient aucune information sur votre santé.
Pharmacie Saint-Michel`;

// Empreintes du HTML d'avant (à recalculer seulement si l'e-mail du plan change volontairement).
const HTML_SHA256_BEFORE = "383faf7ae38d1065b75a48ef9e7ecbf48963093621b71dd98f2e912e959a4c92";
const VARIANT = { ...BASE, printUrl: null, isDemo: true, patientFirstName: "" };
const VARIANT_TEXT_SHA256_BEFORE = "de033e327db8e175c1a625556f4d2e98c0cecc47c98d9b8dbc6b2ebe7837a47b";
const VARIANT_HTML_SHA256_BEFORE = "d35f2a1484a08cd2df11e4c9c7b00bff9144166c829bd2dca353584853003831";

const OPT_IN_URL = "https://pharma.example/nouveautes/abonnement/jeton-abc";

describe("sans lien d'abonnement : le message est strictement celui d'avant", () => {
  it("le texte est identique, caractère pour caractère", () => {
    expect(buildDocumentEmail(BASE).text).toBe(TEXT_BEFORE);
  });

  it("le HTML est identique, octet pour octet", () => {
    expect(sha256(buildDocumentEmail(BASE).html)).toBe(HTML_SHA256_BEFORE);
  });

  it("une variante (démonstration, sans prénom, sans lien d'impression) l'est aussi", () => {
    const message = buildDocumentEmail(VARIANT);
    expect(sha256(message.text)).toBe(VARIANT_TEXT_SHA256_BEFORE);
    expect(sha256(message.html)).toBe(VARIANT_HTML_SHA256_BEFORE);
  });

  it("absent, nul ou indéfini : aucune différence", () => {
    const reference = buildDocumentEmail(BASE);
    expect(buildDocumentEmail({ ...BASE, newsOptIn: null })).toEqual(reference);
    expect(buildDocumentEmail({ ...BASE, newsOptIn: undefined })).toEqual(reference);
  });
});

describe("avec le lien d'abonnement : un bloc distinct, facultatif, qui ne touche pas au reste", () => {
  const without = buildDocumentEmail(BASE);
  const withBlock = buildDocumentEmail({ ...BASE, newsOptIn: { url: OPT_IN_URL } });
  const block = buildNewsOptInBlock({ pharmacyName: BASE.pharmacyName, url: OPT_IN_URL, brandColor: BASE.brandColor });

  it("ne fait qu'ajouter : retirer le bloc redonne exactement le message d'avant, en texte comme en HTML", () => {
    expect(withBlock.text.replace(`${block.text.join("\n")}\n\n`, "")).toBe(without.text);
    expect(withBlock.html.replace(`\n  ${block.html}`, "")).toBe(without.html);
    expect(withBlock.subject).toBe(without.subject);
  });

  it("se place après le bouton du plan et avant les mentions, en texte et en HTML", () => {
    const text = withBlock.text;
    expect(text.indexOf("Télécharger / imprimer")).toBeLessThan(text.indexOf("Facultatif"));
    expect(text.indexOf("Facultatif")).toBeLessThan(text.indexOf("Ce lien est personnel"));
    const html = withBlock.html;
    expect(html.indexOf(">Télécharger / imprimer</a>")).toBeLessThan(html.indexOf("Facultatif"));
    expect(html.indexOf("Facultatif")).toBeLessThan(html.indexOf("Ce lien est personnel"));
  });

  it("le consentement ne se mélange pas à la consultation du plan : deux liens, deux gestes", () => {
    expect(withBlock.html.split(`href="${BASE.url}"`)).toHaveLength(2);
    expect(withBlock.html.split(`href="${OPT_IN_URL}"`)).toHaveLength(2);
    expect(withBlock.text).toContain(`Consulter mon plan : ${BASE.url}`);
    expect(withBlock.text).toContain(`Je souhaite être prévenu(e) : ${OPT_IN_URL}`);
    // Le bouton plein reste celui du plan ; le lien d'abonnement n'est pas un bouton.
    expect(withBlock.html).toContain(">Consulter mon plan</a>");
    expect(withBlock.html).not.toMatch(/<a href="[^"]*nouveautes[^"]*"[^>]*display:block/);
  });

  it("n'est pas pré-coché : un lien, aucun champ", () => {
    expect(withBlock.html).not.toMatch(/<input|checked|checkbox/i);
  });

  it("dit que c'est facultatif et que rien n'est enregistré avant la confirmation", () => {
    expect(withBlock.text).toContain("Facultatif : être prévenu(e) des nouveautés de votre pharmacie");
    expect(withBlock.text).toContain("Ce n'est pas nécessaire pour consulter votre plan : rien n'est enregistré tant que vous n'avez pas confirmé");
  });

  it("ne nomme pas le logiciel et n'ajoute aucun emoji", () => {
    expect(`${withBlock.text}\n${withBlock.html}`).not.toMatch(/pharmaboost|pharma\.ai/i);
    expect(`${block.text.join("\n")}\n${block.html}`).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it("échappe l'adresse dans le HTML et la garde intacte dans le texte", () => {
    const url = "https://pharma.example/nouveautes/abonnement/jeton?a=1&b=2";
    const message = buildDocumentEmail({ ...BASE, newsOptIn: { url } });
    expect(message.html).toContain('href="https://pharma.example/nouveautes/abonnement/jeton?a=1&amp;b=2"');
    expect(message.text).toContain(`: ${url}`);
  });

  it("reprend la couleur de l'officine, et se replie sur une couleur sûre", () => {
    expect(buildNewsOptInBlock({ pharmacyName: "P", url: OPT_IN_URL, brandColor: "#123456" }).html).toContain("color:#123456");
    expect(buildNewsOptInBlock({ pharmacyName: "P", url: OPT_IN_URL, brandColor: "url(javascript:x)" }).html).not.toContain("javascript");
  });

  it("la démonstration reste annoncée avant tout, bloc ou non", () => {
    const demo = buildDocumentEmail({ ...BASE, isDemo: true, newsOptIn: { url: OPT_IN_URL } });
    expect(demo.text.startsWith("MESSAGE DE DÉMONSTRATION")).toBe(true);
  });

  it("le nom de la pharmacie du bloc est échappé", () => {
    const html = buildNewsOptInBlock({ pharmacyName: "Pharmacie <Test> & Co", url: OPT_IN_URL }).html;
    expect(html).toContain("Pharmacie &lt;Test&gt; &amp; Co");
    expect(html).not.toContain("<Test>");
  });
});
