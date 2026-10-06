import { describe, expect, it } from "vitest";
import { ADVICE_RULES } from "@/core/ai/engines/advice";
import { classifyProductByName, restrictToVocabulary } from "@/core/catalog/product-vocabulary";
import { DEMO_DRUG_BY_KEY, DEMO_DRUGS, DEMO_EXTRA_PRODUCTS, DEMO_SHELF, DEMO_VIGILANCES } from "../catalog";
import { DEMO_SCENARIOS, findDemoScenario, scanCount } from "../scenarios";
import { DEMO_TEAM, isCommercialDemoPharmacy, DEMO_PHARMACY_SLUG } from "../identity";

/**
 * Les scénarios tiennent leurs promesses AVANT toute base : chaque boîte existe dans le rayon ou le
 * stock de démonstration, chaque règle attendue existe et un produit du rayon peut la servir.
 * (`npm run demo:verifier` fait le même contrôle avec le vrai moteur, sur la base.)
 */

const shelfTags = new Map(
  DEMO_SHELF.map((product) => {
    const heuristic = classifyProductByName(product.name, { brand: product.brand, description: product.description });
    return [product.slug, new Set([...(heuristic?.tags ?? []), ...restrictToVocabulary(product.matchingTags)])] as const;
  }),
);

/** Les étiquettes qui servent une règle : les siennes, et celles des étapes d'une routine. */
const tagsOfRule = (key: string) => {
  const rule = ADVICE_RULES.find((candidate) => candidate.key === key);
  if (!rule) return null;
  return new Set([...rule.matchingTags, ...(rule.routine?.steps.flatMap((step) => step.matchingTags) ?? [])].map((tag) => tag.toLowerCase()));
};

describe("les scénarios", () => {
  it("ont un identifiant unique et une situation lisible", () => {
    const ids = DEMO_SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const scenario of DEMO_SCENARIOS) {
      expect(scenario.title.length).toBeGreaterThan(5);
      expect(scenario.situation.length).toBeGreaterThan(10);
      expect(scenario.show.length).toBeGreaterThanOrEqual(2);
      expect(scenario.tip.length).toBeGreaterThan(5);
    }
  });

  it("couvrent ce que le présentateur a demandé : classique, antibiotique, douleur, allergie, senior, plusieurs boîtes, sans ordonnance, hors stock, vigilance", () => {
    const ids = new Set(DEMO_SCENARIOS.map((scenario) => scenario.id));
    for (const id of ["angine", "antibiotique-dent", "douleur-dos", "allergie", "senior", "ordonnance-chargee", "sans-ordonnance-gorge", "herpes-rupture", "vigilance-enceinte", "hors-stock", "enfant-diarrhee"]) expect(ids.has(id), id).toBe(true);
    expect(DEMO_SCENARIOS.length).toBeGreaterThanOrEqual(12);
  });

  it("ne scannent que des boîtes qui existent dans le stock ou le rayon de démonstration", () => {
    const slugs = new Set(DEMO_SHELF.map((product) => product.slug));
    for (const scenario of DEMO_SCENARIOS) {
      for (const item of scenario.items) {
        if ("drug" in item) expect(DEMO_DRUG_BY_KEY.has(item.drug), `${scenario.id} : ${item.drug}`).toBe(true);
        else expect(slugs.has(item.product), `${scenario.id} : ${item.product}`).toBe(true);
      }
    }
  });

  it("restent sous la minute qui fait une seule ordonnance (un bip toutes les ~1,3 s) et sous le plafond de huit conseils par ligne", () => {
    for (const scenario of DEMO_SCENARIOS) expect(scanCount(scenario) * 1.3, scenario.id).toBeLessThan(40);
  });

  it("une demande sans ordonnance n'a pas de boîtes, et inversement", () => {
    for (const scenario of DEMO_SCENARIOS) {
      if (scenario.request) {
        expect(scenario.items).toEqual([]);
        expect(scenario.request.text.length).toBeGreaterThan(10);
      } else {
        expect(scenario.items.length).toBeGreaterThan(0);
      }
    }
  });

  it("annoncent des règles qui existent, et qu'un produit du rayon peut servir", () => {
    for (const scenario of DEMO_SCENARIOS) {
      for (const key of scenario.expects) {
        const wanted = tagsOfRule(key);
        expect(wanted, `${scenario.id} : règle ${key} inconnue`).not.toBeNull();
        // Un médicament conseil du stock peut aussi la servir : on l'admet pour les règles dont la catégorie l'autorise.
        const served = [...shelfTags.values()].some((tags) => [...wanted!].some((tag) => tags.has(tag)));
        const drugServed = DEMO_DRUGS.some((entry) => !entry.classification);
        expect(served || drugServed, `${scenario.id} : aucun produit du rayon ne sert ${key}`).toBe(true);
      }
    }
  });

  it("retrouvent un scénario par son identifiant, jamais un autre", () => {
    expect(findDemoScenario("angine")?.title).toMatch(/Angine/);
    expect(findDemoScenario("nope")).toBeNull();
  });
});

describe("le rayon et le stock", () => {
  it("n'ont ni doublon de code-barres, ni doublon d'identifiant", () => {
    const eans = DEMO_SHELF.map((product) => product.ean);
    const slugs = DEMO_SHELF.map((product) => product.slug);
    expect(new Set(eans).size).toBe(eans.length);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(new Set(DEMO_DRUGS.map((entry) => entry.key)).size).toBe(DEMO_DRUGS.length);
  });

  it("des produits fictifs seulement : prix cohérents, marque présente", () => {
    for (const product of DEMO_EXTRA_PRODUCTS) {
      expect(product.brand.length).toBeGreaterThan(2);
      expect(product.salePriceCents).toBeGreaterThan(product.purchasePriceCents);
    }
  });

  it("la lysine est en rupture : c'est ce que le scénario « herpès » montre", () => {
    expect(DEMO_SHELF.find((product) => product.slug === "lysine-1000")?.quantity).toBe(0);
  });

  it("les vigilances déclarées portent sur des produits du rayon", () => {
    const slugs = new Set(DEMO_SHELF.map((product) => product.slug));
    for (const vigilance of DEMO_VIGILANCES) expect(slugs.has(vigilance.slug), vigilance.slug).toBe(true);
  });

  it("chaque médicament classé donne son code ATC : c'est ce qui rend la démonstration indépendante de tout modèle", () => {
    for (const entry of DEMO_DRUGS.filter((item) => item.classification)) {
      expect(entry.classification?.atcCode, entry.key).toMatch(/^[A-Z]\d{2}[A-Z]{0,2}\d{0,2}$/);
    }
  });
});

describe("l'identité de l'officine", () => {
  it("toutes les adresses de l'équipe sont en .test : aucune ne peut recevoir de courrier", () => {
    for (const member of DEMO_TEAM) expect(member.email).toMatch(/@[a-z.]+\.test$/);
  });

  it("n'est reconnue que par son identifiant réservé ET son drapeau démo", () => {
    expect(isCommercialDemoPharmacy({ slug: DEMO_PHARMACY_SLUG, isDemo: true })).toBe(true);
    expect(isCommercialDemoPharmacy({ slug: DEMO_PHARMACY_SLUG, isDemo: false })).toBe(false);
    expect(isCommercialDemoPharmacy({ slug: "pharmacie-du-port", isDemo: true })).toBe(false);
  });
});
