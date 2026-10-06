import { describe, expect, it } from "vitest";
import { MAX_RECOMMENDATIONS_PER_PRESCRIPTION } from "@/config/constants";
import { adviceFamilyOf, type AdviceFamily } from "../family";
import type { AnalysisResult, CatalogProduct } from "../types";
import { product } from "./fixtures";
import { analyse, probioticShelf, nasalShelf } from "./scenarios-conseils";

/**
 * Le conseil complet, de bout en bout : une ordonnance de plusieurs médicaments,
 * un rayon où chaque famille (médicament conseil, complément alimentaire,
 * parapharmacie) a ses références, et la limite de huit conseils.
 *
 * Ce que les tests tiennent : sous le plafond, rien ne change ; au-delà, chaque
 * famille présente garde une place, sans jamais déplacer un conseil de sécurité
 * ni le seul conseil d'une famille, sans rien inventer, dans l'ordre de la
 * priorité clinique — et le choix du produit retenu ne dépend jamais de la limite.
 */

type Treatment = { name: string; atc: string; klass: string };
const treatment = (name: string, atc: string, klass: string): Treatment => ({ name, atc, klass });

const AMOXICILLINE = treatment("Amoxicilline 1 g", "J01CA04", "Antibiotique pénicilline");
const IBUPROFENE = treatment("Ibuprofene 400", "M01AE01", "Anti-inflammatoire non stéroïdien");
const CORTICOIDE_CREME = treatment("Corticoïde crème", "D07AC01", "Corticoïde topique");
const TRAMADOL = treatment("Tramadol 50", "N02AX02", "Antalgique opioïde");
const ESOMEPRAZOLE = treatment("Esomeprazole 20", "A02BC05", "Inhibiteur de la pompe à protons");
const ANTIHISTAMINIQUE = treatment("Antihistaminique H1", "R06AX29", "Antihistaminique H1");
const ANTITUSSIF = treatment("Antitussif sirop", "R05DA09", "Antitussif opioïde");
const VALACICLOVIR = treatment("Valaciclovir", "J05AB11", "Antiviral");
const SPIRONOLACTONE = treatment("Spironolactone 25", "C03DA01", "Diurétique épargneur de potassium");

/** Dix médicaments : bien plus de besoins que de places. */
const ORDONNANCE_CHARGEE = [AMOXICILLINE, IBUPROFENE, CORTICOIDE_CREME, TRAMADOL, ESOMEPRAZOLE, ANTIHISTAMINIQUE, ANTITUSSIF, VALACICLOVIR, SPIRONOLACTONE];

const stocked = (id: string, name: string, category: CatalogProduct["category"], tags: string[], overrides: Partial<CatalogProduct> = {}) =>
  product({ id, name, category, subCategory: null, matchingTags: tags, commercialClaims: [], stockQuantity: 6, ...overrides });

/**
 * Un rayon complet. Les pastilles pour la gorge sont, quand `gorgeEstUnMedicament`,
 * une présentation du catalogue national : la seule référence de la famille
 * « médicament conseil », sur un besoin de faible priorité.
 */
function shelf(options: { gorgeEstUnMedicament: boolean }): CatalogProduct[] {
  return [
    ...probioticShelf(),
    ...nasalShelf(),
    stocked("vit-c", "Vitamine C", "VITAMINES", ["vitamine", "immunité", "convalescence", "fatigue"]),
    stocked("mag", "Magnésium B6", "MAGNESIUM", ["magnésium", "fatigue", "crampes"]),
    stocked("gastric", "Gel gastrique", "SOINS", ["confort gastrique", "estomac", "digestion"]),
    stocked("pack", "Poche chaud froid", "DISPOSITIFS_MEDICAUX", ["chaud", "froid", "poche"]),
    stocked("emol", "Crème émolliente", "DERMOCOSMETIQUE", ["hydratation", "peau sensible", "émollient"]),
    stocked("sun", "Écran solaire SPF50", "DERMOCOSMETIQUE", ["protection solaire", "spf", "photoprotection"]),
    stocked("transit", "Fibres transit", "NUTRITION", ["transit", "constipation", "fibres"]),
    stocked("gorge", "Pastilles gorge", "SOINS", ["gorge", "irritée", "pastilles"], options.gorgeEstUnMedicament ? { origin: "NATIONAL_DRUG", presentationId: "pres-gorge" } : {}),
    stocked("thermo", "Thermomètre", "DISPOSITIFS_MEDICAUX", ["thermomètre", "fièvre", "mesure"]),
    stocked("intime", "Gel intime", "HYGIENE", ["intime", "hygiène", "toilette"]),
    stocked("lysine", "Lysine", "NUTRITION", ["lysine", "herpès"]),
    stocked("herpes", "Patch herpès", "SOINS", ["herpès", "patch", "bouton de fièvre"]),
  ];
}

const withMedicament = shelf({ gorgeEstUnMedicament: true });
const withoutMedicament = shelf({ gorgeEstUnMedicament: false });

const familyOf = (catalog: CatalogProduct[], productId: string): AdviceFamily => {
  const found = catalog.find((p) => p.id === productId);
  if (!found) throw new Error(`Produit inconnu : ${productId}`);
  return adviceFamilyOf(found);
};
const families = (result: AnalysisResult, catalog: CatalogProduct[]) => new Set(result.recommendations.map((r) => familyOf(catalog, r.productId)));
const keys = (result: AnalysisResult) => result.recommendations.map((r) => r.opportunityKey);
const traceNotes = (result: AnalysisResult) => result.trace.find((stage) => stage.stage === "COMMERCIAL_OPTIMIZATION")?.notes ?? [];
const priorityOf = (result: AnalysisResult, key: string) => result.opportunities.find((o) => o.key === key)?.priority ?? -1;

/** Tout ce que le moteur propose, sans limite : la référence de comparaison. */
const unlimited = (treatments: Treatment[], catalog: CatalogProduct[]) => analyse(treatments, catalog, { maxRecommendations: 1000 });

describe("le plafond est de huit conseils", () => {
  it("la constante vaut huit", () => {
    expect(MAX_RECOMMENDATIONS_PER_PRESCRIPTION).toBe(8);
  });

  it("une ordonnance chargée en donne huit, pas cinq, et la trace dit combien ont été laissés", () => {
    const full = unlimited(ORDONNANCE_CHARGEE, withMedicament);
    expect(full.recommendations.length).toBeGreaterThan(8);

    const result = analyse(ORDONNANCE_CHARGEE, withMedicament);
    expect(result.recommendations).toHaveLength(8);
    expect(traceNotes(result)).toContain(`${full.recommendations.length - 8} proposition(s) non affichée(s) : limite de 8 conseils par ordonnance.`);
  });
});

describe("sous le plafond, rien ne change", () => {
  it("une ordonnance de deux médicaments donne les mêmes conseils, dans le même ordre, avec ou sans limite", () => {
    const small = [AMOXICILLINE, IBUPROFENE];
    const limited = analyse(small, withMedicament);
    const free = unlimited(small, withMedicament);
    expect(limited.recommendations.length).toBeLessThan(8);
    expect(limited.recommendations).toEqual(free.recommendations);
    expect(traceNotes(limited).some((note) => note.includes("gardé malgré la limite"))).toBe(false);
    expect(traceNotes(limited).some((note) => note.includes("non affichée"))).toBe(false);
  });

  it("la note de trace décrit le mélange des familles, sans écrire celles qui n'y sont pas", () => {
    const result = analyse([AMOXICILLINE], probioticShelf());
    expect(result.recommendations).toHaveLength(1);
    expect(traceNotes(result)).toContain("Conseil complet : 1 complément alimentaire.");
  });

  it("au singulier, un produit de parapharmacie s'écrit « 1 produit de parapharmacie », comme au pluriel", () => {
    const result = analyse([CORTICOIDE_CREME], [stocked("emol", "Crème émolliente", "DERMOCOSMETIQUE", ["hydratation", "peau sensible", "émollient"])]);
    expect(result.recommendations.map((r) => r.productId)).toEqual(["emol"]);
    expect(traceNotes(result)).toContain("Conseil complet : 1 produit de parapharmacie.");
    expect(traceNotes(result).some((note) => /\b1 parapharmacie\b/.test(note))).toBe(false);
  });

  it("un médicament conseil seul : « 1 médicament conseil »", () => {
    const medicament = probioticShelf().map((p) => ({ ...p, origin: "NATIONAL_DRUG" as const, presentationId: `pres-${p.id}` }));
    const result = analyse([AMOXICILLINE], medicament);
    expect(result.recommendations).toHaveLength(1);
    expect(traceNotes(result)).toContain("Conseil complet : 1 médicament conseil.");
  });
});

describe("une même référence n'est conseillée qu'une fois par ordonnance", () => {
  const SERTRALINE = treatment("Sertraline 50", "N06AB06", "Antidépresseur ISRS");
  const mag2 = stocked("mag2", "MAG 2 magnésium marin 100 comprimés", "MAGNESIUM", ["magnésium", "fatigue", "crampes"]);
  const productIds = (result: AnalysisResult) => result.recommendations.map((r) => r.productId);

  it("le magnésium demandé par l'IPP et par l'antidépresseur : un seul MAG 2, une seule carte, une seule place", () => {
    const result = analyse([ESOMEPRAZOLE, SERTRALINE], [mag2]);
    // Les deux règles voulaient ce produit : sans déduplication, deux cartes pour le même flacon.
    expect(result.opportunities.filter((o) => ["magnesium-ppi-longterm", "magnesium-fatigue"].includes(o.key))).toHaveLength(2);
    expect(productIds(result)).toEqual(["mag2"]);
    // Le besoin le plus prioritaire (IPP au long cours, 64) garde la référence ; l'autre le dit dans la trace.
    expect(keys(result)).toEqual(["magnesium-ppi-longterm"]);
    expect(traceNotes(result)).toContain("« magnesium-fatigue » : référence déjà proposée pour un autre conseil, non répétée.");
    // Un seul produit : le conseil complet ne compte qu'un complément alimentaire, pas deux.
    expect(traceNotes(result)).toContain("Conseil complet : 1 complément alimentaire.");
  });

  it("avec un second magnésium en rayon, chaque besoin garde SA référence : la déduplication n'écarte que le doublon", () => {
    const result = analyse([ESOMEPRAZOLE, SERTRALINE], [mag2, stocked("mag-b", "Magnésium B6 comprimés", "MAGNESIUM", ["magnésium", "fatigue", "crampes"], { stockQuantity: 3 })]);
    const magnesium = result.recommendations.filter((r) => r.opportunityKey.startsWith("magnesium-"));
    expect(magnesium.map((r) => r.opportunityKey)).toEqual(["magnesium-ppi-longterm", "magnesium-fatigue"]);
    expect(new Set(magnesium.map((r) => r.productId)).size).toBe(2);
    expect(traceNotes(result).some((note) => note.includes("non répétée"))).toBe(false);
  });

  it("dans une ordonnance chargée, aucune référence n'apparaît deux fois, à aucune limite", () => {
    for (let limit = 1; limit <= 12; limit += 1) {
      const ids = productIds(analyse(ORDONNANCE_CHARGEE, withMedicament, { maxRecommendations: limit }));
      expect(new Set(ids).size, `limite ${limit}`).toBe(ids.length);
    }
  });

  it("les places libérées par un doublon retourné ne comptent pas comme « non affichées » : la note de limite ne compte que ce que le plafond a coupé", () => {
    const full = unlimited(ORDONNANCE_CHARGEE, withMedicament);
    const dedupNotes = traceNotes(full).filter((note) => note.includes("non répétée"));
    expect(dedupNotes.length).toBeGreaterThan(0); // cette ordonnance contient bien des doublons : le test n'est pas à vide
    const limited = analyse(ORDONNANCE_CHARGEE, withMedicament);
    expect(traceNotes(limited).filter((note) => note.includes("non répétée"))).toEqual(dedupNotes);
    expect(traceNotes(limited)).toContain(`${full.recommendations.length - 8} proposition(s) non affichée(s) : limite de 8 conseils par ordonnance.`);
  });

  it("la même référence dans une routine et ailleurs reste réglée par la routine (inchangé) : ses étapes sont toutes gardées", () => {
    const routineProduct = (id: string, name: string, tags: string[]) => stocked(id, name, "DERMOCOSMETIQUE", tags, { brand: "La Roche-Posay" });
    const shelf = [
      routineProduct("l1", "LA ROCHE-POSAY effaclar gel moussant purifiant", ["nettoyant", "visage"]),
      routineProduct("l2", "LA ROCHE-POSAY toleriane sensitive crème visage", ["hydratation", "peau sensible", "apaisant", "émollient"]),
      routineProduct("l3", "LA ROCHE-POSAY anthelios SPF 50+ fluide visage", ["protection solaire", "spf", "photoprotection"]),
    ];
    const result = analyse([treatment("Isotretinoine 10", "D10BA01", "Rétinoïde oral")], shelf);
    expect(result.recommendations.filter((r) => r.routine?.key === "isotretinoin-skin-routine").map((r) => r.productId)).toEqual(["l1", "l2", "l3"]);
    expect(traceNotes(result).some((note) => note.includes("non répétée") && note.includes("référence déjà proposée"))).toBe(false);
  });
});

describe("le conseil complet de la trace compte une routine pour UN conseil", () => {
  const ISOTRETINOINE = treatment("Isotretinoine 10", "D10BA01", "Rétinoïde oral");
  const derm = (id: string, name: string, tags: string[], overrides: Partial<CatalogProduct> = {}) => stocked(id, name, "DERMOCOSMETIQUE", tags, { brand: "La Roche-Posay", ...overrides });
  const routineShelf = (cleanse: Partial<CatalogProduct> = {}) => [
    derm("l1", "LA ROCHE-POSAY effaclar gel moussant purifiant", ["nettoyant", "visage"], cleanse),
    derm("l2", "LA ROCHE-POSAY toleriane sensitive crème visage", ["hydratation", "peau sensible", "apaisant", "émollient"]),
    derm("l3", "LA ROCHE-POSAY anthelios SPF 50+ fluide visage", ["protection solaire", "spf", "photoprotection"]),
    derm("lip", "CERALIP baume lèvres réparateur", ["lèvres", "baume"]),
  ];
  const mixNote = (result: AnalysisResult) => traceNotes(result).find((note) => note.startsWith("Conseil complet : "));

  it("une routine de trois étapes et un conseil seul : « 2 produits de parapharmacie », pas quatre", () => {
    const result = analyse([ISOTRETINOINE], routineShelf());
    // Quatre cartes à l'écran des étapes : trois étapes et le soin des lèvres…
    expect(result.recommendations).toHaveLength(4);
    expect(result.recommendations.filter((r) => r.routine).map((r) => r.routine?.stepKey)).toEqual(["cleanse", "hydrate", "protect"]);
    // … mais DEUX conseils, comme le plafond et le bandeau de l'écran.
    expect(mixNote(result)).toBe("Conseil complet : 2 produits de parapharmacie.");
  });

  it("une routine seule : « 1 produit de parapharmacie »", () => {
    const result = analyse([ISOTRETINOINE], routineShelf().filter((p) => p.id !== "lip"));
    expect(result.recommendations).toHaveLength(3);
    expect(mixNote(result)).toBe("Conseil complet : 1 produit de parapharmacie.");
  });

  it("la famille d'une routine est celle de sa première étape, comme dans le bandeau", () => {
    // La première étape (nettoyer) est une présentation du catalogue national : la routine compte comme UN médicament conseil.
    const result = analyse([ISOTRETINOINE], routineShelf({ origin: "NATIONAL_DRUG", presentationId: "pres-nettoyant" }));
    expect(result.recommendations).toHaveLength(4);
    expect(mixNote(result)).toBe("Conseil complet : 1 médicament conseil · 1 produit de parapharmacie.");
  });
});

describe("une place est gardée à chaque famille présente", () => {
  it("le médicament conseil, de faible priorité, passe malgré huit conseils mieux classés", () => {
    const full = unlimited(ORDONNANCE_CHARGEE, withMedicament);
    const firstEight = full.recommendations.slice(0, 8);
    expect(firstEight.some((r) => familyOf(withMedicament, r.productId) === "MEDICAMENT")).toBe(false);
    expect(full.recommendations.some((r) => familyOf(withMedicament, r.productId) === "MEDICAMENT")).toBe(true);

    const result = analyse(ORDONNANCE_CHARGEE, withMedicament);
    expect(result.recommendations).toHaveLength(8);
    expect(keys(result)).toContain("sore-throat-orl");
    expect(families(result, withMedicament)).toEqual(new Set(["MEDICAMENT", "COMPLEMENT", "PARAPHARMACIE"]));
    expect(traceNotes(result)).toContain("Un conseil de la famille « Médicament conseil » a été gardé malgré la limite.");
    expect(traceNotes(result).find((note) => note.startsWith("Conseil complet : "))).toMatch(/^Conseil complet : 1 médicament conseil · \d+ compléments? alimentaires? · \d+ produits? de parapharmacie\.$/);
  });

  it("le conseil gardé est celui que le moteur aurait retenu sans limite : même produit, même score", () => {
    const full = unlimited(ORDONNANCE_CHARGEE, withMedicament);
    for (const retained of analyse(ORDONNANCE_CHARGEE, withMedicament).recommendations) {
      const same = full.recommendations.find((r) => r.opportunityKey === retained.opportunityKey);
      expect(same?.productId).toBe(retained.productId);
      expect(same?.totalScore).toBe(retained.totalScore);
    }
  });

  it("le conseil gardé ne vient jamais d'ailleurs que de la liste complète", () => {
    const full = new Set(unlimited(ORDONNANCE_CHARGEE, withMedicament).recommendations.map((r) => `${r.opportunityKey}|${r.productId}`));
    for (const retained of analyse(ORDONNANCE_CHARGEE, withMedicament).recommendations) {
      expect(full.has(`${retained.opportunityKey}|${retained.productId}`)).toBe(true);
    }
  });
});

describe("une famille sans candidat reste absente", () => {
  it("sans médicament conseil en stock, il n'y en a pas, et rien ne remplace sa place", () => {
    const full = unlimited(ORDONNANCE_CHARGEE, withoutMedicament);
    expect(families(full, withoutMedicament).has("MEDICAMENT")).toBe(false);

    const result = analyse(ORDONNANCE_CHARGEE, withoutMedicament);
    expect(result.recommendations).toHaveLength(8);
    expect(families(result, withoutMedicament).has("MEDICAMENT")).toBe(false);
    // Les huit premiers de la liste complète, tels quels : aucun déplacement, aucune réservation.
    expect(keys(result)).toEqual(keys(full).slice(0, 8));
    expect(traceNotes(result).some((note) => note.includes("gardé malgré la limite"))).toBe(false);
    expect(traceNotes(result).find((note) => note.startsWith("Conseil complet : "))).not.toContain("médicament conseil");
  });

  it("un produit en rupture n'est jamais gardé pour faire nombre", () => {
    const outOfStock = withMedicament.map((p) => (p.id === "gorge" ? { ...p, stockQuantity: 0 } : p));
    const result = analyse(ORDONNANCE_CHARGEE, outOfStock);
    expect(families(result, outOfStock).has("MEDICAMENT")).toBe(false);
    expect(result.recommendations.every((r) => r.productId !== "gorge")).toBe(true);
  });
});

describe("la sécurité passe toujours avant", () => {
  it("le conseil de sécurité est retenu, en tête, quelle que soit la limite", () => {
    for (let limit = 1; limit <= 12; limit += 1) {
      const result = analyse(ORDONNANCE_CHARGEE, withMedicament, { maxRecommendations: limit });
      expect(keys(result)[0], `limite ${limit}`).toBe("sun-photosensitivity");
    }
  });
});

describe("jamais le seul de sa famille", () => {
  it("aucune famille présente parmi les premiers conseils ne disparaît, à aucune limite", () => {
    const full = unlimited(ORDONNANCE_CHARGEE, withMedicament);
    for (let limit = 1; limit <= 12; limit += 1) {
      const firstFamilies = new Set(full.recommendations.slice(0, limit).map((r) => familyOf(withMedicament, r.productId)));
      const kept = families(analyse(ORDONNANCE_CHARGEE, withMedicament, { maxRecommendations: limit }), withMedicament);
      for (const family of firstFamilies) expect(kept.has(family), `limite ${limit} : ${family}`).toBe(true);
    }
  });

  it("jamais plus de conseils que la limite", () => {
    for (let limit = 1; limit <= 12; limit += 1) {
      expect(analyse(ORDONNANCE_CHARGEE, withMedicament, { maxRecommendations: limit }).recommendations.length).toBeLessThanOrEqual(limit);
    }
  });
});

describe("l'ordre de sortie reste celui de la priorité clinique", () => {
  it("les conseils gardés se suivent par priorité décroissante, le conseil réservé à sa place d'origine", () => {
    const result = analyse(ORDONNANCE_CHARGEE, withMedicament);
    const priorities = keys(result).map((key) => priorityOf(result, key));
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
    // Le médicament conseil (priorité 48) vient après tout ce qui le précède dans la liste complète.
    expect(keys(result).at(-1)).toBe("sore-throat-orl");
  });
});

describe("les alternatives ne changent jamais ce que le moteur retient", () => {
  it("les alternatives d'un conseil gardé ne reprennent aucun produit retenu ailleurs", () => {
    const result = analyse(ORDONNANCE_CHARGEE, withMedicament);
    const retained = new Set(result.recommendations.map((r) => r.productId));
    for (const recommendation of result.recommendations) {
      for (const alternative of recommendation.alternatives ?? []) expect(retained.has(alternative.productId)).toBe(false);
    }
  });

  it("le choix du produit d'un conseil est le même avec ou sans limite", () => {
    const full = unlimited(ORDONNANCE_CHARGEE, withMedicament);
    for (const limit of [3, 5, 8]) {
      for (const retained of analyse(ORDONNANCE_CHARGEE, withMedicament, { maxRecommendations: limit }).recommendations) {
        expect(full.recommendations.find((r) => r.opportunityKey === retained.opportunityKey)?.productId).toBe(retained.productId);
      }
    }
  });
});

describe("une routine compte pour un seul conseil", () => {
  const ISOTRETINOINE = treatment("Isotretinoine 10", "D10BA01", "Rétinoïde oral");
  const derm = (id: string, name: string, brand: string, tags: string[]) => stocked(id, name, "DERMOCOSMETIQUE", tags, { brand });
  const routineShelf = [
    derm("l1", "LA ROCHE-POSAY effaclar gel moussant purifiant", "La Roche-Posay", ["nettoyant", "visage"]),
    derm("l2", "LA ROCHE-POSAY toleriane sensitive crème visage", "La Roche-Posay", ["hydratation", "peau sensible", "apaisant", "émollient"]),
    derm("l3", "LA ROCHE-POSAY anthelios SPF 50+ fluide visage", "La Roche-Posay", ["protection solaire", "spf", "photoprotection"]),
    derm("lip", "CERALIP baume lèvres réparateur", "La Roche-Posay", ["lèvres", "baume"]),
  ];

  it("une limite d'un conseil garde toute la routine, ses trois étapes comprises", () => {
    const result = analyse([ISOTRETINOINE], routineShelf, { maxRecommendations: 1 });
    expect(result.recommendations.map((r) => r.routine?.key)).toEqual(Array(3).fill("isotretinoin-skin-routine"));
  });

  it("une limite de deux conseils : la routine (trois étapes) et le soin des lèvres", () => {
    const result = analyse([ISOTRETINOINE], routineShelf, { maxRecommendations: 2 });
    expect(result.recommendations).toHaveLength(4);
  });

  it("dans une ordonnance chargée, la routine garde toutes ses étapes ou n'en garde aucune", () => {
    for (let limit = 1; limit <= 10; limit += 1) {
      const result = analyse([...ORDONNANCE_CHARGEE, ISOTRETINOINE], [...withMedicament, ...routineShelf], { maxRecommendations: limit });
      const steps = result.recommendations.filter((r) => r.routine?.key === "isotretinoin-skin-routine").length;
      expect([0, 3], `limite ${limit}`).toContain(steps);
      const conseils = new Set(result.recommendations.map((r) => r.routine?.key ?? r.opportunityKey));
      expect(conseils.size, `limite ${limit}`).toBeLessThanOrEqual(limit);
    }
  });
});
