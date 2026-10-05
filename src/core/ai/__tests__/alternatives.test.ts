import { describe, expect, it } from "vitest";
import { MAX_ALTERNATIVES_PER_ADVICE } from "@/config/constants";
import type { PipelineInput } from "../pipeline";
import type { AnalysisResult, CatalogProduct, ScoredRecommendation } from "../types";
import { officialFacts, patient, product } from "./fixtures";
import { AMOXICILLINE, ROXITHROMYCINE, SCENARIOS, SPIRONOLACTONE, analyse, nasalShelf, probioticShelf } from "./scenarios-conseils";

/**
 * Les autres références montrées sous chaque conseil.
 *
 * Une garantie domine toutes les autres : les alternatives SUIVENT le choix du
 * conseil, elles ne l'orientent jamais. Les conseils principaux — produits,
 * scores, ordre, nombre, départage — sont ceux que le moteur retenait avant
 * qu'il ne garde les alternatives ; le premier bloc l'établit sur des
 * ordonnances types, à partir de valeurs relevées sur le moteur d'avant.
 */

const principalsOf = (result: AnalysisResult) =>
  result.recommendations.map(
    (r) => `${r.opportunityKey} | ${r.productId} | ${r.totalScore} | ${r.tiebreak ?? "-"} | ${r.companion?.productId ?? "-"}`,
  );

const alternativeIds = (recommendation: ScoredRecommendation | undefined) => (recommendation?.alternatives ?? []).map((a) => a.productId);
const conseil = (result: AnalysisResult, opportunityKey: string) => result.recommendations.find((r) => r.opportunityKey === opportunityKey);
const everyProductId = (result: AnalysisResult) => result.recommendations.flatMap((r) => [r.productId, ...alternativeIds(r)]);
const scenario = (name: string) => {
  const found = SCENARIOS.find((s) => s.name === name);
  if (!found) throw new Error(`Scénario inconnu : ${name}`);
  return found.run();
};

/** Valeurs relevées sur le moteur AVANT l'ajout des alternatives : « conseil | produit | score | départage | produit associé ». */
const PRINCIPAUX_AVANT: Record<string, string[]> = {
  "orl-antibiotique-rayon-complet": [
    "digestive-tolerance-antibiotics | probio-a | 0.8895 | COMMERCIAL | -",
    "nasal-hygiene-orl | nasal-hyper | 0.8905 | - | -",
    "sore-throat-orl | gorge-a | 0.8255 | - | -",
    "fever-thermometer | thermo-b | 0.8895 | DISPONIBILITE | -",
  ],
  "antibiotique-seul-references-equivalentes": [
    "digestive-tolerance-antibiotics | probio-a | 0.8895 | COMMERCIAL | -",
  ],
  "antibiotique-preference-officine-produit": [
    "digestive-tolerance-antibiotics | probio-b | 0.9232 | PREFERENCE_OFFICINE | -",
  ],
  "antibiotique-marque-et-exclusion": [
    "digestive-tolerance-antibiotics | probio-b | 0.9112 | - | -",
  ],
  "antibiotique-historique-de-validation": [
    "digestive-tolerance-antibiotics | probio-b | 0.8992 | HISTORIQUE | -",
  ],
  "antibiotique-date-courte": [
    "digestive-tolerance-antibiotics | probio-b | 0.8832 | DATE_COURTE | -",
  ],
  "antibiotique-patient-allergique": [
    "digestive-tolerance-antibiotics | probio-a | 0.8995 | COMMERCIAL | -",
  ],
  "antibiotique-contre-indication-declaree": [
    "digestive-tolerance-antibiotics | probio-b | 0.8832 | - | -",
  ],
  "serum-flacon-principal-d-un-besoin-candidat-d-un-autre": [
    "nasal-hygiene-orl | nasal-flacon | 0.8772 | - | nasal-seringue",
    "eye-irritation-allergy | eyes-a | 0.8975 | - | -",
  ],
  "nasal-flacon-avec-seringue-associee": [
    "nasal-hygiene-orl | nasal-flacon | 0.8772 | - | nasal-seringue",
    "eye-irritation-allergy | nasal-flacon | 0.7892 | - | -",
  ],
  "ibuprofene-protection-gastrique": [
    "gastric-protection-nsaid | gastric-a | 0.8895 | - | -",
  ],
  "allergie-collyres": [
    "nasal-hygiene-orl | nasal-hyper | 0.8905 | - | -",
    "eye-irritation-allergy | eyes-a | 0.8975 | - | -",
  ],
  "dermatologie-emollients": [
    "hydration-dermato-topical | emol-a | 0.8895 | - | -",
  ],
  "levothyroxine-ipp-magnesium": [
    "magnesium-ppi-longterm | mag-a | 0.8801 | COMMERCIAL | -",
  ],
  "spironolactone-potassium-ecarte": [],
  "isotretinoine-routine": [
    "isotretinoin-skin-routine:cleanse | l1 | 0.9273 | - | -",
    "isotretinoin-skin-routine:hydrate | l2 | 0.9273 | - | -",
    "isotretinoin-skin-routine:protect | l3 | 0.9273 | - | -",
    "lip-care-isotretinoin | lip | 0.9273 | - | -",
  ],
  "isotretinoine-gamme-eucerin": [
    "isotretinoin-skin-routine:cleanse | e1 | 0.9153 | - | -",
    "isotretinoin-skin-routine:hydrate | e2 | 0.9553 | - | -",
    "isotretinoin-skin-routine:protect | e3 | 0.9553 | - | -",
    "lip-care-isotretinoin | lip | 0.9273 | - | -",
  ],
  "isotretinoine-gamme-la-roche-posay": [
    "isotretinoin-skin-routine:cleanse | l1 | 0.9553 | - | -",
    "isotretinoin-skin-routine:hydrate | l2 | 0.9553 | - | -",
    "isotretinoin-skin-routine:protect | l3 | 0.9553 | - | -",
    "lip-care-isotretinoin | lip | 0.9553 | PREFERENCE_OFFICINE | -",
  ],
  "isotretinoine-etape-sans-reference": [
    "isotretinoin-skin-routine:cleanse | l1 | 0.9273 | - | -",
    "isotretinoin-skin-routine:hydrate | l2 | 0.9273 | - | -",
    "lip-care-isotretinoin | lip | 0.9273 | - | -",
  ],
  "ordonnance-chargee-limite-par-defaut": [
    "digestive-tolerance-antibiotics | probio-a | 0.8895 | COMMERCIAL | -",
    "hydration-dermato-topical | emol-a | 0.8895 | - | -",
    "gastric-protection-nsaid | gastric-a | 0.8895 | - | -",
    "nasal-hygiene-orl | nasal-hyper | 0.8905 | - | -",
    "eye-irritation-allergy | eyes-a | 0.8975 | - | -",
  ],
  "ordonnance-chargee-limite-deux": [
    "digestive-tolerance-antibiotics | probio-a | 0.8895 | COMMERCIAL | -",
    "gastric-protection-nsaid | gastric-a | 0.8895 | - | -",
  ],
  "deux-antibiotiques-meme-besoin": [
    "digestive-tolerance-antibiotics | probio-a | 0.8895 | COMMERCIAL | -",
  ],
  "rayon-en-rupture-partielle": [
    "digestive-tolerance-antibiotics | probio-b | 0.8832 | - | -",
  ],
};

describe("les conseils principaux n'ont pas bougé", () => {
  it("les scénarios rejoués sont exactement ceux dont on a relevé le résultat", () => {
    expect(SCENARIOS.map((s) => s.name).sort()).toEqual(Object.keys(PRINCIPAUX_AVANT).sort());
  });

  for (const { name, run } of SCENARIOS) {
    it(`${name} : mêmes produits, mêmes scores, même ordre, même nombre`, () => {
      expect(principalsOf(run())).toEqual(PRINCIPAUX_AVANT[name]);
    });
  }
});

describe("les alternatives : bornes et ordre", () => {
  it("jamais plus de trois par conseil, les mieux classées d'abord", () => {
    // Cinq références en rayon pour la tolérance digestive : une retenue, quatre candidates, trois montrées.
    const result = analyse([AMOXICILLINE], probioticShelf());
    const retained = conseil(result, "digestive-tolerance-antibiotics");
    expect(retained?.alternatives).toHaveLength(MAX_ALTERNATIVES_PER_ADVICE);
    const scores = (retained?.alternatives ?? []).map((a) => a.totalScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    // La quatrième candidate, moins bien classée que les trois montrées, n'y est pas.
    expect(alternativeIds(retained)).toEqual(["probio-b", "probio-c", "probio-d"]);
    expect(everyProductId(result)).not.toContain("probio-e");
  });

  it("autant qu'il y en a quand le rayon n'en contient que deux, aucune quand il n'y a qu'une référence", () => {
    const two = analyse([AMOXICILLINE], probioticShelf().slice(0, 2));
    expect(alternativeIds(conseil(two, "digestive-tolerance-antibiotics"))).toHaveLength(1);

    const one = analyse([AMOXICILLINE], probioticShelf().slice(0, 1));
    const retained = conseil(one, "digestive-tolerance-antibiotics");
    expect(retained?.productId).toBe("probio-a");
    expect(retained?.alternatives).toBeUndefined();
  });

  it("à score égal, l'ordre alphabétique des noms tranche — quel que soit l'ordre du catalogue", () => {
    const twin = (id: string, name: string) => product({ id, name, category: "PROBIOTIQUES", matchingTags: ["probiotique", "flore intestinale", "tolérance digestive"], commercialClaims: [], stockQuantity: 12 });
    const catalog = [twin("t1", "Zeta flore"), twin("t2", "Alpha flore"), twin("t3", "Mu flore"), twin("t4", "Beta flore")];
    for (const ordered of [catalog, [...catalog].reverse()]) {
      const retained = conseil(analyse([AMOXICILLINE], ordered), "digestive-tolerance-antibiotics");
      const names = (retained?.alternatives ?? []).map((a) => ordered.find((p) => p.id === a.productId)?.name ?? "");
      expect(names).toHaveLength(3);
      expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "fr")));
    }
  });

  it("le même catalogue, dans un autre ordre, donne les mêmes alternatives", () => {
    const shelf = [...probioticShelf(), ...nasalShelf()];
    const forward = analyse([AMOXICILLINE], shelf);
    const backward = analyse([AMOXICILLINE], [...shelf].reverse());
    for (const retained of forward.recommendations) {
      expect(alternativeIds(conseil(backward, retained.opportunityKey))).toEqual(alternativeIds(retained));
    }
  });

  it("deux analyses identiques produisent des résultats identiques", () => {
    for (const { run } of SCENARIOS) expect(run().recommendations).toEqual(run().recommendations);
  });
});

describe("les alternatives : jamais le conseil lui-même, jamais un autre conseil", () => {
  it("l'alternative n'est jamais la référence retenue pour le même conseil", () => {
    for (const { run } of SCENARIOS) {
      for (const retained of run().recommendations) {
        expect(alternativeIds(retained)).not.toContain(retained.productId);
      }
    }
  });

  it("ni une référence retenue comme conseil principal d'un autre besoin", () => {
    // Même ordonnance, même rayon : le sérum physiologique est une candidate
    // du besoin « yeux irrités » tant qu'il n'est le conseil principal de nulle part…
    const free = scenario("allergie-collyres");
    expect(alternativeIds(conseil(free, "eye-irritation-allergy"))).toContain("nasal-flacon");

    // … et n'y figure plus dès qu'il est retenu pour l'hygiène nasale.
    const retainedElsewhere = scenario("serum-flacon-principal-d-un-besoin-candidat-d-un-autre");
    expect(conseil(retainedElsewhere, "nasal-hygiene-orl")?.productId).toBe("nasal-flacon");
    expect(alternativeIds(conseil(retainedElsewhere, "eye-irritation-allergy"))).not.toContain("nasal-flacon");
  });

  it("jamais une référence retenue dans une routine, à une autre étape ou ailleurs", () => {
    const result = scenario("isotretinoine-routine");
    const retained = new Set(result.recommendations.map((r) => r.productId));
    for (const item of result.recommendations) {
      for (const id of alternativeIds(item)) expect(retained.has(id)).toBe(false);
    }
  });

  it("une alternative de routine reste une référence de la même étape : la routine ne change pas", () => {
    const result = scenario("isotretinoine-routine");
    const cleanse = conseil(result, "isotretinoin-skin-routine:cleanse");
    expect(cleanse?.routine?.stepKey).toBe("cleanse");
    expect(alternativeIds(cleanse)).toEqual(expect.arrayContaining(["a1", "e1"]));
    for (const alternative of cleanse?.alternatives ?? []) expect(alternative).not.toHaveProperty("routine");
  });
});

/**
 * Ce qui écarte une référence en amont l'écarte aussi des alternatives. Pour
 * chaque cause : le même produit, SANS son défaut, est bien candidat — la
 * mesure sait donc voir ce qu'elle cherche — et AVEC son défaut il n'apparaît
 * nulle part, sans rien changer à ce qui est retenu ni proposé en alternative.
 */
describe("les alternatives : rien de ce que la sécurité ou le stock écarte n'y revient", () => {
  const SHELF = probioticShelf().slice(0, 2);
  const TAGS = ["probiotique", "flore intestinale", "tolérance digestive"];
  const candidate = (overrides: Partial<CatalogProduct> = {}) =>
    product({ id: "x", name: "Probiotique à l'essai", category: "PROBIOTIQUES", matchingTags: TAGS, commercialClaims: [], stockQuantity: 12, ...overrides });

  const CAUSES: {
    cause: string;
    defect: Partial<CatalogProduct>;
    treatments?: Parameters<typeof analyse>[0];
    options?: Partial<PipelineInput>;
  }[] = [
    { cause: "une allergie déclarée du patient", defect: { matchingTags: [...TAGS, "lactose"] }, options: { patient: patient({ allergies: ["lactose"] }) } },
    { cause: "une contre-indication saisie sur la fiche produit (grossesse)", defect: { contraindications: ["grossesse"] }, options: { patient: patient({ isPregnant: true }) } },
    {
      cause: "une contre-indication déclarée par la pharmacie (grossesse)",
      defect: { vigilances: [{ population: "PREGNANCY", level: "CONTRAINDICATION", note: null }] },
      options: { patient: patient({ isPregnant: true }) },
    },
    { cause: "une vigilance qui écarte une étiquette (potassium sous spironolactone)", defect: { matchingTags: [...TAGS, "potassium"] }, treatments: [AMOXICILLINE, SPIRONOLACTONE] },
    { cause: "un médicament soumis à prescription", defect: { origin: "NATIONAL_DRUG", presentationId: "pres-1", prescriptionConditions: ["liste I"] } },
    {
      cause: "une substance déjà présente sur l'ordonnance",
      defect: { substances: ["AMOXICILLINE"] },
      options: { official: new Map([["amoxicilline 1 g", officialFacts({ substances: ["AMOXICILLINE"] })]]) },
    },
    { cause: "une référence exclue par l'officine", defect: {}, options: { rules: [{ id: "r", type: "EXCLUDE_PRODUCT", productId: "x", category: null, context: {}, weight: 1 }] } },
    { cause: "une exclusion écrite dans la règle de conseil (immunodépression)", defect: { matchingTags: [...TAGS, "immunodépression"] } },
    { cause: "une référence hors stock", defect: { stockQuantity: 0 } },
    { cause: "une référence inactive", defect: { isActive: false } },
    { cause: "une pertinence sous le seuil", defect: { name: "Produit du même rayon", matchingTags: [] } },
  ];

  const need = "digestive-tolerance-antibiotics";

  for (const { cause, defect, treatments = [AMOXICILLINE], options = {} } of CAUSES) {
    it(`écartée par ${cause} : n'apparaît ni en conseil ni en alternative`, () => {
      // Le témoin : sans le défaut (et sans la règle d'exclusion), la référence est candidate.
      const healthy = analyse(treatments, [...SHELF, candidate()], { ...options, rules: [] });
      expect(everyProductId(healthy)).toContain("x");

      const without = analyse(treatments, SHELF, options);
      const flawed = analyse(treatments, [...SHELF, candidate(defect)], options);
      expect(everyProductId(flawed)).not.toContain("x");
      // Et sa présence dans le rayon ne change rien : ni le conseil retenu, ni les alternatives.
      expect(conseil(flawed, need)).toEqual(conseil(without, need));
      expect(principalsOf(flawed)).toEqual(principalsOf(without));
    });
  }

  it("une référence en rupture d'une officine sœur n'est pas davantage proposée", () => {
    const sibling = candidate({ stockQuantity: 0, availableInSiblingPharmacy: true });
    expect(everyProductId(analyse([AMOXICILLINE], [...SHELF, sibling]))).not.toContain("x");
  });

  it("préférence, marque, historique et marge répartissent les mêmes références entre conseil et alternatives, sans en ajouter ni en retirer", () => {
    // Quatre références admises : le conseil et ses trois alternatives. Ce que
    // l'officine préfère ou gagne peut changer LAQUELLE est retenue (le départage
    // entre équivalentes), jamais l'ensemble des références montrées.
    const pool = probioticShelf().filter((item) => ["probio-a", "probio-b", "probio-c", "probio-d"].includes(item.id));
    const shown = (result: AnalysisResult) => {
      const retained = conseil(result, need);
      return [retained?.productId, ...alternativeIds(retained)].sort();
    };
    expect(shown(analyse([AMOXICILLINE], pool))).toEqual(["probio-a", "probio-b", "probio-c", "probio-d"]);

    const variants: Partial<PipelineInput>[] = [
      { rules: [{ id: "r1", type: "PREFER_BRAND", productId: null, category: null, brand: "Vitalys", context: {}, weight: 1 }] },
      { rules: [{ id: "r2", type: "PREFER_PRODUCT", productId: "probio-d", category: null, context: {}, weight: 1 }] },
      { history: { "probio-b": { proposed: 10, accepted: 10, purchased: 10 } } },
    ];
    for (const variant of variants) expect(shown(analyse([AMOXICILLINE], pool, variant))).toEqual(["probio-a", "probio-b", "probio-c", "probio-d"]);
    for (const purchasePriceCents of [100, 1450]) {
      const shelf = pool.map((item) => ({ ...item, purchasePriceCents }));
      expect(shown(analyse([AMOXICILLINE], shelf))).toEqual(["probio-a", "probio-b", "probio-c", "probio-d"]);
    }
  });
});

describe("les alternatives : de quoi être mises à la place du conseil", () => {
  const retained = () => conseil(analyse([ROXITHROMYCINE], probioticShelf()), "digestive-tolerance-antibiotics");

  it("portent leur score, leur détail, leurs textes écrits pour elles et leurs précautions", () => {
    const [alternative] = retained()?.alternatives ?? [];
    expect(alternative.productId).toBe("probio-b");
    expect(alternative.totalScore).toBeGreaterThan(0.5);
    expect(Object.keys(alternative.breakdown).sort()).toEqual(["availability", "commercial", "patientFit", "pharmacistPreference", "relevance", "safety", "validationHistory"]);
    expect(alternative.explanation.length).toBeGreaterThan(0);
    // Les phrases nomment la référence alternative, jamais celle qui est retenue.
    expect(alternative.counterScript).toContain("Probiotique Lactobacillus 5 milliards");
    expect(alternative.counterScript).not.toContain("Ferments lactiques 10 souches");
    expect(alternative.patientReason).toContain("Probiotique Lactobacillus 5 milliards");
    expect(alternative.justification).toContain("Probiotique Lactobacillus 5 milliards");
    // La raison courte est celle de la règle, la même pour tout le conseil.
    expect(alternative.shortReason).toBe(retained()?.shortReason);
  });

  it("gardent leurs propres précautions : celles de la fiche et celles qu'une vigilance ajoute", () => {
    const shelf = probioticShelf().filter((item) => ["probio-a", "probio-b", "probio-e"].includes(item.id));
    const withPrecaution = conseil(analyse([ROXITHROMYCINE], shelf), "digestive-tolerance-antibiotics")?.alternatives?.find((a) => a.productId === "probio-e");
    expect(withPrecaution?.precautions).toContain("À conserver au frais.");
    // Lévothyroxine : la prise à distance s'écrit en précaution sur CHAQUE référence de magnésium, alternatives comprises.
    const magnesium = scenario("levothyroxine-ipp-magnesium");
    const retained = conseil(magnesium, "magnesium-ppi-longterm");
    expect(retained?.alternatives?.length).toBeGreaterThan(0);
    for (const item of [retained, ...(retained?.alternatives ?? [])]) expect(item?.precautions.join(" ")).toMatch(/Lévothyroxine sur l'ordonnance/);
  });

  it("gardent leurs vigilances patient et leur date courte", () => {
    const shelf = probioticShelf().map((item) =>
      item.id === "probio-b"
        ? {
            ...item,
            vigilances: [{ population: "PREGNANCY", level: "CAUTION" as const, note: "Avis du pharmacien avant de proposer." }],
            shortDate: { expiresOn: "2026-11-20", daysLeft: 40, level: "SOON" as const },
          }
        : item,
    );
    const result = conseil(analyse([ROXITHROMYCINE], shelf, { patient: patient({ isPregnant: true }) }), "digestive-tolerance-antibiotics");
    // Le départage retient la date courte : la référence à vigilance est ici le conseil, les autres sont ses alternatives.
    const all = [result, ...(result?.alternatives ?? [])];
    const flagged = all.find((item) => item?.productId === "probio-b");
    expect(flagged?.vigilances?.[0]).toMatchObject({ population: "PREGNANCY", level: "CAUTION", status: true });
    expect(flagged?.shortDate).toMatchObject({ level: "SOON", daysLeft: 40 });
    const plain = (result?.alternatives ?? []).find((a) => a.productId !== "probio-b");
    expect(plain?.vigilances ?? []).toEqual([]);
  });

  it("portent leur propre produit associé : le flacon appelle une seringue, le spray non", () => {
    const result = scenario("orl-antibiotique-rayon-complet");
    const nasal = conseil(result, "nasal-hygiene-orl");
    expect(nasal?.productId).toBe("nasal-hyper");
    expect(nasal?.companion).toBeUndefined();
    const bySpray = nasal?.alternatives?.find((a) => a.productId === "nasal-spray");
    const byBottle = nasal?.alternatives?.find((a) => a.productId === "nasal-flacon");
    expect(bySpray?.companion).toBeUndefined();
    expect(byBottle?.companion).toMatchObject({ productId: "nasal-seringue", label: "Seringue ou dispositif de lavage nasal" });
  });

  it("n'ajoutent aucune note de produit associé à la trace : seul le conseil retenu en parle", () => {
    const notes = scenario("orl-antibiotique-rayon-complet").trace.find((s) => s.stage === "COMMERCIAL_OPTIMIZATION")?.notes ?? [];
    expect(notes.filter((n) => n.includes("associé à"))).toEqual([]);
    const flask = scenario("nasal-flacon-avec-seringue-associee").trace.find((s) => s.stage === "COMMERCIAL_OPTIMIZATION")?.notes ?? [];
    expect(flask.filter((n) => n.includes("associé à"))).toHaveLength(1);
  });
});

describe("les alternatives : la trace le dit", () => {
  it("une note par conseil retenu, avec le nombre d'alternatives", () => {
    const result = scenario("orl-antibiotique-rayon-complet");
    const notes = result.trace.find((s) => s.stage === "COMMERCIAL_OPTIMIZATION")?.notes ?? [];
    expect(notes).toContain("« digestive-tolerance-antibiotics » : 3 alternative(s) retenue(s).");
    expect(notes).toContain("« nasal-hygiene-orl » : 2 alternative(s) retenue(s).");
    expect(notes).toContain("« sore-throat-orl » : 0 alternative(s) retenue(s).");
    expect(notes.filter((n) => n.includes("alternative(s) retenue(s)"))).toHaveLength(result.recommendations.length);
  });

  it("l'étape reste la dernière, et son effectif est celui des conseils", () => {
    const result = scenario("orl-antibiotique-rayon-complet");
    const last = result.trace.at(-1);
    expect(last?.stage).toBe("COMMERCIAL_OPTIMIZATION");
    expect(last?.outputCount).toBe(result.recommendations.length);
  });
});

describe("les alternatives : sans conseil, rien de plus qu'avant", () => {
  it("quand le moteur ne retient rien, il n'y a ni conseil ni alternative, et l'issue est la même", () => {
    const result = scenario("spironolactone-potassium-ecarte");
    expect(result.recommendations).toEqual([]);
    expect(result.outcome).toBe("NO_COMPATIBLE_PRODUCT");
    const notes = result.trace.find((s) => s.stage === "COMMERCIAL_OPTIMIZATION")?.notes ?? [];
    expect(notes.filter((n) => n.includes("alternative(s)"))).toEqual([]);
  });
});
