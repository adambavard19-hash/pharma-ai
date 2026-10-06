import { describe, expect, it } from "vitest";
import { RECOMMENDATION_MIN_RELEVANCE } from "@/config/constants";
import { classifyProductByName } from "@/core/catalog/product-vocabulary";
import { ADVICE_RULES, detectAdviceOpportunities } from "../engines/advice";
import { findCandidateProducts } from "../engines/matching";
import { scoreProductForOpportunity } from "../engines/scoring";
import { runAnalysisPipeline } from "../pipeline";
import type { CatalogProduct } from "../types";
import { drug, patient, product } from "./fixtures";
import { analyse, detect, names, namesFor, retained, stock } from "./corrections-helpers";

/**
 * Corrections du lot « conseil complet par ordonnance » après relecture : règles et dictionnaire.
 *
 * Chaque test passe par le parcours réel du moteur (voir `corrections-helpers.ts`), avec les vrais
 * noms de produits relevés dans les fichiers de stock. Le score d'une préférence est dans
 * `scoring.test.ts`, l'exclusion des masques oculaires dans `pain-pack-exclusions.test.ts`.
 */

// ---------------------------------------------------------------------------
// m0 — un sac à urine n'est pas un collecteur d'aiguilles
// ---------------------------------------------------------------------------
describe("collecteur d'aiguilles : un collecteur d'urine n'est jamais proposé (m0)", () => {
  const SHARPS_RULE = "self-injection-sharps-container";
  const urine = stock("urine", "MEDISET COLLECTEUR URINE 2L 30 NUIT");
  const collector = stock("dastri", "COLLECTEUR D'AIGUILLES DASTRI 1 L", { category: "DISPOSITIFS_MEDICAUX" });
  const INJECTED: [string, string][] = [
    ["A10AE04", "insuline glargine"],
    ["A10BJ06", "analogue du GLP-1"],
    ["B01AB05", "héparine de bas poids moléculaire"],
  ];

  it("le produit du stock réel est rangé « AUTRE » : même la formule préférée ne le porte plus au seuil", () => {
    expect(urine.category).toBe("AUTRE");
    const opportunity = detect("A10AE04").find((o) => o.key === SHARPS_RULE)!;
    const scored = scoreProductForOpportunity({ product: urine, opportunity, patient: patient(), rules: [], history: {}, blockedProductIds: new Set() });
    // Avant : « collecteur » seul était préféré, le mot de l'étiquette s'appariait au nom : 0,15 + 0,4 + 0,1 = 0,65.
    expect(scored!.breakdown.relevance).toBeLessThan(RECOMMENDATION_MIN_RELEVANCE);
  });

  it.each(INJECTED)("%s (%s) : le collecteur d'urine n'est pas retenu, le collecteur DASTRI l'est", (atc) => {
    expect(retained(SHARPS_RULE, atc, [urine])).toEqual([]);
    expect(names(retained(SHARPS_RULE, atc, [urine, collector]))).toEqual(["COLLECTEUR D'AIGUILLES DASTRI 1 L"]);
  });

  it.each(INJECTED)("%s (%s) : de bout en bout, aucune carte avec le collecteur d'urine, même rangé en dispositif médical", (atc) => {
    const asDevice = { ...urine, category: "DISPOSITIFS_MEDICAUX" as const };
    for (const catalog of [[urine], [asDevice]]) {
      const result = analyse(atc, catalog);
      expect(namesFor(result, SHARPS_RULE, catalog)).toEqual([]);
    }
  });

  it.each(["COLLECTEUR URINE 2L", "COLLECTEUR DE SELLES POUR STOMIE 1 L", "BOCAL COLLECTEUR 2 L", "COLLECTEUR POCHE JAMBE", "COLLECTEUR STERILE"])(
    "« %s » rangé en dispositif médical n'est pas candidat",
    (name) => {
      const asDevice = stock("autre", name, { category: "DISPOSITIFS_MEDICAUX" });
      expect(retained(SHARPS_RULE, "A10AE04", [asDevice])).toEqual([]);
    },
  );

  it.each(["COLLECTEUR D'AIGUILLES DASTRI 1 L", "COLLECTEUR DASRI 0,5L", "MINICOLLECTEUR PIQUANTS COUPANTS", "COLLECTEUR PERFORANTS 1,5 L", "BOITE A AIGUILLES 1,5 L"])(
    "« %s » est bien un collecteur d'aiguilles : retenu",
    (name) => {
      expect(names(retained(SHARPS_RULE, "A10AB05", [stock("c", name, { category: "DISPOSITIFS_MEDICAUX" })]))).toEqual([name]);
    },
  );

  it("la boîte d'aiguilles de stylo n'est toujours pas un collecteur", () => {
    const needles = stock("aiguilles", "AIGUILLES STYLO INSULINE 31G 5 MM BOITE DE 100", { category: "DISPOSITIFS_MEDICAUX" });
    expect(retained(SHARPS_RULE, "A10AB05", [needles])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// m1 / t1 — chambre d'inhalation : ni masque FFP2, ni kit de nébuliseur, et la bonne taille
// ---------------------------------------------------------------------------
describe("chambre d'inhalation : seules de vraies chambres, à la taille du patient (m1, t1)", () => {
  const RULE = "inhaler-spacer-chamber";
  // Les cinq produits que la relecture a vus retenus pour un enfant de 4 ans, sans aucune chambre.
  const NOT_CHAMBERS = [
    "FFP2 BLANCS SACHET DE 5 MASQUES",
    "POCHETTE DOUBLE POUR MASQUES",
    "PP MASQUE VIS BAMBOU",
    "KIT MASQUE ADULTE AEROSOL CIRRUS",
    "THERMCOOL HOT POCHE BILLE MASQUE",
  ].map((name, index) => stock(`masque${index}`, name, { category: "DISPOSITIFS_MEDICAUX" }));
  const baby = stock("nourrisson", "BIOSYNEX CH/INHAL NOURISS 0-");
  const adult = stock("adulte", "INHAL'AIR CH/INHAL +6ANS/ADULTE");
  const child = stock("enfant", "CHAMB INHAL ENFANT MASQUE");

  it("les trois vraies chambres du stock sont reconnues par le dictionnaire (« CH/INHAL », « CHAMB INHAL »)", () => {
    for (const chamber of [baby, adult, child]) {
      expect(chamber.category, chamber.name).toBe("DISPOSITIFS_MEDICAUX");
      expect(chamber.matchingTags, chamber.name).toContain("chambre d'inhalation");
    }
  });

  it("un enfant de 4 ans sans chambre en rayon ne reçoit aucun masque, pochette ni kit de nébuliseur", () => {
    for (const age of [0, 1, 3, 4, 5]) {
      expect(retained(RULE, "R03AC02", NOT_CHAMBERS, { patient: { ageYears: age } }), `${age} ans`).toEqual([]);
    }
    expect(retained(RULE, "R03AC02", NOT_CHAMBERS, { patient: { ageYears: 40 } })).toEqual([]);
    expect(namesFor(analyse("R03AC02", NOT_CHAMBERS, { patient: { ageYears: 4 } }), RULE, NOT_CHAMBERS)).toEqual([]);
  });

  it("les masques ne passent pas devant la vraie chambre : un enfant de 4 ans reçoit « CHAMB INHAL ENFANT MASQUE »", () => {
    const catalog = [...NOT_CHAMBERS, adult, baby, child];
    const kept = retained(RULE, "R03AC02", catalog, { patient: { ageYears: 4 } });
    expect(names(kept)).not.toContain("INHAL'AIR CH/INHAL +6ANS/ADULTE");
    expect(names(kept)).toContain("CHAMB INHAL ENFANT MASQUE");
    expect(names(kept).filter((name) => NOT_CHAMBERS.some((m) => m.name === name))).toEqual([]);
    expect(namesFor(analyse("R03AC02", catalog, { patient: { ageYears: 4 } }), RULE, catalog)[0]).toBe("CHAMB INHAL ENFANT MASQUE");
  });

  it("un adulte reçoit la chambre « adulte » : jamais celle du nourrisson ni la chambre « enfant »", () => {
    const catalog = [...NOT_CHAMBERS, baby, child, adult];
    expect(names(retained(RULE, "R03AC02", catalog, { patient: { ageYears: 40 } }))).toEqual(["INHAL'AIR CH/INHAL +6ANS/ADULTE"]);
    expect(namesFor(analyse("R03AC02", catalog, { patient: { ageYears: 40 } }), RULE, catalog)).toEqual(["INHAL'AIR CH/INHAL +6ANS/ADULTE"]);
  });

  it("un nourrisson reçoit la chambre « nourrisson » en premier", () => {
    const catalog = [...NOT_CHAMBERS, adult, child, baby];
    const result = analyse("R03AC02", catalog, { patient: { ageYears: 0 } });
    expect(namesFor(result, RULE, catalog)[0]).toBe("BIOSYNEX CH/INHAL NOURISS 0-");
    expect(names(retained(RULE, "R03AC02", catalog, { patient: { ageYears: 0 } }))).not.toContain("INHAL'AIR CH/INHAL +6ANS/ADULTE");
  });

  it("gamme Aerochamber : le masque « adulte » n'est jamais retenu pour un bébé de 6 mois ni un enfant de 4 ans", () => {
    const range = ["AEROCHAMBER PLUS MASQUE NOURRISSON", "AEROCHAMBER PLUS MASQUE ENFANT", "AEROCHAMBER PLUS MASQUE ADULTE"].map((name, index) => stock(`aero${index}`, name));
    for (const age of [0.5, 4]) {
      const kept = names(retained(RULE, "R03AC02", range, { patient: { ageYears: age } }));
      expect(kept, `${age} an(s)`).not.toContain("AEROCHAMBER PLUS MASQUE ADULTE");
      expect(kept.length, `${age} an(s)`).toBeGreaterThan(0);
    }
    const forBaby = names(retained(RULE, "R03AC02", range, { patient: { ageYears: 0.5 } }));
    expect(forBaby[0]).toBe("AEROCHAMBER PLUS MASQUE NOURRISSON");
    const forChild = names(retained(RULE, "R03AC02", range, { patient: { ageYears: 4 } }));
    expect(forChild[0]).toBe("AEROCHAMBER PLUS MASQUE ENFANT");
    // À 40 ans, seule la chambre à embout ou « adulte ».
    expect(names(retained(RULE, "R03AC02", range, { patient: { ageYears: 40 } }))).toEqual(["AEROCHAMBER PLUS MASQUE ADULTE"]);
  });

  it("une chambre « enfant/adulte » sert l'enfant comme l'adulte", () => {
    const both = stock("deux", "CHAMBRE D'INHALATION ENFANT/ADULTE");
    expect(names(retained(RULE, "R03AC02", [both], { patient: { ageYears: 4 } }))).toEqual(["CHAMBRE D'INHALATION ENFANT/ADULTE"]);
    expect(names(retained(RULE, "R03AC02", [both], { patient: { ageYears: 40 } }))).toEqual(["CHAMBRE D'INHALATION ENFANT/ADULTE"]);
  });
});

// ---------------------------------------------------------------------------
// m4 — peigne à poux : un coffret lotion + peigne n'est pas un peigne
// ---------------------------------------------------------------------------
describe("peigne à poux : les coffrets « lotion + peigne » des fichiers de stock sont écartés (m4)", () => {
  const RULE = "head-lice-comb";
  const KITS = [
    "PARANIX Sol antipoux Hle ess Spr/100ml+peigne +peigne anti-poux",
    "PARANIX LOT ANTIPOUX 100ML + PEIGNE",
    "POUXIT XF LOT 100ML+PEIGNE",
    "APAISYL XPERT LOT+PEIGNE POUX",
  ];
  /** Rangés comme l'ancien dictionnaire le faisait : en peigne anti-poux, catégorie dispositif médical. */
  const wronglyTagged = (name: string, index: number) => product({ id: `kit${index}`, name, brand: null, category: "DISPOSITIFS_MEDICAUX", subCategory: null, matchingTags: ["peigne anti-poux"], commercialClaims: [], description: null, stockQuantity: 5 });
  const comb = stock("zapx", "ZAP'X PEIGNE A/LENTE", { category: "DISPOSITIFS_MEDICAUX" });

  it.each(KITS)("« %s » n'est pas candidat, même tagué à tort « peigne anti-poux »", (name) => {
    const opportunity = detect("P03AC04").find((o) => o.key === RULE)!;
    expect(findCandidateProducts({ opportunity, catalog: [wronglyTagged(name, 0)] })).toEqual([]);
  });

  // Chaque motif d'exclusion doit tenir seul : les quatre libellés ci-dessus en cumulent plusieurs.
  const ONE_SIGN = [
    ["ANTIPOUX SPR PEIGNE FIN", "une abréviation de forme (Spr)"],
    ["ANTIPOUX HLE ESS PEIGNE FIN", "une abréviation de forme (Hle)"],
    ["ANTIPOUX SOL PEIGNE FIN", "une abréviation de forme (Sol)"],
    ["ANTIPOUX LOT PEIGNE FIN", "un lot (LOT)"],
    ["ANTIPOUX PEIGNE FIN 100ML", "un volume en ml"],
    ["ANTIPOUX PEIGNE FIN 30 G", "un poids en g"],
  ] as const;

  it.each(ONE_SIGN)("« %s » (%s) : écarté par ce seul signe, au parcours réel comme au dictionnaire", (name) => {
    expect(retained(RULE, "P03AC04", [wronglyTagged(name, 0)]), name).toEqual([]);
    expect(classifyProductByName(name)?.tags ?? [], name).not.toContain("peigne anti-poux");
  });

  it("« + peigne » seul écarte le coffret au parcours réel (le dictionnaire, lui, ne voit plus le « + » : il retire la ponctuation)", () => {
    expect(retained(RULE, "P03AC04", [wronglyTagged("ANTIPOUX ESSENTIEL +PEIGNE FIN", 0)])).toEqual([]);
    expect(retained(RULE, "P03AC04", [wronglyTagged("PEIGNE+ ANTIPOUX ESSENTIEL", 1)])).toEqual([]);
  });

  it("un peigne sans forme galénique ni volume dans son nom reste proposé, au parcours réel comme au dictionnaire", () => {
    const real = "PEIGNE ANTI-POUX INOX 1 PIECE";
    expect(names(retained(RULE, "P03AC04", [stock("p", real)]))).toEqual([real]);
    expect(classifyProductByName(real)?.tags).toContain("peigne anti-poux");
  });

  it("avec le peigne en rupture, aucun coffret ne le remplace : rien n'est proposé", () => {
    const catalog = [...KITS.map(wronglyTagged), { ...comb, stockQuantity: 0 }];
    expect(retained(RULE, "P03AC04", catalog)).toEqual([]);
    expect(namesFor(analyse("P03AC04", catalog), RULE, catalog)).toEqual([]);
  });

  it("avec le peigne en rayon, il est seul retenu", () => {
    const catalog = [...KITS.map(wronglyTagged), comb];
    expect(names(retained(RULE, "P03AC04", catalog))).toEqual(["ZAP'X PEIGNE A/LENTE"]);
    expect(namesFor(analyse("P03AC04", catalog), RULE, catalog)).toEqual(["ZAP'X PEIGNE A/LENTE"]);
  });

  it.each(KITS)("le dictionnaire ne range plus « %s » en peigne anti-poux", (name) => {
    expect(classifyProductByName(name)?.tags ?? []).not.toContain("peigne anti-poux");
  });

  it("les vrais peignes restent reconnus", () => {
    for (const name of ["PEIGNE ANTI-POUX INOX", "Peigne à poux et à lentes métal", "PEIGNE ANTIPOUX ET LENTES"]) expect(classifyProductByName(name)?.tags, name).toContain("peigne anti-poux");
  });
});

// ---------------------------------------------------------------------------
// m6 — calcium sous corticoïde : le calcium + vitamine D3, jamais un digestif ni un injectable
// ---------------------------------------------------------------------------
describe("calcium sous corticoïde : le produit visé est proposé, pas un produit sans rapport (m6)", () => {
  const RULE = "corticosteroid-oral-calcium";
  const WANTED = ["Calcium 500 + Vitamine D3", "CACIT VITAMINE D3 500 mg/440 UI", "CALCIUM VITAMINE D3 ARROW 500/400", "OROCAL D3 500 mg/200 UI comprimé"];
  const UNRELATED = [
    "CITRATE BETAINE/CALCIUM UPSA DOS10",
    "FLUORURE DE CALCIUM CRINEX 0,25 mg",
    "CHLORURE DE CALCIUM 10 % solution injectable",
    "GLUCONATE DE CALCIUM 10 % perfusion",
    "FOLINATE DE CALCIUM 50 mg injectable",
  ];

  it.each(WANTED)("« %s » est retenu pour une prednisolone (H02AB06), après la question", (name) => {
    const kept = retained(RULE, "H02AB06", [stock("x", name)]);
    expect(names(kept)).toEqual([name]);
    expect(kept[0].relevance).toBeGreaterThanOrEqual(RECOMMENDATION_MIN_RELEVANCE);
    const opportunity = detect("H02AB06").find((o) => o.key === RULE)!;
    expect(opportunity.requiresConfirmation).toBe(true);
  });

  it.each(UNRELATED)("« %s » n'est jamais proposé, rangé en minéraux ou non", (name) => {
    expect(retained(RULE, "H02AB06", [stock("x", name)]), name).toEqual([]);
    expect(retained(RULE, "H02AB06", [stock("y", name, { category: "MINERAUX", matchingTags: ["calcium"] })]), `${name} (étiqueté calcium)`).toEqual([]);
  });

  it("une vitamine D seule n'est pas un calcium : elle reste à la règle de la vitamine D", () => {
    expect(retained(RULE, "H02AB06", [stock("uvedose", "UVEDOSE 100 000 UI solution buvable")])).toEqual([]);
  });

  it("de bout en bout, dans un rayon mêlé, seul un vrai calcium est proposé", () => {
    const catalog = [...UNRELATED, "UVEDOSE 100 000 UI solution buvable", "CALCIUM VITAMINE D3 ARROW 500/400"].map((name, index) => stock(`p${index}`, name));
    expect(namesFor(analyse("H02AB06", catalog, { substance: "PREDNISOLONE" }), RULE, catalog)).toEqual(["CALCIUM VITAMINE D3 ARROW 500/400"]);
  });

  it("le dictionnaire n'étiquette plus « calcium » le digestif, le fluorure ni les injectables", () => {
    for (const name of UNRELATED) expect(classifyProductByName(name)?.tags ?? [], name).not.toContain("calcium");
    for (const name of ["OROCAL 500 mg comprimé à croquer", "CALCIUM 500 MG 60 COMPRIMES", "CACIT VITAMINE D3 500 mg/440 UI"]) expect(classifyProductByName(name)?.tags, name).toContain("calcium");
  });
});

// ---------------------------------------------------------------------------
// m7 — sucre rapide : les associations qui contiennent un sulfamide ou un glinide
// ---------------------------------------------------------------------------
describe("sucre rapide : associations à un sulfamide ou glinide (m7)", () => {
  const RULE = "hypoglycemia-fast-sugar";
  const keys = (atc: string) => detect(atc).map((o) => o.key);

  it.each([
    ["A10BD02", "metformine + sulfamide (GLUCOVANCE)"],
    ["A10BD04", "glimépiride + rosiglitazone"],
    ["A10BD06", "glimépiride + pioglitazone"],
    ["A10BX03", "natéglinide"],
    ["A10BX02", "répaglinide"],
  ])("%s (%s) déclenche le conseil", (atc) => {
    expect(keys(atc)).toContain(RULE);
  });

  it.each([
    ["A10BA02", "metformine seule"],
    ["A10BD03", "metformine + rosiglitazone"],
    ["A10BD05", "metformine + pioglitazone"],
    ["A10BD07", "metformine + sitagliptine"],
    ["A10BD08", "metformine + vildagliptine"],
    ["A10BX04", "autre antidiabétique"],
  ])("%s (%s) ne déclenche rien", (atc) => {
    expect(keys(atc)).not.toContain(RULE);
  });

  it("GLUCOVANCE : le glucose en comprimés est proposé, après la question", () => {
    const sugar = stock("dextro", "DEXTRO ENERGY CLASSIC 14 COMPRIMES");
    const result = analyse("A10BD02", [sugar], { substance: "GLUCOVANCE" });
    expect(namesFor(result, RULE, [sugar])).toEqual(["DEXTRO ENERGY CLASSIC 14 COMPRIMES"]);
    expect(result.opportunities.find((o) => o.key === RULE)?.requiresConfirmation).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// t2 — fer : plus de doublon avec le transit d'un opioïde
// ---------------------------------------------------------------------------
describe("fer : la règle ne se déclenche plus sur le besoin « constipation » (t2)", () => {
  const IRON = "iron-absorption-support";
  const forlax = stock("forlax", "FORLAX 10 g sachets macrogol");
  const constipation = { key: "CONSTIPATION" as const, lineIndexes: [0], justification: "Opioïde : constipation attendue.", confidence: 0.9 };

  it("la règle n'attend plus aucun besoin : seul le fer (B03A) la déclenche", () => {
    expect(ADVICE_RULES.find((r) => r.key === IRON)!.needTriggers).toBeUndefined();
  });

  it.each([["N02AX02", "tramadol"], ["N02AA59", "codéine"], ["A03AX13", "antispasmodique"]])("%s (%s) : le besoin « constipation » ne déclenche pas la règle du fer", (atc) => {
    const withNeed = detectAdviceOpportunities({
      drugs: [{ lineIndex: 0, drugName: "X", knowledge: drug({ name: "X", inn: "X", atcCode: atc, therapeuticClass: null, commonSideEffects: [] }) }],
      patient: patient(),
      needs: [constipation],
    });
    expect(withNeed.map((o) => o.key)).not.toContain(IRON);
  });

  it("tramadol : une seule carte avec FORLAX, celle du transit sous opioïde, sans texte « fer »", () => {
    const result = analyse("N02AX02", [forlax], { substance: "TRAMADOL" });
    const cards = result.recommendations.filter((r) => r.productId === "forlax");
    expect(cards.map((r) => r.opportunityKey)).toEqual(["opioid-transit"]);
    expect(result.recommendations.some((r) => /fer\b|martial/i.test(`${r.shortReason} ${r.patientReason}`))).toBe(false);
  });

  it("le fer (B03A) déclenche toujours sa règle", () => {
    expect(detect("B03AA07").map((o) => o.key)).toContain(IRON);
    expect(namesFor(analyse("B03AA07", [forlax], { substance: "FER" }), IRON, [forlax])).toEqual(["FORLAX 10 g sachets macrogol"]);
  });
});

// ---------------------------------------------------------------------------
// t5 — routine isotrétinoïne : « Nettoyer » n'est jamais un écran solaire
// ---------------------------------------------------------------------------
describe("routine isotrétinoïne : l'étape « Nettoyer » ne prend jamais un écran solaire (t5)", () => {
  const sun = stock("anthelios", "ANTHELIOS UVMUNE 400 SPF50+ fluide visage");
  const sun2 = stock("avene", "AVENE solaire SPF 50+ crème visage");
  const cleanser = stock("nettoyant", "AVENE TOLERANCE GEL NETTOYANT VISAGE SANS SAVON");
  const step = (result: ReturnType<typeof analyse>, key: string, catalog: CatalogProduct[]) =>
    result.recommendations.filter((r) => r.opportunityKey === `isotretinoin-skin-routine:${key}`).map((r) => catalog.find((p) => p.id === r.productId)!.name);

  it("sans nettoyant en rayon, l'étape « Nettoyer » reste vide et « Protéger » prend l'écran solaire", () => {
    const catalog = [sun];
    const result = analyse("D10BA01", catalog, { substance: "ISOTRETINOINE" });
    expect(step(result, "cleanse", catalog)).toEqual([]);
    expect(step(result, "protect", catalog)).toEqual(["ANTHELIOS UVMUNE 400 SPF50+ fluide visage"]);
  });

  it("sans nettoyant ni émollient, le même solaire ne sert pas deux étapes", () => {
    const catalog = [sun2];
    const result = analyse("D10BA01", catalog, { substance: "ISOTRETINOINE" });
    expect(step(result, "cleanse", catalog)).toEqual([]);
    expect(step(result, "hydrate", catalog)).toEqual([]);
    expect(step(result, "protect", catalog)).toEqual(["AVENE solaire SPF 50+ crème visage"]);
  });

  it("avec un nettoyant, l'étape « Nettoyer » prend le nettoyant, jamais le solaire", () => {
    const catalog = [sun, sun2, cleanser];
    const result = analyse("D10BA01", catalog, { substance: "ISOTRETINOINE" });
    expect(step(result, "cleanse", catalog)).toEqual(["AVENE TOLERANCE GEL NETTOYANT VISAGE SANS SAVON"]);
  });

  it("un produit étiqueté « nettoyant » à tort mais dont le nom est solaire reste écarté de l'étape", () => {
    const wrong = stock("faux", "ANTHELIOS UVMUNE 400 SPF50+ fluide visage apaisant", { matchingTags: ["nettoyant", "visage", "protection solaire", "spf"] });
    const result = analyse("D10BA01", [wrong], { substance: "ISOTRETINOINE" });
    expect(step(result, "cleanse", [wrong])).toEqual([]);
  });

  it("l'étape ne cherche plus que « nettoyant »", () => {
    const rule = ADVICE_RULES.find((r) => r.key === "isotretinoin-skin-routine")!;
    expect(rule.routine!.steps.find((s) => s.key === "cleanse")!.matchingTags).toEqual(["nettoyant"]);
  });
});

// ---------------------------------------------------------------------------
// t6 — la durée de l'ordonnance atteint les règles qui supposent un traitement long
// ---------------------------------------------------------------------------
describe("durée de l'ordonnance : une cure courte de corticoïde n'ouvre ni calcium ni vitamine D (t6)", () => {
  const CALCIUM = "corticosteroid-oral-calcium";
  const VITAMIN_D = "vitamin-d-elderly";
  const keys = (atc: string, durationDays?: number | null) => detect(atc, durationDays === undefined ? {} : { durationDays }).map((o) => o.key);

  it("Solupred (H02AB06) 5 jours : aucun conseil calcium, aucune vitamine D", () => {
    expect(keys("H02AB06", 5)).not.toContain(CALCIUM);
    expect(keys("H02AB06", 5)).not.toContain(VITAMIN_D);
  });

  it("durée inconnue : la question du calcium reste, et la vitamine D aussi", () => {
    for (const durationDays of [undefined, null, 0, Number.NaN, -3]) {
      const found = detect("H02AB06", durationDays === undefined ? {} : { durationDays });
      expect(found.map((o) => o.key), String(durationDays)).toEqual(expect.arrayContaining([CALCIUM, VITAMIN_D]));
      expect(found.find((o) => o.key === CALCIUM)!.requiresConfirmation).toBe(true);
    }
  });

  it("la frontière est à 90 jours : 89 écarte, 90 et plus gardent", () => {
    expect(keys("H02AB06", 89)).not.toContain(CALCIUM);
    expect(keys("H02AB06", 90)).toContain(CALCIUM);
    expect(keys("H02AB06", 180)).toEqual(expect.arrayContaining([CALCIUM, VITAMIN_D]));
  });

  it("la durée d'une boîte de biphosphonate (M05B) ou de parathormone (H05) n'écarte jamais la vitamine D", () => {
    expect(keys("M05BA04", 28)).toContain(VITAMIN_D);
    expect(keys("M05BX04", 30)).toContain(VITAMIN_D);
    expect(keys("H05AA02", 28)).toContain(VITAMIN_D);
  });

  it("corticoïde de 5 jours + biphosphonate de 28 jours : la vitamine D reste, déclenchée par le seul biphosphonate", () => {
    const found = detectAdviceOpportunities({
      drugs: [
        { lineIndex: 0, drugName: "SOLUPRED", knowledge: drug({ name: "SOLUPRED", inn: "PREDNISOLONE", atcCode: "H02AB06", therapeuticClass: null, commonSideEffects: [] }), durationDays: 5 },
        { lineIndex: 1, drugName: "FOSAMAX", knowledge: drug({ name: "FOSAMAX", inn: "ALENDRONATE", atcCode: "M05BA04", therapeuticClass: null, commonSideEffects: [] }), durationDays: 28 },
      ],
      patient: patient(),
      needs: [],
    });
    const vitaminD = found.find((o) => o.key === VITAMIN_D)!;
    expect(vitaminD.triggeredBy.map((t) => t.drugName)).toEqual(["FOSAMAX"]);
    expect(found.map((o) => o.key)).not.toContain(CALCIUM);
  });

  it("la règle est une durée connue, pas une durée devinée : un corticoïde inhalé reste hors sujet, quelle que soit la durée", () => {
    expect(keys("R03BA01", 400)).not.toContain(CALCIUM);
    expect(keys("R03BA01", 400)).not.toContain(VITAMIN_D);
  });

  it("de bout en bout : Solupred 5 jours donne 0 calcium et 0 vitamine D, durée inconnue ou 120 jours gardent la question", () => {
    const calcium = stock("calcium", "OROCAL D3 500 mg/200 UI comprimé");
    const vitD = stock("uvedose", "UVEDOSE 100 000 UI solution buvable");
    const catalog = [calcium, vitD];
    const short = analyse("H02AB06", catalog, { substance: "SOLUPRED", durationDays: 5 });
    expect(short.opportunities.map((o) => o.key)).not.toContain(CALCIUM);
    expect(short.opportunities.map((o) => o.key)).not.toContain(VITAMIN_D);
    expect(short.recommendations.map((r) => r.opportunityKey)).not.toEqual(expect.arrayContaining([CALCIUM]));
    expect(short.recommendations.map((r) => r.opportunityKey)).not.toContain(VITAMIN_D);

    for (const durationDays of [null, 120]) {
      const long = analyse("H02AB06", catalog, { substance: "SOLUPRED", durationDays });
      expect(long.opportunities.find((o) => o.key === CALCIUM)?.requiresConfirmation, String(durationDays)).toBe(true);
      expect(namesFor(long, CALCIUM, catalog), String(durationDays)).toEqual(["OROCAL D3 500 mg/200 UI comprimé"]);
      expect(namesFor(long, VITAMIN_D, catalog), String(durationDays)).toEqual(["UVEDOSE 100 000 UI solution buvable"]);
    }
  });
});

// ---------------------------------------------------------------------------
// t7 — enfants : pas de multivitaminé adulte, pas de pastilles avant 6 ans
// ---------------------------------------------------------------------------
describe("enfants : ce que les règles jugent inadapté n'est pas proposé (t7)", () => {
  it("convalescence : avant 12 ans, la règle est bloquée (formule pédiatrique, avis du pharmacien), pas de multivitaminé adulte", () => {
    const opportunity = detect("J01CA04", { patient: { ageYears: 4 } }).find((o) => o.key === "convalescence-immunity-vitamins")!;
    expect(opportunity.isBlocked).toBe(true);
    expect(opportunity.blockReason).toMatch(/pédiatrique/i);

    const supradyn = stock("supradyn", "SUPRADYN VITALITE comprimés effervescents");
    for (const age of [0, 4, 11]) {
      const result = analyse("J01CA04", [supradyn], { substance: "AMOXICILLINE", patient: { ageYears: age } });
      expect(result.recommendations.map((r) => r.opportunityKey), `${age} ans`).not.toContain("convalescence-immunity-vitamins");
    }
  });

  it("convalescence : à 12 ans et plus, ou âge inconnu, le multivitaminé reste proposé", () => {
    const supradyn = stock("supradyn", "SUPRADYN VITALITE comprimés effervescents");
    for (const age of [12, 40, null]) {
      const opportunity = detect("J01CA04", { patient: { ageYears: age } }).find((o) => o.key === "convalescence-immunity-vitamins")!;
      expect(opportunity.isBlocked, String(age)).toBe(false);
      expect(namesFor(analyse("J01CA04", [supradyn], { patient: { ageYears: age } }), "convalescence-immunity-vitamins", [supradyn]), String(age)).toEqual(["SUPRADYN VITALITE comprimés effervescents"]);
    }
  });

  describe("gorge : pastilles, gommes et comprimés à sucer exclus avant 6 ans", () => {
    const RULE = "sore-throat-orl";
    const pastilles = stock("strepsils", "STREPSILS miel citron pastilles");
    const gommes = stock("gommes", "GOMMES GORGE PROPOLIS");
    const spray = stock("spray", "HEXASPRAY gorge spray 30 ml");
    const throat = (age: number | null) =>
      detectAdviceOpportunities({
        drugs: [{ lineIndex: 0, drugName: "X", knowledge: drug({ name: "X", inn: "X", atcCode: "J01CA04", therapeuticClass: null, commonSideEffects: [] }) }],
        patient: patient({ ageYears: age }),
        needs: [{ key: "SORE_THROAT", lineIndexes: [0], justification: "Contexte ORL.", confidence: 0.8 }],
      }).find((o) => o.key === RULE)!;
    const kept = (age: number | null, catalog: CatalogProduct[]) =>
      findCandidateProducts({ opportunity: throat(age), catalog }).map((c) => c.product.name);

    it("à 4 ans, ni les pastilles ni les gommes ; le spray reste possible", () => {
      expect(kept(4, [pastilles, gommes, spray])).toEqual(["HEXASPRAY gorge spray 30 ml"]);
      expect(kept(4, [pastilles, gommes])).toEqual([]);
    });

    it("à 6 ans et plus, ou âge inconnu, les pastilles restent proposées", () => {
      for (const age of [6, 12, 40, null]) expect(kept(age, [pastilles, spray]), String(age)).toContain("STREPSILS miel citron pastilles");
    });

    it("de bout en bout, un enfant de 4 ans ne reçoit pas la pastille, un adulte la reçoit", () => {
      const catalog = [pastilles, gommes];
      const analyseThroat = (ageYears: number) =>
        runAnalysisPipeline({
          lines: [{ lineIndex: 0, drugName: "AMOXICILLINE", posology: null, durationDays: null, confirmed: true }],
          knowledge: new Map([["amoxicilline", drug()]]),
          patient: patient({ ageYears }),
          catalog,
          rules: [],
          history: {},
          explanations: [],
          extractionFindings: [],
          usedSimulatedProviders: false,
          understanding: {
            drugs: [],
            context: { summary: "Contexte ORL infectieux probable.", confidence: 0.8, groups: ["infectieux"] },
            needs: [{ key: "SORE_THROAT", lineIndexes: [0], justification: "Contexte ORL.", confidence: 0.8 }],
            providerId: "test:model",
            model: "model",
            warnings: [],
            usage: null,
            cachedCount: 0,
          },
        });
      expect(namesFor(analyseThroat(4), RULE, catalog)).toEqual([]);
      expect(namesFor(analyseThroat(40), RULE, catalog)).toEqual(["STREPSILS miel citron pastilles"]);
    });
  });
});
