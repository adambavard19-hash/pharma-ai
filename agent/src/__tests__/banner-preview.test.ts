import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BANNER } from "../banner-design";
import { bannerPreviewHtml, demoSales } from "../banner-preview";
import { NOTICE_HOST_CSHARP } from "../notice-host";
import { ADVICE_RULES } from "../../../src/core/ai/engines/advice";
import { evaluateVigilances, vigilanceMessage } from "../../../src/core/ai/engines/vigilance";
import type { DrugKnowledge } from "../../../src/core/ai/types";

/** Un médicament comme la démonstration le donne au moteur : un nom, une substance, un code ATC. */
const drug = (name: string, inn: string, atcCode: string): DrugKnowledge => ({ id: name, name, inn, atcCode, therapeuticClass: null, form: null, commonSideEffects: [], interactionClasses: [], cautionPopulations: [], patientExplanation: null, intakeAdvice: null, sourceName: "test", sourceVersion: "1", isDemoData: true });
/** Une phrase telle qu'elle se lit dans le JSON embarqué par la page. */
const embedded = (text: string) => JSON.stringify(text).slice(1, -1);

describe("l'aperçu de la bannière pour Mac", () => {
  const html = bannerPreviewHtml();

  it("le fichier livré (agent/apercu/banniere.html) est exactement ce que `npm run apercu:banniere` produit", () => {
    const shipped = readFileSync(join(process.cwd(), "agent/apercu/banniere.html"), "utf8");
    expect(shipped === html).toBe(true);
  });

  it("la copie du site public (public/site/banniere-demo.html) est la même page : le robot animé de la page d'accueil est à jour", () => {
    const site = readFileSync(join(process.cwd(), "public/site/banniere-demo.html"), "utf8");
    expect(site === html).toBe(true);
  });

  it("sait s'intégrer au site : fond transparent, scénario qui recommence tout seul, ne joue que lorsqu'elle est à l'écran", () => {
    expect(html).toContain('classList.add("integre")');
    expect(html).toContain("html.integre, html.integre body { background: transparent; }");
    expect(html).toMatch(/if \(EMBED && !REDUCED_MOTION\) step\(\d+/);
    expect(html).toContain('"pb-visible"');
    expect(html).toContain('"pb-hidden"');
  });

  it("est une page autonome : aucune ressource extérieure, aucune image à part", () => {
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|@import|url\(http/);
    expect(html).toContain("<title>Bannière PharmaBoost</title>");
  });

  it("reprend le design de la bannière Windows : mêmes couleurs, mêmes cotes, mêmes durées, mêmes phrases", () => {
    for (const [key, value] of Object.entries(BANNER.colors)) {
      if (key !== "cardAlpha") expect(html, key).toContain(`--${key}: ${value};`);
    }
    expect(html).toContain(JSON.stringify(BANNER.sizes));
    expect(html).toContain(JSON.stringify(BANNER.timing));
    expect(html).toContain(JSON.stringify(BANNER.text));
    for (const phrase of [BANNER.text.idle, BANNER.text.scanTitle, BANNER.text.doneTitle, BANNER.text.challenge, BANNER.text.shortDate, BANNER.text.inStock]) {
      expect(NOTICE_HOST_CSHARP).toContain(phrase);
    }
  });

  it("montre les sept états de la maquette et un scénario complet, et dit honnêtement que ce n'est pas une capture de Windows", () => {
    for (const step of ["En attente", "Scan détecté", "Conseils disponibles", "Conseils ouverts", "Pendant la vente", "Vente terminée", "Une question à poser", "Scénario complet"]) expect(html).toContain(step);
    expect(html).toContain("ce n'est pas une capture de Windows");
  });

  it("aucune mise en garde n'est montrée : la bannière ne pousse que des produits conseils (fondateur, 13 oct. 2026)", () => {
    const fervex = evaluateVigilances([drug("FERVEX ADULTES", "paracétamol, phéniramine, acide ascorbique", "N02BE51")]).find((v) => v.key === "paracetamol-combination-limit");
    expect(fervex?.severity).toBe("WARNING");
    expect(html).not.toContain(embedded(vigilanceMessage(fervex!)));
    // Le simple « bon usage » de l'antibiotique (INFO) ne monte jamais dans la bannière : la démonstration ne le montre pas non plus.
    const info = evaluateVigilances([drug("AMOXICILLINE 1 g", "amoxicilline", "J01CA04")]).find((v) => v.severity === "INFO");
    expect(info).toBeDefined();
    expect(html).not.toContain(embedded(vigilanceMessage(info!)));
    // Dans la liste, l'ordre de PaintList : les mises en garde, puis les questions, puis les conseils.
    expect(html).toContain("alertsHtml() + questionsHtml() + rows");
  });

  it("le scénario du site joue l'arbre de questions : pourquoi (douleur localisée), puis où (dos)", () => {
    expect(html).toContain('tap("why", "PAIN")');
    expect(html).toContain('tap("where", "BACK")');
    expect(html).toContain('decide("pain-pack-back", "SOLD")');
    // L'étape de la question est une étape comme les autres, visible sur le site (plus un outil caché de l'aperçu).
    expect(html).not.toMatch(/tree\.className = "extra"/);
    expect(html).toContain(`["7", "${BANNER.text.questionTitle}"`);
  });

  it("des exemples honnêtes : aucun conseil sans règle derrière, aucune marque de parapharmacie", () => {
    expect(html).not.toContain("VITAMINE C");
    expect(html).not.toMatch(/therapearl/i);
    expect(html).toContain("POCHE CHAUD/FROID DOS");
  });

  it("la carte ne dépasse jamais la place visible : la liste défile, comme MaxCardHeight() sur Windows ; la page dit sa hauteur au site", () => {
    expect(html).toContain("Math.min(need, maxCardHeight())");
    expect(html).not.toContain("Math.min(need, 660)");
    expect(html).toContain('type: "pb-height"');
    expect(html).toContain("html.integre .card { max-width: none; }");
  });

  it("respecte le mouvement réduit du système : sur le site, rien ne part tout seul ni ne boucle, la vente est montrée ouverte", () => {
    expect(html).toContain("@media (prefers-reduced-motion: reduce)");
    expect(html).toContain('window.matchMedia("(prefers-reduced-motion: reduce)").matches');
    // Au chargement : la vente sur ordonnance, ouverte et immobile ; le visiteur lance « Scénario complet » s'il le veut.
    expect(html).toContain('function still() { reset("ordonnance"); setView("expanded"); }');
    expect(html).toContain("if (EMBED && REDUCED_MOTION) still();");
    // L'entrée à l'écran ne lance rien ; la sortie ramène la vente ouverte, pas l'attente.
    expect(html).toContain("if (yes && !running && !userDriven && !REDUCED_MOTION) { running = true; runScenario(); }");
    expect(html).toContain("if (REDUCED_MOTION) still();");
    // Les défilements du scénario ne glissent pas.
    expect(html).toContain('var GLIDE = REDUCED_MOTION ? "auto" : "smooth";');
    expect(html).not.toContain('behavior: "smooth"');
  });
});

describe("les ventes de la démonstration sont celles du moteur", () => {
  const sales = demoSales();
  const html = bannerPreviewHtml();
  const embedded = (text: string) => JSON.stringify(text).slice(1, -1);
  /** La raison d'une règle telle que le moteur l'écrit : son `shortReasonTemplate`, le médicament à la place de `{drug}`. */
  const reason = (key: string, drugLabel: string) => {
    const rule = ADVICE_RULES.find((candidate) => candidate.key === key);
    expect(rule, key).toBeDefined();
    return rule!.shortReasonTemplate.replaceAll("{drug}", drugLabel);
  };

  it("aucune vente n'associe deux antihistaminiques : pas de ZYRTEC (cétirizine) avec le FERVEX (phéniramine)", () => {
    for (const sale of Object.values(sales)) {
      const lines = sale.lgo.map((line) => line[0].toUpperCase()).join(" | ");
      if (lines.includes("FERVEX")) expect(lines).not.toMatch(/ZYRTEC|C[EÉ]TIRIZINE|AERIUS|DESLORATADINE|XYZALL|L[EÉ]VOCETIRIZINE|CLARITYNE|LORATADINE|TELFAST|FEXOFENADINE|POLARAMINE|ACTIFED|HUMEX RHUME|DOLIRHUME PRO/);
    }
    expect(html).not.toMatch(/ZYRTEC/);
  });

  it("l'ordonnance ne montre aucune mise en garde, puis deux conseils que les règles proposent dès le bip, sans question", () => {
    const { ordonnance } = sales;
    expect(ordonnance.alerts).toHaveLength(0);
    expect(ordonnance.tree).toBeNull();
    expect(ordonnance.items.map((item) => item.name)).toEqual(["ULTRA-LEVURE 200 mg 30 gélules", "ANTISEPTIQUE CUTANÉ 100 ml"]);
    expect(ordonnance.items.map((item) => item.drug)).toEqual(["AMOXICILLINE 1 g", "VALACICLOVIR 500 mg"]);
    for (const key of ["digestive-tolerance-antibiotics", "herpes-zona-antiseptic"]) expect(ADVICE_RULES.find((rule) => rule.key === key)?.question, key).toBeUndefined();
    // Les pastilles de la maquette restent toutes à l'écran : Challenge, Date courte, En stock · 12, Stock faible · 3.
    expect(ordonnance.items[0]).toMatchObject({ challenge: true, shortDate: "30/11/26", availability: "IN_STOCK", quantity: "12" });
    expect(ordonnance.items[1]).toMatchObject({ challenge: false, shortDate: "", availability: "LOW_STOCK", quantity: "3" });
  });

  it("la raison de chaque conseil est celle de la règle, rendue par le moteur — jamais tapée à la main", () => {
    // Le moteur nomme la substance publiée par le catalogue national, sans sel ni accent : « AMOXICILLINE », « VALACICLOVIR », « PARACETAMOL ».
    expect(sales.ordonnance.items.map((item) => item.reason)).toEqual([
      reason("digestive-tolerance-antibiotics", "AMOXICILLINE"),
      reason("herpes-zona-antiseptic", "VALACICLOVIR"),
    ]);
    const tree = sales.douleur.tree;
    expect(tree?.drug).toBe("DOLIPRANE 1000 mg");
    expect(Object.keys(tree?.items ?? {}).sort()).toEqual(["fever-thermometer-analgesic", "pain-pack-ankle", "pain-pack-back", "pain-pack-hip", "pain-pack-knee", "pain-pack-neck", "pain-pack-other", "pain-pack-shoulder"]);
    for (const [key, item] of Object.entries(tree?.items ?? {})) {
      expect(item.reason, key).toBe(reason(key, "PARACETAMOL"));
      expect(item.id).toBe(key);
    }
    expect(tree?.items["pain-pack-back"]).toMatchObject({ name: "POCHE CHAUD/FROID DOS", drug: "DOLIPRANE 1000 mg" });
    for (const item of [...sales.ordonnance.items, ...Object.values(tree?.items ?? {})]) expect(html).toContain(embedded(item.reason));
    // Les anciennes raisons écrites à la main ont disparu.
    for (const typed of ["Protéger la flore pendant l'antibiotique", "Chaud ou froid sur le dos", "Suivre la fièvre à la maison"]) expect(html).not.toContain(embedded(typed));
    expect(html).not.toContain("TREE_PRODUCTS");
  });

  it("le DOLIPRANE seul ne montre rien d'autre qu'une question : aucune mise en garde, aucun conseil avant la réponse", () => {
    expect(sales.douleur.alerts).toEqual([]);
    expect(sales.douleur.items).toEqual([]);
  });
});
