import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Metadata, ResolvingMetadata } from "next";
import { resolvePublicPricing } from "@/core/pricing/official-offer";
import { ANALGESIC_TREE, evaluateTree } from "@/core/counter/question-tree";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { chooseAmongEquivalents, type TiebreakContext } from "@/core/ai/engines/tiebreak";
import type { ScoredRecommendation } from "@/core/ai/types";

vi.mock("server-only", () => ({}));
// L'accueil lit le tarif et les chiffres publics en base : ici, l'offre officielle et aucun chiffre.
vi.mock("@/server/services/public-pricing", () => ({ loadPublicPricing: async () => resolvePublicPricing(null) }));
vi.mock("@/server/services/site-leads", () => ({ loadLiveProof: async () => null }));
vi.mock("@/server/db/client", () => ({ prisma: { salesRep: { findFirst: async () => null } } }));
// La page de démo importe le formulaire, donc son action serveur et la base : seules ses métadonnées sont lues ici.
vi.mock("@/server/actions/site-leads", () => ({ submitSiteLeadAction: async () => ({ ok: true }) }));

const { default: SitePage, metadata: homeMetadata } = await import("../page");
const { default: WhyPage, generateMetadata: whyGenerateMetadata } = await import("../pourquoi/page");
const { generateMetadata: demoGenerateMetadata } = await import("../demo/page");
const { metadata: siteMetadata } = await import("../layout");
const { SiteHeader } = await import("../_components/site-shell");
const { HERO_ITEMS } = await import("../_components/visuals");
const { RevenueCalculator } = await import("../_components/revenue-calculator");
const { FILMS } = await import("../_components/video-dialog");

/** Les métadonnées du layout telles que Next.js les passe à une page : ici, seulement l'image de partage déjà résolue. */
const SHARE_IMAGE = { url: "https://pharmaboost.app/decouvrir/opengraph-image-test", width: 1200, height: 630, alt: "PharmaBoost" };
const parent = Promise.resolve({ openGraph: { images: [SHARE_IMAGE] } }) as unknown as ResolvingMetadata;
const whyMetadata: Metadata = await whyGenerateMetadata({}, parent);
const demoMetadata: Metadata = await demoGenerateMetadata({}, parent);

/** Le texte que lit le visiteur : sans les feuilles de style ni les balises. */
// Les espaces insécables de la typographie française (fr() de site-shell) se lisent comme des espaces.
const visible = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;|\u00a0/g, " ").replace(/\s+/g, " ");

const home = renderToStaticMarkup(await SitePage());
const homeText = visible(home);
const why = renderToStaticMarkup(createElement(WhyPage));
const whyText = visible(why);

describe("le site dit ce que fait l'application, et rien de plus", () => {
  it("garde la promesse validée et l'appel principal", () => {
    // Le premier écran façon limova.ai (fondateur, 24 oct. 2026).
    expect(homeText).toContain("Le copilote IA du comptoir de votre pharmacie.");
    expect(homeText).toContain("Réserver une démo");
    expect(homeText).toContain("À chaque boîte scannée, PharmaBoost montre à votre équipe le bon produit à conseiller, pris dans votre stock.");
  });

  it("n'emploie aucun mot interdit ni aucune promesse", () => {
    for (const text of [homeText, whyText]) {
      const lower = text.toLowerCase();
      for (const forbidden of ["interaction", "douchette", "aucune donnée patient conservée", "validé par un pharmacien", "validés par un pharmacien", "temps réel", "à l'euro près", "un signe de la pharmacie", "sans alerte windows", "hébergé en europe", "hébergement européen"]) {
        expect(lower).not.toContain(forbidden);
      }
      expect(lower).not.toMatch(/\bbip\b/);
      // Aucune durée promise (« en 2 minutes », « en 3 secondes »).
      expect(lower).not.toMatch(/en \d+ (secondes|minutes)/);
    }
  });

  it("dit la vérité sur les données : aucune fiche patient, l'e-mail du bilan effacé après l'envoi", () => {
    expect(homeText).toContain("l'adresse e-mail donnée pour le bilan est effacée après l'envoi");
    expect(whyText).not.toContain("Aucune conservée");
  });

  it("n'a plus la rubrique « La bonne question » ni le tableau d'exemples (retirés par le fondateur, 20 oct. 2026)", () => {
    expect(home).not.toContain('id="questions"');
    expect(homeText).not.toContain("Le bon conseil commence par la bonne question.");
    expect(homeText).not.toContain("Le conseil qui va avec le traitement.");
  });

  it("présente l'équipe et ses résultats", () => {
    expect(home).toContain('id="equipe"');
    expect(homeText).toContain("Les résultats de chacun.");
  });

  it("marque « exemple » chaque visuel qui montre des produits ou des prix", () => {
    // Étape 2, bonne question, stock, équipe, sans ordonnance (le premier écran n'a plus de visuel depuis le 24 oct. 2026).
    expect(homeText.match(/exemple/gi)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it("adosse les conseils de l'accueil à de vraies règles du moteur", () => {
    expect(HERO_ITEMS).toHaveLength(2);
    for (const item of HERO_ITEMS) expect(item.reason, item.name).toBeTruthy();
  });
});

describe("l'en-tête mène d'abord à la bannière du comptoir", () => {
  it("« Au comptoir » est la première entrée, vers la section de la bannière", () => {
    const header = renderToStaticMarkup(createElement(SiteHeader));
    const nav = header.match(/<nav[\s\S]*?<\/nav>/)?.[0] ?? "";
    const links = [...nav.matchAll(/href="([^"]+)"[^>]*>([^<]+)</g)].map((match) => [match[1], match[2]]);
    expect(links[0]).toEqual(["/decouvrir#banniere", "Au comptoir"]);
    // L'onglet « Affiliation » (18 oct. 2026) ferme le menu principal.
    // « Stock et marge » n'est plus dans le menu (fondateur, 20 oct. 2026).
    // « Appli » et « Partenaires » rejoignent le menu (fondateur, 22 oct. 2026).
    // « Vidéo d'explication » rejoint le menu après « Pourquoi » (fondateur, 30 oct. 2026).
    expect(links).toHaveLength(7);
    expect(links[2]).toEqual(["/decouvrir/video-explication", "Vidéo d&#x27;explication"]);
    expect(links[4]).toEqual(["/decouvrir/application", "Appli"]);
    expect(links[5]).toEqual(["/decouvrir/partenaires", "Partenaires"]);
    expect(links[6]).toEqual(["/decouvrir/affiliation", "Affiliation"]);
    expect(nav).not.toContain("#stock-marge");
    // « Suivi pharmaceutique » n'est plus dans le menu, « Tarif » s'appelle « Offre » (fondateur, 21 oct. 2026).
    expect(nav).not.toContain("#suivi");
    expect(links[3]).toEqual(["/decouvrir#tarif", "Offre"]);
    // La rubrique « Comment ça marche » a été retirée de la page (demande du fondateur, 11 oct. 2026) : plus de lien vers elle.
    expect(nav).not.toContain("#fonctionnement");
  });

  it("le robot vivant se tient à côté du nom « PharmaBoost », même avec l'île ; le titre de l'accueil n'en a plus", () => {
    const header = renderToStaticMarkup(createElement(SiteHeader, { island: createElement("span", { "data-ile": "" }) }));
    // Depuis le 18 oct. 2026, le robot est un bouton à part (il ouvre la bannière de l'île), juste devant le lien du nom.
    const robot = header.match(/<button[^>]*aria-label="Ouvrir la bannière PharmaBoost"[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(robot).toMatch(/class="rbt[^"]*"/);
    expect(robot).toContain("data-interactive");
    expect(robot).not.toMatch(/<img/);
    expect(header).toMatch(/<a[^>]*aria-label="PharmaBoost, accueil"[^>]*>Pharma<span[^>]*>Boost<\/span><\/a>/);
    // Demande du fondateur (13 oct. 2026) : le grand robot n'est plus à côté de « Scan. Conseil. Bilan. ».
    expect(home).not.toContain("data-robot-hero");
  });
});

describe("les métadonnées : un titre sans doublon, l'image de partage", () => {
  it("le titre de l'accueil est absolu : le modèle « · PharmaBoost » ne s'y ajoute plus", () => {
    const title = siteMetadata.title as { absolute?: string; default?: string; template?: string };
    expect(title.absolute).toBe("PharmaBoost — Le copilote IA du comptoir de votre pharmacie");
    expect(title.default).toBeUndefined();
    expect(title.template).toBe("%s · PharmaBoost");
    expect(whyMetadata.title).toEqual({ absolute: "Pourquoi PharmaBoost" });
  });

  it("le partage reprend le premier écran de l'accueil, en grande image légère", () => {
    // Fondateur, 25 oct. 2026 : l'aperçu WhatsApp montrait encore « Scan. Conseil. Bilan. » et l'ancienne bannière.
    expect(siteMetadata.openGraph).toMatchObject({ title: "PharmaBoost — Le copilote IA du comptoir de votre pharmacie." });
    expect(siteMetadata.openGraph?.description).toContain("À chaque boîte scannée");
    expect(JSON.stringify(siteMetadata)).not.toContain("Scan. Conseil. Bilan.");
    // L'image vient du fichier opengraph-image.jpg, plus d'un logo carré déclaré à la main.
    expect(JSON.stringify(siteMetadata)).not.toContain("logo-1200");
    expect(siteMetadata.twitter).toMatchObject({ card: "summary_large_image" });
    const dir = join(process.cwd(), "src/app/(public)/decouvrir");
    const jpeg = readFileSync(join(dir, "opengraph-image.jpg"));
    // Un JPEG de 1200 × 630 (marqueur SOF0 : hauteur puis largeur), sous les ~300 Ko au-delà desquels WhatsApp n'affiche rien.
    expect(jpeg.subarray(0, 2).toString("hex")).toBe("ffd8");
    const sof = jpeg.indexOf(Buffer.from([0xff, 0xc0]));
    expect([jpeg.readUInt16BE(sof + 5), jpeg.readUInt16BE(sof + 7)]).toEqual([630, 1200]);
    expect(jpeg.length).toBeLessThan(250_000);
    expect(readFileSync(join(dir, "opengraph-image.alt.txt"), "utf8")).toBe("PharmaBoost — Le copilote IA du comptoir de votre pharmacie.");
  });

  it("la racine a son adresse publique et ne parle plus de fiche patient", () => {
    // Lu dans le fichier : la racine charge une police Google que les tests ne savent pas compiler.
    const root = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(root).toContain('metadataBase: new URL("https://pharmaboost.app")');
    expect(root).not.toContain("fiche patient");
    expect(JSON.stringify(siteMetadata)).not.toContain("fiche patient");
  });
});

describe("les mots du site suivent le code, sans promesse", () => {
  it("ne promet aucune vitesse : la bannière montre le conseil dans la foulée du scan, l'animation est une reproduction", () => {
    expect(homeText).not.toContain("aussitôt");
    // La phrase d'introduction est retirée (fondateur, 30 oct. 2026 : « beaucoup trop d'infos ») : la bannière parle d'elle-même.
    expect(homeText).not.toContain("La bannière PharmaBoost vous montre");
    expect(homeText).not.toContain("fidèle");
    expect(homeText).toContain("La bannière PharmaBoost, reproduite pour le site : au scan, puis ouverte.");
    expect(homeText).toContain("Médicaments, produits et prix : exemples.");
  });

  it("départage dans l'ordre : les laboratoires préférés, puis la date courte, puis le challenge (phrase retirée de l'accueil par le fondateur le 21 oct. 2026)", () => {
    expect(homeText).not.toContain("la date courte d'abord");
    // Le moteur, lui : trois références cliniquement équivalentes, chacune n'ayant qu'un seul atout.
    const item = (productId: string, pharmacistPreference = 0): ScoredRecommendation =>
      ({
        productId,
        opportunityKey: "test",
        totalScore: 0.8,
        precautions: [],
        vigilances: [],
        breakdown: { relevance: 1, safety: 1, availability: 1, patientFit: 1, pharmacistPreference, validationHistory: 0, commercial: 0 },
      }) as unknown as ScoredRecommendation;
    const context: TiebreakContext = {
      formulaRank: () => 0,
      rangeRank: (candidate) => (candidate.productId === "gamme" ? 1 : null),
      shortDate: (candidate) => (candidate.productId === "date" ? { expiresOn: "2026-11-30", daysLeft: 51, level: "SOON" } : null),
      hasChallenge: (candidate) => candidate.productId === "challenge",
    };
    const [gamme, date, challenge, preference] = [item("gamme"), item("date"), item("challenge"), item("preference", 1)];
    expect(chooseAmongEquivalents([challenge, date, preference], context)).toMatchObject({ chosen: { productId: "preference" }, criterion: "PREFERENCE_OFFICINE" });
    expect(chooseAmongEquivalents([challenge, date, gamme], context)).toMatchObject({ chosen: { productId: "gamme" }, criterion: "GAMME_PRIVILEGIEE" });
    expect(chooseAmongEquivalents([challenge, date], context)).toMatchObject({ chosen: { productId: "date" }, criterion: "DATE_COURTE" });
  });

  it("dit d'où viennent les règles, sans laisser croire qu'elles ont été relues", () => {
    const sources = "à partir de documents de pharmaciens et des sources officielles (RCP, HAS, ANSES)";
    expect(homeText).toContain(`Les produits viennent de règles écrites ${sources}`);
    const lower = homeText.toLowerCase();
    for (const forbidden of ["relues par", "relue par", "validées par", "vérifiées par"]) expect(lower).not.toContain(forbidden);
    // Toutes les règles attendent encore la relecture du pharmacien signataire : le site ne peut pas dire le contraire.
    expect(ADVICE_RULES.every((rule) => rule.validation.status === "PENDING")).toBe(true);
  });

  it("décrit l'installation simplement : ni durée, ni « sans alerte », ni postes qui « se mettent à jour tout seuls »", () => {
    expect(homeText).toContain("Un fichier à télécharger par poste de comptoir, un double-clic. Les mises à jour arrivent ensuite automatiquement, jamais pendant une vente. La mise en service est faite avec vous.");
    expect(homeText).not.toContain("tout seuls");
    expect(homeText.toLowerCase()).not.toContain("sans alerte");
  });

  it("n'a plus la rubrique « Comment ça marche »", () => {
    expect(home).not.toContain('id="fonctionnement"');
    expect(homeText).not.toContain("Comment ça marche");
  });

  it("parle de la quantité en stock, jamais d'un « stock exact » (le stock vient du dernier envoi)", () => {
    expect(homeText.toLowerCase()).not.toContain("stock exact");
    expect(homeText).toContain("En stock, avec la quantité");
  });

  it("tient la typographie française : ni « ? » ni « : » seuls en début de ligne sur un petit téléphone", () => {
    expect(home).toContain("PharmaBoost\u00a0?</dt>");
    expect(why).toContain("«\u00a0Avec DOXYCYCLINE 100 mg");
  });

  it("n'affiche plus l'exemple Laboratoire A / B ni la bande des pastilles (fondateur, 22 oct. 2026)", () => {
    expect(homeText).not.toContain("Au comptoir, sur la bannière");
    expect(homeText).not.toContain("Proposé en premier");
  });
});

describe("la page « Pourquoi » : ce que propose la bannière, la phrase de l'écran de vente", () => {
  it("garde le texte du fondateur, accordé au film « Le Cercle » (25 oct. 2026)", () => {
    expect(whyText).toContain("Même rue. Deux pharmacies. Une seule où les patients reviennent.");
    expect(whyText).toContain("C'est un cercle.");
    expect(whyText).not.toContain("Voir en vidéo");
  });

  it("la bannière « propose » ; la phrase vient de la règle de la doxycycline, remplie comme le fait le moteur", () => {
    expect(whyText).toContain("Au scan, la bannière propose :");
    expect(whyText).not.toContain("la bannière affiche");
    const rule = ADVICE_RULES.find((candidate) => candidate.key === "skin-doxycycline-photoprotection");
    expect(rule?.atcPrefixes).toContain("J01AA02");
    const script = rule!.counterScriptTemplate.replaceAll("{drug}", "DOXYCYCLINE 100 mg").replaceAll("{product}", "Crème solaire SPF 50+");
    expect(script).not.toMatch(/\{(drug|product)\}/);
    expect(whyText).toContain(`Sur l'écran de vente, la phrase à dire : ${script}`);
    // L'ancienne phrase, tapée à la main, s'écartait de la règle (elle ne disait pas que la crème complète l'éviction du soleil).
    expect(whyText).not.toContain("cette crème protège les zones découvertes");
  });
});

describe("le simulateur : plus de barres de comparaison (fondateur, 20 oct. 2026)", () => {
  it("n'emploie pas dl/dt/dd, et ne montre plus la barre « Abonnement »", () => {
    const html = renderToStaticMarkup(createElement(RevenueCalculator, { monthlyPriceCents: 12_600 }));
    expect(html).not.toMatch(/<d[ltd][\s>]/);
    const shown = visible(html);
    expect(shown).toContain("Chiffre d'affaires supplémentaire estimé");
    expect(shown).not.toContain("Abonnement 126 €");
  });
});

describe("l'en-tête sur un petit téléphone", () => {
  it("l'appel garde son nom entier « Réserver une démo », même réduit à « Démo » sous 390 px (l’en-tête débordait de 10 px à 390 px, de 7 px à 360 px)", () => {
    const header = renderToStaticMarkup(createElement(SiteHeader));
    const cta = header.match(/<a[^>]*href="\/decouvrir\/demo"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "";
    expect(visible(cta).trim()).toBe("Réserver une démo");
    expect(cta).toContain("max-[389px]:sr-only");
  });
});

describe("chaque page se partage avec son propre titre, et garde l'image du site", () => {
  it("« Pourquoi » et « Réserver une démo » ont leur titre, leur phrase, leur adresse de référence", () => {
    for (const [metadata, path, title] of [
      [whyMetadata, "/decouvrir/pourquoi", "Pourquoi PharmaBoost"],
      [demoMetadata, "/decouvrir/demo", "Réserver une démo de PharmaBoost"],
    ] as const) {
      expect(metadata.alternates?.canonical).toBe(path);
      expect(metadata.openGraph).toMatchObject({ title, url: path, siteName: "PharmaBoost", locale: "fr_FR", type: "website" });
      expect(metadata.openGraph?.description).toBe(metadata.description);
      // Déclarer openGraph dans la page effaçait l'image du layout : elle est reprise des métadonnées parentes.
      expect(metadata.openGraph?.images).toEqual([SHARE_IMAGE]);
      expect(metadata.twitter).toMatchObject({ card: "summary_large_image", title });
      expect(JSON.stringify(metadata)).not.toContain("Scan. Conseil. Bilan.");
    }
    expect(whyMetadata.description).toContain("Et si chaque délivrance révélait tout son potentiel de conseil ?");
  });

  it("l'accueil a son adresse de référence ; le layout n'en impose aucune aux autres pages", () => {
    expect(homeMetadata.alternates?.canonical).toBe("/decouvrir");
    expect(siteMetadata.alternates).toBeUndefined();
  });
});

describe("les durées affichées des films", () => {
  it("suivent les films refaits : Comment ça marche 44 s, Avantages 38 s, Présentation « Rembobinons » 1 min 09", () => {
    expect(FILMS.comment.duration).toBe("44 s");
    expect(FILMS.avantages.duration).toBe("38 s");
    expect(FILMS.presentation.duration).toBe("1 min 09");
    // L'ancienne présentation, gardée ailleurs sur l'accueil : 50,2 s.
    expect(FILMS.enBref.duration).toBe("50 s");
    expect(FILMS.pourquoi.duration).toBe("34 s");
    expect(FILMS.sansOrdonnance.duration).toBe("25 s");
    // Partenaires : 2 640 images à 60 i/s.
    expect(FILMS.partenaires.duration).toBe("44 s");
  });
});
