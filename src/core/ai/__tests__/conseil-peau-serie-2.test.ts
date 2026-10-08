import { describe, expect, it } from "vitest";
import { classifyProductByName, restrictToVocabulary } from "../../catalog/product-vocabulary";
import type { CatalogProduct } from "../types";
import { ADVICE_RULES, detectAdviceOpportunities } from "../engines/advice";
import { SKIN_SERIES_2, SKIN_SERIES_2_ROWS, skinSeries2Coverage } from "../engines/conseil-peau-couverture";
import { SKIN_SERIES_2_ADVICE_RULES, SKIN_SERIES_2_VIGILANCES } from "../engines/conseil-peau-serie-2";
import { VIGILANCE_RULES, evaluateVigilances } from "../engines/vigilance";
import { drug, patient, product } from "./fixtures";
import { analyse } from "./scenarios-conseils";

/**
 * « Conseil peau — Série 2 » : acné, photoprotection, eczéma, cuir chevelu.
 *
 * Le rayon est fait de VRAIS noms de produits, rangés par le dictionnaire de l'application
 * (pas d'étiquettes écrites à la main) : c'est la leçon du lot « conseil complet » — une règle
 * se juge sur ce que le stock d'une officine nomme réellement.
 */

type Treatment = { name: string; atc: string; klass: string };
const BPO: Treatment = { name: "Cutacnyl 2,5 %", atc: "D10AE01", klass: "Peroxyde de benzoyle" };
const EPIDUO: Treatment = { name: "Epiduo 0,1 %/2,5 % gel", atc: "D10AD53", klass: "Adapalène et peroxyde de benzoyle" };
const EFFEDERM: Treatment = { name: "Effederm 0,05 % crème", atc: "D10AD01", klass: "Trétinoïne cutanée" };
const DOXYCYCLINE: Treatment = { name: "Doxycycline Sandoz 100 mg", atc: "J01AA02", klass: "Cycline" };
const LOCOID: Treatment = { name: "Locoid 0,1 % crème", atc: "D07AB02", klass: "Dermocorticoïde" };
const DIPROSONE: Treatment = { name: "Diprosone 0,05 % crème", atc: "D07AC01", klass: "Dermocorticoïde" };
const PROTOPIC: Treatment = { name: "Protopic 0,1 % pommade", atc: "D11AH01", klass: "Tacrolimus cutané" };
const GERDA: Treatment = { name: "Ciclopirox olamine Gerda 1,5 % shampooing", atc: "D01AE14", klass: "Antifongique topique" };

function shelfItem(id: string, name: string, overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  const classified = classifyProductByName(name);
  return product({
    id,
    name,
    brand: null,
    subCategory: null,
    description: null,
    commercialClaims: [],
    category: classified?.category ?? "AUTRE",
    matchingTags: restrictToVocabulary(classified?.tags ?? []),
    stockQuantity: 10,
    ...overrides,
  });
}

const SHELF: CatalogProduct[] = [
  shelfItem("hydra", "EUCERIN DERMOPURE CLINICAL HYDRA REPAIR 40 ML"),
  shelfItem("atoderm", "BIODERMA ATODERM CREME 200 ML"),
  shelfItem("lipikar-baume", "LA ROCHE-POSAY LIPIKAR BAUME AP+M 400 ML"),
  shelfItem("lipikar-corps", "LA ROCHE-POSAY LIPIKAR LAIT CORPS 400 ML"),
  shelfItem("syndet", "LA ROCHE-POSAY LIPIKAR SYNDET AP+ 400 ML"),
  shelfItem("purifiant", "EUCERIN DERMOPURE CLINICAL GEL NETTOYANT PURIFIANT 200 ML"),
  shelfItem("gommage", "EUCERIN DERMOPURE CLINICAL GOMMAGE PURIFIANT 100 ML"),
  shelfItem("peeling", "EUCERIN DERMOPURE CLINICAL PEELING 10 30 ML"),
  shelfItem("serum", "LA ROCHE-POSAY EFFACLAR SERUM ULTRA CONCENTRE 30 ML"),
  shelfItem("sun-oil-control", "EUCERIN SUN OIL CONTROL GEL-CREME TOUCHER SEC SPF 50+ 50 ML"),
  shelfItem("sun-kids", "ANTHELIOS DERMO-PEDIATRICS SPF 50+ ENFANT 250 ML"),
  shelfItem("sun-lait", "NIVEA SUN LAIT SOLAIRE CORPS SPF 30 200 ML"),
  shelfItem("node", "BIODERMA NODE FLUIDE SHAMPOOING 200 ML"),
  shelfItem("kelual", "DUCRAY KELUAL DS INTENSIVE SHAMPOOING 100 ML"),
  shelfItem("zinc", "EFFIZINC 15 MG GELULE B/60"),
  shelfItem("vitamine-a", "AROVIT VITAMINE A 100000 UI AMPOULE"),
];

const EXFOLIANTS = ["gommage", "peeling", "serum"];
const names = (result: ReturnType<typeof analyse>) => result.recommendations.map((r) => `${r.opportunityKey}:${r.productId}`);
const proposed = (result: ReturnType<typeof analyse>) => result.recommendations.map((r) => r.productId);
const vigilancesOf = (result: ReturnType<typeof analyse>) => result.vigilances ?? [];
const vigilanceKeys = (result: ReturnType<typeof analyse>) => vigilancesOf(result).map((v) => v.key);

describe("le document : chaque ligne est portée, rien ne disparaît en silence", () => {
  it("huit lignes, chacune par au moins une règle de conseil ET une vigilance", () => {
    expect(SKIN_SERIES_2_ROWS).toHaveLength(8);
    for (const row of skinSeries2Coverage()) {
      expect(row.advice.length, `ligne ${row.row} sans règle de conseil`).toBeGreaterThan(0);
      expect(row.vigilances.length, `ligne ${row.row} sans vigilance`).toBeGreaterThan(0);
    }
  });

  it("les règles ne citent que des lignes qui existent, et toutes sont à valider par le pharmacien (PENDING)", () => {
    for (const rule of [...SKIN_SERIES_2_ADVICE_RULES, ...SKIN_SERIES_2_VIGILANCES]) {
      expect(rule.documentRows?.document, rule.key).toBe(SKIN_SERIES_2.id);
      for (const row of rule.documentRows?.rows ?? []) expect(row, rule.key).toBeLessThanOrEqual(SKIN_SERIES_2_ROWS.length);
    }
    for (const rule of SKIN_SERIES_2_ADVICE_RULES) expect(rule.validation.status, rule.key).toBe("PENDING");
  });

  it("les règles sont bien celles du moteur (pas une copie à part)", () => {
    for (const rule of SKIN_SERIES_2_ADVICE_RULES) expect(ADVICE_RULES).toContain(rule);
    for (const rule of SKIN_SERIES_2_VIGILANCES) expect(VIGILANCE_RULES).toContain(rule);
  });

  it("chaque règle de conseil pose la question du document avant de proposer quoi que ce soit", () => {
    const expected: Record<string, RegExp> = {
      "skin-bpo-moisturizer": /tiraille-t-elle ou pèle-t-elle/,
      "skin-adapalene-bpo-moisturizer": /sécheresse ou une irritation/,
      "skin-tretinoin-moisturizer": /gommages ou des acides/,
      "skin-doxycycline-photoprotection": /exposé au soleil/,
      "skin-corticoid-atopic-emollient": /Pour quelle affection/,
      "skin-corticoid-atopic-cleanser": /Avec quoi vous lavez-vous/,
      "skin-tacrolimus-emollient": /par rapport à Protopic/,
      "skin-ciclopirox-shampoo": /Quel shampooing/,
    };
    for (const rule of SKIN_SERIES_2_ADVICE_RULES) expect(rule.question, rule.key).toMatch(expected[rule.key]!);
  });
});

describe("le déclencheur : chaque médicament ouvre SA règle, et la règle générale s'efface", () => {
  const keysFor = (treatment: Treatment) =>
    detectAdviceOpportunities({
      drugs: [{ lineIndex: 0, drugName: treatment.name, knowledge: drug({ name: treatment.name, inn: treatment.name.toUpperCase(), atcCode: treatment.atc, therapeuticClass: treatment.klass, commonSideEffects: [] }) }],
      patient: patient(),
    }).map((opportunity) => opportunity.key);

  it("peroxyde de benzoyle, adapalène + peroxyde, trétinoïne : une règle chacun, jamais deux hydratants", () => {
    expect(keysFor(BPO)).toContain("skin-bpo-moisturizer");
    expect(keysFor(BPO)).not.toContain("hydration-dermato-topical");
    expect(keysFor(EPIDUO)).toContain("skin-adapalene-bpo-moisturizer");
    expect(keysFor(EPIDUO)).not.toContain("skin-bpo-moisturizer");
    expect(keysFor(EPIDUO)).not.toContain("hydration-dermato-topical");
    expect(keysFor(EFFEDERM)).toContain("skin-tretinoin-moisturizer");
    expect(keysFor(EFFEDERM)).not.toContain("hydration-dermato-topical");
  });

  it("doxycycline : la photoprotection précise, pas la générale ; une autre cycline garde la générale", () => {
    expect(keysFor(DOXYCYCLINE)).toContain("skin-doxycycline-photoprotection");
    expect(keysFor(DOXYCYCLINE)).not.toContain("sun-photosensitivity");
    expect(keysFor({ name: "Lymécycline 300 mg", atc: "J01AA04", klass: "Cycline" })).toContain("sun-photosensitivity");
  });

  it("dermocorticoïdes : les deux règles du document (émollient, lavant), jamais l'hydratant d'office", () => {
    for (const treatment of [LOCOID, DIPROSONE]) {
      expect(keysFor(treatment)).toEqual(expect.arrayContaining(["skin-corticoid-atopic-emollient", "skin-corticoid-atopic-cleanser"]));
      expect(keysFor(treatment)).not.toContain("hydration-dermato-topical");
    }
  });

  it("tacrolimus cutané et ciclopirox shampooing", () => {
    expect(keysFor(PROTOPIC)).toContain("skin-tacrolimus-emollient");
    expect(keysFor(GERDA)).toContain("skin-ciclopirox-shampoo");
  });

  it("un autre traitement de la peau garde la règle générale : rien n'est retiré à ce que le document ne couvre pas", () => {
    expect(keysFor({ name: "Dermocorticoïde + antibiotique", atc: "D07CA01", klass: "Dermatologique" })).toContain("hydration-dermato-topical");
  });
});

describe("les textes lus sur la carte : aucun repère laissé tel quel", () => {
  it("la raison confirmée nomme le médicament déclencheur (pas « {drug} »)", () => {
    for (const treatment of [BPO, EPIDUO, EFFEDERM, DOXYCYCLINE, LOCOID, PROTOPIC, GERDA]) {
      const result = analyse([treatment], SHELF);
      for (const opportunity of result.opportunities.filter((o) => (o.ruleKey ?? "").startsWith("skin-"))) {
        expect(opportunity.confirmedReason, opportunity.key).toBeTruthy();
        expect(opportunity.confirmedReason, opportunity.key).not.toMatch(/\{(drug|product)\}/);
        expect(opportunity.question, opportunity.key).toBeTruthy();
      }
    }
  });
});

describe("le produit proposé : le stock réel, les marques du document en préférence, jamais un exfoliant", () => {
  it("sous peroxyde de benzoyle : l'hydratant de visage cité, ni soin du corps, ni exfoliant", () => {
    const result = analyse([BPO], SHELF);
    expect(names(result)).toEqual(["skin-bpo-moisturizer:hydra"]);
    for (const id of [...EXFOLIANTS, "lipikar-corps", "purifiant"]) expect(proposed(result)).not.toContain(id);
  });

  it("sous adapalène + peroxyde et sous trétinoïne : le même hydratant, jamais un exfoliant", () => {
    for (const treatment of [EPIDUO, EFFEDERM]) {
      const result = analyse([treatment], SHELF);
      expect(proposed(result), treatment.name).toEqual(["hydra"]);
      for (const id of EXFOLIANTS) expect(proposed(result)).not.toContain(id);
    }
  });

  it("sous doxycycline : le solaire visage SPF 50+ toucher sec, pas le solaire enfant ni le lait corps", () => {
    const result = analyse([DOXYCYCLINE], SHELF);
    expect(proposed(result)).toEqual(["sun-oil-control"]);
    expect(result.opportunities.find((o) => o.key === "skin-doxycycline-photoprotection")?.kind).toBe("SAFETY");
  });

  it("sous dermocorticoïde : l'émollient du rayon et le lavant doux, jamais le gommage « purifiant »", () => {
    for (const treatment of [LOCOID, DIPROSONE]) {
      const result = analyse([treatment], SHELF);
      expect(proposed(result), treatment.name).toContain("syndet");
      expect(proposed(result)).not.toContain("gommage");
      expect(proposed(result)).not.toContain("purifiant");
      expect(proposed(result)).not.toContain("peeling");
      expect(names(result).some((entry) => entry.startsWith("skin-corticoid-atopic-emollient:"))).toBe(true);
    }
  });

  it("sous Protopic : un émollient avec la consigne des 2 heures", () => {
    const result = analyse([PROTOPIC], SHELF);
    const recommendation = result.recommendations.find((r) => r.opportunityKey === "skin-tacrolimus-emollient");
    expect(recommendation).toBeDefined();
    expect(recommendation?.productId).not.toBe("gommage");
    expect(recommendation?.counterScript ?? "").toContain("2 heures");
  });

  it("sous ciclopirox shampooing : le shampooing doux entre les applications, jamais un autre antipelliculaire", () => {
    const result = analyse([GERDA], SHELF);
    expect(names(result)).toEqual(["skin-ciclopirox-shampoo:node"]);
    expect(proposed(result)).not.toContain("kelual");
  });

  it("un rayon sans référence adaptée ne propose rien plutôt qu'un exfoliant", () => {
    const onlyExfoliants = SHELF.filter((item) => EXFOLIANTS.includes(item.id));
    for (const treatment of [BPO, EPIDUO, EFFEDERM, LOCOID, PROTOPIC]) expect(analyse([treatment], onlyExfoliants).recommendations, treatment.name).toEqual([]);
  });
});

describe("ce qu'on n'associe pas : l'exfoliant est écarté de TOUT le moteur, pas seulement de ces règles", () => {
  it("les vigilances « à éviter » écartent l'étiquette exfoliant sous chaque traitement concerné", () => {
    for (const treatment of [BPO, EPIDUO, EFFEDERM, LOCOID, DIPROSONE]) {
      const result = analyse([treatment], SHELF);
      const avoid = vigilancesOf(result).filter((v) => v.kind === "AVOID");
      expect(avoid.length, treatment.name).toBeGreaterThan(0);
      expect(avoid.flatMap((v) => v.blockTags), treatment.name).toContain("exfoliant");
    }
  });

  it("même une règle étrangère à ce document ne pourrait pas proposer un exfoliant à ces patients", () => {
    const result = analyse([BPO], SHELF, { rules: [] });
    const excluded = result.safetyFindings.filter((finding) => finding.code === "VIGILANCE_PRODUCT_EXCLUDED").map((finding) => finding.subjectId);
    expect(excluded).toEqual(expect.arrayContaining(["gommage", "peeling", "serum"]));
  });

  it("shampooing au ciclopirox : l'autre antipelliculaire est écarté d'office, avec la mention « ajout à vérifier »", () => {
    const result = analyse([GERDA], SHELF);
    const check = vigilancesOf(result).find((v) => v.key === "skin-ciclopirox-check-addition");
    expect(check?.blockTags).toEqual(["antipelliculaire"]);
    expect(check?.explanation).toMatch(/pas une contre-indication/);
    expect(check?.explanation).toMatch(/aucune incompatibilité/);
    expect(check?.severity).toBe("INFO");
  });

  it("doxycycline : la vitamine A est écartée (contre-indication du RCP), le zinc reste proposable à distance", () => {
    const result = analyse([DOXYCYCLINE], SHELF);
    const contra = vigilancesOf(result).find((v) => v.key === "skin-doxycycline-contraindications");
    expect(contra?.kind).toBe("CONTRAINDICATION");
    expect(contra?.blockTags).toEqual(["vitamine a"]);
    expect(contra?.concerned.join(" ")).toMatch(/Curacné/);
    expect(contra?.concerned.join(" ")).toMatch(/10 000 UI/);
    // La prise à distance du zinc reste portée par la règle des cyclines, pas par celle-ci.
    expect(vigilanceKeys(result)).toContain("cycline-quinolone-chelation");
    expect(contra?.cautionTags).toEqual([]);
    expect(result.safetyFindings.filter((f) => f.code === "VIGILANCE_PRODUCT_EXCLUDED").map((f) => f.subjectId)).toContain("vitamine-a");
    expect(result.safetyFindings.filter((f) => f.code === "VIGILANCE_PRODUCT_EXCLUDED").map((f) => f.subjectId)).not.toContain("zinc");
  });
});

describe("la grossesse : une alerte, pas un conseil cosmétique", () => {
  it("adapalène + peroxyde et trétinoïne : contre-indiqués (RCP), l'alerte est toujours là", () => {
    for (const [treatment, key] of [[EPIDUO, "skin-adapalene-bpo-contraindications"], [EFFEDERM, "skin-tretinoin-pregnancy"]] as const) {
      const vigilance = vigilancesOf(analyse([treatment], SHELF)).find((v) => v.key === key);
      expect(vigilance?.kind, key).toBe("CONTRAINDICATION");
      expect(vigilance?.explanation, key).toMatch(/grossesse/i);
    }
  });

  it("patiente enceinte : le conseil d'hydratant est retiré, avec la raison", () => {
    for (const treatment of [EPIDUO, EFFEDERM]) {
      const result = analyse([treatment], SHELF, { patient: patient({ isPregnant: true }) });
      expect(result.recommendations, treatment.name).toEqual([]);
      const blocked = result.opportunities.filter((o) => o.isBlocked);
      expect(blocked.length, treatment.name).toBeGreaterThan(0);
      expect(blocked[0]?.blockReason).toMatch(/contre-indiqué pendant la grossesse/);
    }
  });

  it("peroxyde de benzoyle seul : le RCP ne le contre-indique pas (« que si clairement nécessaire ») : le conseil reste", () => {
    const result = analyse([BPO], SHELF, { patient: patient({ isPregnant: true }) });
    expect(proposed(result)).toEqual(["hydra"]);
  });
});

describe("une carte « à éviter » ne se fait pas passer pour une contre-indication", () => {
  const byKey = new Map(SKIN_SERIES_2_VIGILANCES.map((rule) => [rule.key, rule]));

  it("sous peroxyde de benzoyle, adapalène, trétinoïne : le RCP ne cite aucun produit, et la carte le dit", () => {
    for (const key of ["skin-bpo-avoid", "skin-adapalene-bpo-avoid", "skin-tretinoin-avoid"]) {
      const rule = byKey.get(key)!;
      expect(rule.kind, key).toBe("AVOID");
      expect(rule.explanationTemplate, key).toMatch(/ne cite aucun produit nommément/);
    }
  });

  it("les exemples déconseillés du document sont nommés tels quels, comme exemples", () => {
    const text = SKIN_SERIES_2_VIGILANCES.flatMap((rule) => rule.concerned).join(" | ");
    expect(text).toContain("Eucerin DermoPure Clinical Peeling 10");
    expect(text).toContain("La Roche-Posay Effaclar Sérum Ultra Concentré");
    expect(text).toContain("Eucerin DermoPure Clinical Gommage Purifiant");
    expect(text).toContain("Ducray Kelual DS Intensive");
  });

  it("seules les contre-indications du RCP sont étiquetées CONTRAINDICATION : grossesse, rétinoïdes, vitamine A", () => {
    const contraindications = SKIN_SERIES_2_VIGILANCES.filter((rule) => rule.kind === "CONTRAINDICATION").map((rule) => rule.key).sort();
    expect(contraindications).toEqual(["skin-adapalene-bpo-contraindications", "skin-doxycycline-contraindications", "skin-tretinoin-pregnancy"]);
  });

  it("chaque vigilance cite le RCP de la base publique (CIS) ET le document", () => {
    for (const rule of SKIN_SERIES_2_VIGILANCES) {
      expect(rule.sources.some((source) => /Base de données publique des médicaments \(ANSM\), CIS \d{8}/.test(source)), rule.key).toBe(true);
      expect(rule.sources.some((source) => source.includes("Conseil peau — Série 2") || source.includes("référence du document")), rule.key).toBe(true);
    }
  });

  it("tacrolimus : 2 heures avec l'émollient, pas de pansement occlusif, soleil et solarium, infection (RCP 4.4)", () => {
    expect(byKey.get("skin-tacrolimus-usage")?.explanationTemplate).toContain("2 heures");
    const avoid = byKey.get("skin-tacrolimus-avoid")!;
    expect(avoid.concerned.join(" ")).toMatch(/pansement/i);
    expect(avoid.explanationTemplate).toMatch(/pas de pansement occlusif/);
    expect(avoid.explanationTemplate).toMatch(/solarium/);
    expect(avoid.explanationTemplate).toMatch(/infection/);
  });
});

describe("une crème ou une pommade n'est pas un comprimé : les vigilances de la voie générale s'effacent", () => {
  const evaluate = (name: string, atc: string | null, inn: string) => evaluateVigilances([drug({ name, inn, atcCode: atc, therapeuticClass: null, form: null, commonSideEffects: [] })]).map((v) => v.key);
  const SYSTEMIC = ["usage-oral-corticosteroid", "systemic-corticosteroid-bone-licorice", "immunosuppressant-supplements"];

  it("Locoid, Diprosone, Protopic : ni « le matin pendant le repas », ni prévention osseuse, ni immunosuppresseur de greffe", () => {
    for (const [name, atc, inn] of [["Locoid 0,1 % crème", "D07AB02", "hydrocortisone"], ["Diprosone 0,05 % crème", "D07AC01", "betamethasone"], ["Protopic 0,1 % pommade", "D11AH01", "tacrolimus"]] as const) {
      const keys = evaluate(name, atc, inn);
      for (const key of SYSTEMIC) expect(keys, `${name} → ${key}`).not.toContain(key);
    }
  });

  it("la voie générale, elle, les déclenche toujours : prednisolone (H02AB06), tacrolimus oral (L04AD02)", () => {
    expect(evaluate("Solupred 20 mg", "H02AB06", "prednisolone")).toEqual(expect.arrayContaining(["usage-oral-corticosteroid", "systemic-corticosteroid-bone-licorice"]));
    expect(evaluate("Prograf 1 mg", "L04AD02", "tacrolimus")).toContain("immunosuppressant-supplements");
  });

  it("sans code ATC, la substance décide encore : on ne taira pas une vigilance faute de classification", () => {
    expect(evaluate("Solupred 20 mg", null, "prednisolone")).toContain("usage-oral-corticosteroid");
  });
});
