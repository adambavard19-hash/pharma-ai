import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatPriceEuros, resolvePublicPricing } from "@/core/pricing/official-offer";
import { estimateAdditionalRevenue } from "@/core/pricing/revenue-estimate";

/**
 * La plaquette des commerciaux, rendue sans navigateur : six feuilles A4, l'estimation CALCULÉE (pas recopiée), le tarif de
 * l'offre publique, les coordonnées du commercial (ou l'adresse publique), et aucun mot que le site s'interdit.
 */

vi.mock("server-only", () => ({}));

const { Plaquette, EXAMPLE_CLIENTS_PER_DAY, PLAQUETTE_SUBSCRIPTION_INCLUDES } = await import("../plaquette");
const { formatPhoneFr, normalizeContact } = await import("../contact");
const { PLAQUETTE_CSS } = await import("../plaquette-styles");
const { PricingSection, SETUP_INCLUDES } = await import("@/app/(public)/decouvrir/_components/pricing-section");
const { SAFETY, STOCK_POINTS, TEAM_POINTS, EXAMPLES } = await import("@/app/(public)/decouvrir/_components/site-content");

/** Le texte que lit le destinataire : sans feuilles de style ni balises, espaces insécables lus comme des espaces. */
const visible = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|[   ]/g, " ")
    .replace(/\s+/g, " ");

const OFFICIAL = resolvePublicPricing(null);
const genericHtml = renderToStaticMarkup(createElement(Plaquette, { pricing: OFFICIAL }));
const generic = visible(genericHtml);
const personalHtml = renderToStaticMarkup(createElement(Plaquette, { pricing: OFFICIAL, contact: { name: "Camille Martin", email: "camille.martin@exemple.fr", phone: "0612345678" } }));
const personal = visible(personalHtml);

describe("la plaquette : six feuilles A4, imprimables", () => {
  it("rend exactement six feuilles, la couverture d'abord", () => {
    expect(genericHtml.match(/class="plq-page"/g)).toHaveLength(6);
    expect(generic).toContain("Plaquette de présentation");
    expect(generic).toContain("Le copilote du comptoir officinal");
    expect(generic).toContain("Scan. Conseil. Bilan.");
    for (const n of [2, 3, 4, 5, 6]) expect(generic).toContain(`${n} / 6`);
  });

  it("imprime en A4 sans marge, saut de page après chaque feuille, couleurs de fond conservées", () => {
    expect(PLAQUETTE_CSS).toContain("@page plaquette{size:A4;margin:0}");
    expect(PLAQUETTE_CSS).toContain("width:210mm;height:297mm");
    expect(PLAQUETTE_CSS).toContain("break-after:page");
    expect(PLAQUETTE_CSS).toContain("-webkit-print-color-adjust:exact");
    // La feuille de style générale réduit la taille de base à l'impression : la plaquette la remet, pour un PDF égal à l'aperçu.
    expect(PLAQUETTE_CSS).toContain("html{font-size:16px!important}");
    // La feuille de style voyage avec la plaquette (une fois par page, quelle que soit la page qui l'affiche).
    expect(genericHtml).toContain("pharmaboost-plaquette");
    expect(genericHtml).toContain("@page plaquette{size:A4;margin:0}");
  });

  it("couvre les six sujets : potentiel, fonctionnement, gains, sécurité, tarif, contact", () => {
    for (const heading of [
      "Et si chaque délivrance révélait tout son potentiel de conseil ?",
      "Du scan au conseil, en trois étapes.",
      "Le bon conseil commence par la bonne question.",
      "Plus de conseils pertinents, plus d’opportunités au comptoir, sans changer vos habitudes.",
      "La sécurité avant la suggestion.",
      "Un seul abonnement. Tout est inclus.",
      "Votre contact",
    ]) {
      expect(generic).toContain(heading);
    }
    expect(generic).toContain("En rayon, des milliers de références.");
    expect(generic).toContain("Avec la file qui attend, impossible de tout avoir en tête");
    expect(generic).toContain("Vous scannez les boîtes");
    expect(generic).toContain("Vendu ou Non vendu : un clic.");
    expect(generic).toContain("Son bilan par e-mail, s'il le souhaite. Ou, depuis l'écran de vente, son plan conseil complet");
  });
});

describe("l'estimation : calculée par la fonction du simulateur, jamais recopiée", () => {
  const estimate = estimateAdditionalRevenue(EXAMPLE_CLIENTS_PER_DAY);
  const perMonth = visible(formatPriceEuros(estimate.perMonthCents));

  it("200 clients × 10 % × 7 € × 25 jours = 3 500 € de chiffre d'affaires par mois", () => {
    expect(EXAMPLE_CLIENTS_PER_DAY).toBe(200);
    expect(perMonth).toBe("3 500 €");
    expect(generic).toContain(`${perMonth} par mois`);
    expect(generic).toContain("200 clients × 10 % × 7 € × 25 jours = 3 500 €");
    expect(generic).toContain("Clients repartis avec un produit conseillé (10 %) 20 par jour");
    expect(generic).toContain("× 7 € par produit en moyenne 140 € par jour");
  });

  it("dit que c'est une estimation, pas une promesse, et du chiffre d'affaires, pas une marge", () => {
    expect(generic).toContain("Estimation indicative, pas une promesse de résultat");
    expect(generic).toContain("C'est du chiffre d'affaires, pas une marge.");
    expect(generic).toContain("Pour un abonnement de 126 € HT par mois.");
  });
});

describe("le tarif : celui de l'offre publique, et ce que comprend la mise en service", () => {
  it("126 € HT par mois, engagement de 12 mois, mise en service de 200 € HT une seule fois", () => {
    expect(generic).toContain("126 € HT / mois");
    expect(generic).toContain("Engagement de 12 mois");
    expect(generic).toContain("200 € HT, une seule fois");
    for (const item of SETUP_INCLUDES) expect(generic).toContain(item);
  });

  it("l'abonnement compris : mot pour mot la liste de la section tarif du site", () => {
    const site = visible(renderToStaticMarkup(createElement(PricingSection, { pricing: OFFICIAL })));
    for (const item of PLAQUETTE_SUBSCRIPTION_INCLUDES) {
      expect(site).toContain(item);
      expect(generic).toContain(item);
    }
  });

  it("parrainage : 10 % de moins, 126 € deviennent 113,40 € HT", () => {
    expect(generic).toContain("Parrainez un confrère : 10 % de moins par mois");
    expect(generic).toContain("vous ne payez plus 126 € mais 113,40 € HT par mois");
  });

  it("suit l'offre de la console quand elle est publiée : aucun montant n'est écrit dans la plaquette", () => {
    const plan = resolvePublicPricing({ name: "Offre Test", monthlyPriceCents: 20_000, setupFeeCents: 39_000 });
    const text = visible(renderToStaticMarkup(createElement(Plaquette, { pricing: plan })));
    expect(text).toContain("200 € HT / mois");
    expect(text).toContain("390 € HT, une seule fois");
    expect(text).toContain("Pour un abonnement de 200 € HT par mois.");
    expect(text).toContain("Offre Test");
    expect(text).not.toContain("126 €");
  });

  it("premier déploiement LGPI, les autres logiciels avec nous ; les trois prochaines étapes", () => {
    expect(generic).toContain("Premier déploiement : LGPI ; les autres logiciels s'installent avec nous.");
    for (const step of ["La démonstration", "L'installation", "La formation de l'équipe"]) expect(generic).toContain(step);
  });
});

describe("les textes viennent du site, mot pour mot", () => {
  it("le départage, tel que le site le dit", () => {
    expect(generic).toContain("À conseil égal, après vos laboratoires préférés : la date courte, puis le challenge en cours");
  });

  it("stock, équipe, sécurité et exemples : les listes de l'accueil, en entier", () => {
    for (const point of [...STOCK_POINTS, ...TEAM_POINTS, ...SAFETY]) expect(generic).toContain(point.value);
    for (const example of EXAMPLES) expect(generic).toContain(example.shows);
  });

  it("le pharmacien garde la décision ; aucune fiche patient, l'e-mail du bilan effacé après l'envoi", () => {
    expect(generic).toContain("Le pharmacien garde la décision.");
    expect(generic).toContain("Aucune fiche patient. L'e-mail du bilan est effacé après l'envoi (ou après le rappel de fin de cure).");
    expect(generic).toContain("3 g de paracétamol par jour au maximum");
  });

  it("marque « exemple » chaque visuel qui montre des produits ou des prix", () => {
    expect(generic.match(/\bexemple\b/gi)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(genericHtml).toMatch(/aria-label="Bannière PharmaBoost, exemple/);
  });
});

describe("aucun mot interdit, aucune promesse", () => {
  it.each([
    ["générique", generic],
    ["personnelle", personal],
  ])("version %s", (_name, text) => {
    const lower = text.toLowerCase();
    for (const forbidden of [
      "interaction",
      "douchette",
      "validé par un pharmacien",
      "validés par un pharmacien",
      "temps réel",
      "en direct",
      "stock exact",
      "à l'euro près",
      "garanti",
      "aussitôt",
      "instantané",
      "hébergé en europe",
      "hébergement européen",
      "robot",
      "rowa",
      "partenaire",
      "formations",
      "nouveautés",
    ]) {
      expect(lower, forbidden).not.toContain(forbidden);
    }
    expect(lower).not.toMatch(/\bbip\b/);
    expect(lower).not.toMatch(/en \d+ (secondes|minutes)/);
  });
});

describe("les coordonnées", () => {
  it("version générique : l'adresse publique et le site, aucune donnée personnelle", () => {
    expect(genericHtml).toContain('data-plaquette="generique"');
    expect(generic).toContain("Votre contact PharmaBoost Contact@pharmaboost.app pharmaboost.app");
    expect(generic).toContain("pharmaboost.app · Contact@pharmaboost.app");
    expect(generic).not.toMatch(/@exemple\.fr|06 \d{2}/);
  });

  it("version du commercial : son nom, son téléphone mis en forme et son e-mail, en couverture, en pied et dans « Votre contact »", () => {
    expect(personalHtml).toContain('data-plaquette="personnelle"');
    expect(personal).toContain("Votre contact · Camille Martin");
    expect(personal).toContain("Votre contact Camille Martin Votre contact PharmaBoost 06 12 34 56 78 camille.martin@exemple.fr");
    // Le pied des cinq feuilles intérieures.
    expect(personal.match(/Camille Martin · 06 12 34 56 78 · camille\.martin@exemple\.fr/g)).toHaveLength(5);
    // L'adresse publique reste, à côté de la démo.
    expect(personal).toContain("Contact@pharmaboost.app");
  });

  it("sans téléphone : l'e-mail seul, ni « null » ni « undefined »", () => {
    const text = visible(renderToStaticMarkup(createElement(Plaquette, { pricing: OFFICIAL, contact: { name: "Camille Martin", email: "camille.martin@exemple.fr", phone: null } })));
    expect(text).toContain("Camille Martin · camille.martin@exemple.fr");
    expect(text).not.toMatch(/null|undefined/);
  });

  it("un contact sans nom ou sans e-mail retombe sur la version générique", () => {
    expect(normalizeContact({ name: " ", email: "x@exemple.fr" })).toBeNull();
    expect(normalizeContact({ name: "Camille", email: "" })).toBeNull();
    expect(normalizeContact(null)).toBeNull();
    expect(normalizeContact({ name: " Camille Martin ", email: " c@exemple.fr ", phone: " " })).toEqual({ name: "Camille Martin", email: "c@exemple.fr", phone: null });
  });

  it("met en forme les numéros français, laisse les autres tels quels", () => {
    expect(formatPhoneFr("0612345678")).toBe("06 12 34 56 78");
    expect(formatPhoneFr("06.12.34.56.78")).toBe("06 12 34 56 78");
    expect(formatPhoneFr("+33612345678")).toBe("+33 6 12 34 56 78");
    expect(formatPhoneFr("+33 (0)6 12")).toBe("+33 (0)6 12");
    expect(formatPhoneFr("+32 470 12 34 56")).toBe("+32 470 12 34 56");
  });
});
