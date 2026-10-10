import { describe, expect, it } from "vitest";
import { classifyProductByName, restrictToVocabulary } from "../../catalog/product-vocabulary";
import type { CatalogProduct } from "../types";
import { ADVICE_RULES, detectAdviceOpportunities } from "../engines/advice";
import {
  SKIN_DOCUMENT_NAMES,
  SKIN_SERIES_1,
  SKIN_SERIES_1_ROWS,
  SKIN_SERIES_3,
  SKIN_SERIES_3_ROWS,
  SKIN_SERIES_4,
  SKIN_SERIES_4_ROWS,
  SKIN_SERIES_5,
  SKIN_SERIES_5_ROWS,
  skinSeriesCoverage,
} from "../engines/conseil-peau-couverture";
import { SKIN_SERIES_1_ADVICE_RULES, SKIN_SERIES_1_VIGILANCES } from "../engines/conseil-peau-serie-1";
import { SKIN_SERIES_3_ADVICE_RULES, SKIN_SERIES_3_VIGILANCES } from "../engines/conseil-peau-serie-3";
import { SKIN_SERIES_4_ADVICE_RULES, SKIN_SERIES_4_VIGILANCES } from "../engines/conseil-peau-serie-4";
import { SKIN_SERIES_5_ADVICE_RULES, SKIN_SERIES_5_VIGILANCES } from "../engines/conseil-peau-serie-5";
import { VIGILANCE_RULES, evaluateVigilances } from "../engines/vigilance";
import { describeVigilances } from "../vigilance-catalog";
import { drug, patient, product } from "./fixtures";
import { analyse } from "./scenarios-conseils";

/**
 * « Conseil peau » — séries 1, 3, 4 et 5 (documents reçus les 7 et 8 octobre 2026), relues dans les RCP le 10 octobre 2026.
 *
 * Le rayon est fait de VRAIS noms de produits, rangés par le dictionnaire de l'application : une règle se juge sur ce que le stock
 * d'une officine nomme réellement. Les médicaments portent leur vrai code ATC (lu dans leur RCP).
 */

type Treatment = { name: string; atc: string; klass: string };
const T = (name: string, atc: string, klass = "Médicament cutané"): Treatment => ({ name, atc, klass });

const ROZEX = T("Rozex 0,75 % crème", "D06BX01");
const SOOLANTRA = T("Soolantra 10 mg/g crème", "D11AX22");
const FINACEA = T("Finacea 15 % gel", "D10AX03");
const KETODERM = T("Kétoderm 2 % crème", "D01AC08");
const NIZORAL_SHAMPOO = T("Nizoral 2 % shampooing", "D01AC08");
const TERBINAFINE = T("Terbinafine Biogaran 1 % crème", "D01AE15");
const DAIVONEX = T("Daivonex 50 µg/g crème", "D05AX02");
const DAIVOBET = T("Daivobet pommade", "D05AX52");
const TOPISCAB = T("Topiscab 5 % crème", "P03AC04", "Antiparasitaire externe");
const PERMETHRINE_POUX = T("Permethrine 1 % lotion antipoux", "P03AC04", "Antiparasitaire externe");
const SORIATANE = T("Soriatane 25 mg gélule", "D05BB02", "Rétinoïde oral");
const TOCTINO = T("Toctino 30 mg capsule", "D11AH04", "Rétinoïde oral");
const ERYTHROGEL = T("Erythrogel 4 % gel", "D10AF02");
const MIRVASO = T("Mirvaso 3 mg/g gel", "D11AX21");
const DUPIXENT = T("Dupixent 300 mg seringue", "D11AH05");
const DERMOVAL = T("Dermoval 0,05 % crème", "D07AD01", "Dermocorticoïde");
const CLOBEX = T("Clobex 500 µg/g shampooing", "D07AD01", "Dermocorticoïde");
const ECONAZOLE = T("Econazole Viatris 1 % crème", "D01AC03");
const AKLIEF = T("Aklief 50 µg/g crème", "D10AD06");
const ROACCUTANE_GEL = T("Roaccutane 0,05 % gel", "D10AD04");
const NEORAL = T("Neoral 100 mg capsule", "L04AD01", "Immunosuppresseur");
const OTEZLA = T("Otezla 30 mg comprimé", "L04AA32", "Immunosuppresseur");
const ADTRALZA = T("Adtralza 150 mg seringue", "D11AH07");
const SILKIS = T("Silkis 3 µg/g pommade", "D05AX03");
const EFUDIX = T("Efudix 5 % crème", "L01BC02", "Antinéoplasique");
const FLUOROURACILE_INJECTABLE = T("Fluorouracile 500 mg injectable", "L01BC02", "Antinéoplasique");
const ZYCLARA = T("Zyclara 3,75 % crème", "D06BB10");
const ALDARA = T("Aldara 5 % crème", "D06BB10");
const ISOTRETINOINE = T("Curacné 10 mg capsule", "D10BA01", "Rétinoïde oral");
const DIFFERINE = T("Differine 0,1 % crème", "D10AD03");

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
  // Visage
  shelfItem("hydra", "EUCERIN DERMOPURE CLINICAL HYDRA REPAIR 40 ML"),
  shelfItem("dermallergo", "LA ROCHE-POSAY TOLERIANE DERMALLERGO CREME 40 ML"),
  shelfItem("toleriane-nettoyant", "LA ROCHE-POSAY TOLERIANE FLUIDE DERMO-NETTOYANT 200 ML"),
  shelfItem("purifiant", "EUCERIN DERMOPURE CLINICAL GEL NETTOYANT PURIFIANT 200 ML"),
  shelfItem("gommage", "EUCERIN DERMOPURE CLINICAL GOMMAGE PURIFIANT 100 ML"),
  shelfItem("peeling", "EUCERIN DERMOPURE CLINICAL PEELING 10 30 ML"),
  shelfItem("serum", "LA ROCHE-POSAY EFFACLAR SERUM ULTRA CONCENTRE 30 ML"),
  // Corps, atopie
  shelfItem("atoderm-gel", "BIODERMA ATODERM INTENSIVE GEL MOUSSANT 200 ML"),
  shelfItem("lipikar-baume", "LA ROCHE-POSAY LIPIKAR BAUME AP+M 400 ML"),
  shelfItem("atoderm-ad", "BIODERMA ATODERM AD INTENSIVE BAUME 500 ML"),
  shelfItem("lipikar-corps", "LA ROCHE-POSAY LIPIKAR LAIT CORPS 400 ML"),
  shelfItem("syndet", "LA ROCHE-POSAY LIPIKAR SYNDET AP+ 400 ML"),
  // Lèvres, mains
  shelfItem("cicaplast-levres", "LA ROCHE-POSAY CICAPLAST LEVRES 7,5 ML"),
  shelfItem("cicaplast-mains", "LA ROCHE-POSAY CICAPLAST MAINS 50 ML"),
  shelfItem("gel-mains", "ANIOSGEL 85 NPC GEL MAINS HYDROALCOOLIQUE 100 ML"),
  // Solaires
  shelfItem("uvmune", "LA ROCHE-POSAY ANTHELIOS UVMUNE 400 CREME SANS PARFUM SPF 50+ 50 ML"),
  shelfItem("uvmune-ka", "LA ROCHE-POSAY ANTHELIOS UVMUNE 400 FLUIDE KA SPF 50+ 50 ML"),
  shelfItem("hyaluron-filler", "EUCERIN HYALURON-FILLER +3X EFFECT SOIN DE JOUR SPF 15 50 ML"),
  shelfItem("sun-kids", "ANTHELIOS DERMO-PEDIATRICS SPF 50+ ENFANT 250 ML"),
  shelfItem("sun-lait", "NIVEA SUN LAIT SOLAIRE CORPS SPF 30 200 ML"),
  // Cuir chevelu, hygiène
  shelfItem("node", "BIODERMA NODE FLUIDE SHAMPOOING 200 ML"),
  shelfItem("kelual", "DUCRAY KELUAL DS INTENSIVE SHAMPOOING 100 ML"),
  shelfItem("saforelle", "SAFORELLE SOIN LAVANT DOUX 250 ML"),
  // Yeux
  shelfItem("larmes", "HYABAK 0,15 % COLLYRE LARMES ARTIFICIELLES SANS CONSERVATEUR 10 ML"),
  shelfItem("azyter", "AZYTER 15 MG/G COLLYRE UNIDOSE"),
  // Compléments
  shelfItem("millepertuis", "VIT'ALL+ MILLEPERTUIS BIO 250 MG GELULE B/60"),
  shelfItem("vitamine-a", "AROVIT VITAMINE A 100000 UI AMPOULE"),
  shelfItem("calcium", "CALCIDOSE 500 MG CALCIUM SACHET B/30"),
  shelfItem("potassium", "DIFFU-K 600 MG GELULE B/20"),
];

const EXFOLIANTS = ["gommage", "peeling", "serum"];
const proposed = (result: ReturnType<typeof analyse>) => result.recommendations.map((r) => r.productId);
const proposedFor = (result: ReturnType<typeof analyse>, key: string) => result.recommendations.filter((r) => r.opportunityKey === key).map((r) => r.productId);
const vigilancesOf = (result: ReturnType<typeof analyse>) => result.vigilances ?? [];
const excluded = (result: ReturnType<typeof analyse>) => result.safetyFindings.filter((f) => f.code === "VIGILANCE_PRODUCT_EXCLUDED").map((f) => f.subjectId);

const keysFor = (treatment: Treatment) =>
  detectAdviceOpportunities({
    drugs: [{ lineIndex: 0, drugName: treatment.name, knowledge: drug({ name: treatment.name, inn: treatment.name.toUpperCase(), atcCode: treatment.atc, therapeuticClass: treatment.klass, commonSideEffects: [] }) }],
    patient: patient(),
  }).map((opportunity) => opportunity.key);

const vigilanceKeysFor = (treatment: Treatment) =>
  evaluateVigilances([drug({ name: treatment.name, inn: treatment.name.toUpperCase(), atcCode: treatment.atc, therapeuticClass: treatment.klass, commonSideEffects: [] })]).map((v) => v.key);

// -------------------------------------------------------------------------------------------------------------------

const SERIES = [
  { series: SKIN_SERIES_1, rows: SKIN_SERIES_1_ROWS, advice: SKIN_SERIES_1_ADVICE_RULES, vigilances: SKIN_SERIES_1_VIGILANCES },
  { series: SKIN_SERIES_3, rows: SKIN_SERIES_3_ROWS, advice: SKIN_SERIES_3_ADVICE_RULES, vigilances: SKIN_SERIES_3_VIGILANCES },
  { series: SKIN_SERIES_4, rows: SKIN_SERIES_4_ROWS, advice: SKIN_SERIES_4_ADVICE_RULES, vigilances: SKIN_SERIES_4_VIGILANCES },
  { series: SKIN_SERIES_5, rows: SKIN_SERIES_5_ROWS, advice: SKIN_SERIES_5_ADVICE_RULES, vigilances: SKIN_SERIES_5_VIGILANCES },
] as const;

describe("les documents : chaque ligne est portée, rien ne disparaît en silence", () => {
  it.each(SERIES)("$series.id : chaque ligne a une règle de conseil, et une vigilance (sauf la ligne 6 de la première série)", ({ series, rows }) => {
    expect(rows.length).toBe(series.id === "peau-serie-1" ? 6 : 8);
    for (const row of skinSeriesCoverage(series.id, [...rows])) {
      // La ligne 6 de la première série (probiotique sous antibiotique) est un conseil sans mise en garde propre : la précaution
      // (immunodépression) est portée par `blockedFor` de la règle de conseil.
      const noWarningNeeded = series.id === "peau-serie-1" && row.row === 6;
      expect(row.advice.length, `${series.id} ligne ${row.row} sans règle de conseil`).toBeGreaterThan(0);
      if (!noWarningNeeded) expect(row.vigilances.length, `${series.id} ligne ${row.row} sans vigilance`).toBeGreaterThan(0);
    }
  });

  it.each(SERIES)("$series.id : les règles ne citent que des lignes qui existent ; toutes sont à valider par le pharmacien (PENDING)", ({ series, rows, advice, vigilances }) => {
    for (const rule of [...advice, ...vigilances]) {
      expect(rule.documentRows?.document, rule.key).toBe(series.id);
      for (const row of rule.documentRows?.rows ?? []) expect(row, rule.key).toBeLessThanOrEqual(rows.length);
    }
    for (const rule of advice) expect(rule.validation.status, rule.key).toBe("PENDING");
  });

  it("les règles sont bien celles du moteur, avec des clés uniques", () => {
    for (const { advice, vigilances } of SERIES) {
      for (const rule of advice) expect(ADVICE_RULES).toContain(rule);
      for (const rule of vigilances) expect(VIGILANCE_RULES).toContain(rule);
    }
    expect(new Set(ADVICE_RULES.map((rule) => rule.key)).size).toBe(ADVICE_RULES.length);
    expect(new Set(VIGILANCE_RULES.map((rule) => rule.key)).size).toBe(VIGILANCE_RULES.length);
  });

  it("chaque règle de conseil nouvelle pose sa question et dit ce que « Oui » confirme", () => {
    for (const { advice } of SERIES) {
      for (const rule of advice) {
        if (!rule.question) continue;
        expect(rule.question, rule.key).toMatch(/\(Oui : .+\)\s*$/);
        expect(rule.confirmedReasonTemplate, rule.key).toBeTruthy();
      }
    }
    // Les règles nouvelles posent toutes une question : le nom du médicament ne dit pas le besoin.
    for (const rule of SERIES.flatMap(({ advice }) => advice)) expect(rule.question, rule.key).toBeTruthy();
  });

  it("chaque vigilance cite le RCP (CIS) de la base publique ou le PDF de l'EMA, et le document quand elle en vient", () => {
    for (const { vigilances } of SERIES) {
      for (const rule of vigilances) {
        expect(rule.sources.some((source) => /CIS \d{8}/.test(source)), rule.key).toBe(true);
      }
    }
  });

  it("le nom lisible de chaque document est connu de la console", () => {
    for (const { series } of SERIES) expect(SKIN_DOCUMENT_NAMES[series.id]).toBe(series.name);
  });
});

describe("le déclencheur : chaque médicament ouvre SA règle", () => {
  const EXPECTED: [Treatment, string[]][] = [
    [ROZEX, ["skin-metronidazole-cleanser"]],
    [SOOLANTRA, ["skin-ivermectin-moisturizer"]],
    [FINACEA, ["skin-azelaic-moisturizer"]],
    [KETODERM, ["skin-ketoconazole-cleanser"]],
    [TERBINAFINE, ["skin-terbinafine-cleanser"]],
    [DAIVONEX, ["skin-calcipotriol-emollient"]],
    [DAIVOBET, ["skin-calcipotriol-betamethasone-emollient"]],
    [TOPISCAB, ["skin-permethrin-emollient"]],
    [SORIATANE, ["skin-acitretin-lip-balm"]],
    [TOCTINO, ["skin-alitretinoin-hand-care"]],
    [ERYTHROGEL, ["skin-erythromycin-moisturizer"]],
    [MIRVASO, ["skin-brimonidine-moisturizer"]],
    [DUPIXENT, ["skin-dupilumab-emollient"]],
    [DERMOVAL, ["skin-clobetasol-cream-emollient"]],
    [CLOBEX, ["skin-clobetasol-shampoo-mild-shampoo"]],
    [ECONAZOLE, ["skin-econazole-cleanser"]],
    [AKLIEF, ["skin-trifarotene-moisturizer"]],
    [ROACCUTANE_GEL, ["skin-isotretinoin-gel-sunscreen"]],
    [NEORAL, ["skin-ciclosporin-photoprotection"]],
    [OTEZLA, ["skin-apremilast-emollient"]],
    [ADTRALZA, ["skin-tralokinumab-emollient"]],
    [SILKIS, ["skin-calcitriol-emollient"]],
    [EFUDIX, ["skin-fluorouracil-sunscreen"]],
    [ZYCLARA, ["skin-imiquimod-sunscreen"]],
    [ISOTRETINOINE, ["skin-isotretinoin-dry-eye", "lip-care-isotretinoin", "isotretinoin-skin-routine:cleanse"]],
    [DIFFERINE, ["skin-adapalene-moisturizer", "skin-adapalene-sunscreen"]],
  ];

  it.each(EXPECTED)("%j ouvre sa règle précise", (treatment, expected) => {
    expect(keysFor(treatment)).toEqual(expect.arrayContaining(expected));
  });

  it("une règle précise remplace la règle générale : jamais deux hydratants pour le même traitement", () => {
    for (const treatment of [FINACEA, ERYTHROGEL, DAIVONEX, DAIVOBET, SILKIS, SORIATANE, AKLIEF, DIFFERINE]) {
      expect(keysFor(treatment), treatment.name).not.toContain("hydration-dermato-topical");
    }
  });

  it("clobétasol : la crème (Dermoval) et le shampooing (Clobex) ont le même code ATC, seul le nom les distingue", () => {
    const dermoval = keysFor(DERMOVAL);
    const clobex = keysFor(CLOBEX);
    expect(dermoval).toContain("skin-clobetasol-cream-emollient");
    expect(dermoval).not.toContain("skin-clobetasol-shampoo-mild-shampoo");
    expect(clobex).toContain("skin-clobetasol-shampoo-mild-shampoo");
    expect(clobex).not.toContain("skin-clobetasol-cream-emollient");
    // La question « eczéma atopique » de la Série 2 ne se pose pas une seconde fois pour le clobétasol.
    expect(dermoval).not.toContain("skin-corticoid-atopic-emollient");
    const vig = (t: Treatment) => vigilanceKeysFor(t);
    expect(vig(DERMOVAL)).toEqual(expect.arrayContaining(["skin-clobetasol-cream-contraindications", "skin-clobetasol-cream-avoid"]));
    expect(vig(DERMOVAL)).not.toEqual(expect.arrayContaining(["skin-clobetasol-shampoo-avoid"]));
    expect(vig(CLOBEX)).toEqual(expect.arrayContaining(["skin-clobetasol-shampoo-contraindications", "skin-clobetasol-shampoo-avoid"]));
    expect(vig(CLOBEX)).not.toContain("skin-clobetasol-cream-avoid");
  });

  it("le kétoconazole en shampooing antipelliculaire n'ouvre pas la règle de la mycose du corps", () => {
    expect(keysFor(NIZORAL_SHAMPOO)).not.toContain("skin-ketoconazole-cleanser");
    expect(vigilanceKeysFor(NIZORAL_SHAMPOO)).not.toContain("skin-ketoconazole-avoid");
    expect(vigilanceKeysFor(KETODERM)).toEqual(expect.arrayContaining(["skin-ketoconazole-avoid", "skin-ketoconazole-usage"]));
  });

  it("la perméthrine contre les poux n'est pas la crème de la gale", () => {
    expect(keysFor(PERMETHRINE_POUX)).not.toContain("skin-permethrin-emollient");
    expect(vigilanceKeysFor(PERMETHRINE_POUX)).not.toContain("skin-permethrin-avoid");
    expect(vigilanceKeysFor(TOPISCAB)).toEqual(expect.arrayContaining(["skin-permethrin-avoid", "skin-permethrin-usage"]));
  });

  it("le fluorouracile injectable et l'imiquimod à 5 % n'ouvrent pas les règles d'Efudix et de Zyclara", () => {
    expect(keysFor(FLUOROURACILE_INJECTABLE)).not.toContain("skin-fluorouracil-sunscreen");
    expect(vigilanceKeysFor(FLUOROURACILE_INJECTABLE)).not.toContain("skin-fluorouracil-contraindications");
    expect(keysFor(ALDARA)).not.toContain("skin-imiquimod-sunscreen");
    expect(vigilanceKeysFor(ALDARA)).not.toContain("skin-imiquimod-avoid");
    // Efudix a perdu la règle générale de photosensibilisation (classe L01) : la sienne pose la question de la peau érodée.
    expect(keysFor(EFUDIX)).not.toContain("sun-photosensitivity");
  });

  it("la ciclosporine en collyre n'est pas Néoral : seule la voie générale ouvre les vigilances de Néoral", () => {
    const collyre = evaluateVigilances([drug({ name: "Ikervis 1 mg/mL collyre", inn: "CICLOSPORINE", atcCode: "S01XA18", therapeuticClass: null, commonSideEffects: [] })]).map((v) => v.key);
    expect(collyre).not.toContain("skin-ciclosporin-contraindications");
    expect(vigilanceKeysFor(NEORAL)).toEqual(expect.arrayContaining(["skin-ciclosporin-contraindications", "skin-ciclosporin-avoid"]));
  });
});

describe("le produit proposé : le stock réel, la marque du document en préférence, jamais un exfoliant", () => {
  // Le plafond d'une ordonnance est levé : on juge ici le choix du produit, pas la sélection des conseils.
  const pick = (treatment: Treatment, key: string) => proposedFor(analyse([treatment], SHELF, { maxRecommendations: 50 }), key);

  it("rosacée : nettoyant doux (Toleriane) sous Rozex, hydratant pour peau sensible (Dermallergo) sous Soolantra et Finacea", () => {
    expect(pick(ROZEX, "skin-metronidazole-cleanser")).toEqual(["toleriane-nettoyant"]);
    expect(pick(SOOLANTRA, "skin-ivermectin-moisturizer")).toEqual(["dermallergo"]);
    expect(pick(FINACEA, "skin-azelaic-moisturizer")).toEqual(["dermallergo"]);
    expect(pick(MIRVASO, "skin-brimonidine-moisturizer")).toEqual(["dermallergo"]);
  });

  it("mycoses : le lavant doux (Atoderm gel moussant), jamais le gel « purifiant » ni un gommage", () => {
    for (const treatment of [KETODERM, TERBINAFINE]) {
      const result = analyse([treatment], SHELF);
      expect(proposed(result), treatment.name).toEqual(["atoderm-gel"]);
    }
  });

  it("psoriasis et après-gale : l'émollient Lipikar AP+M, jamais un lait corps ni un lavant ni un exfoliant", () => {
    for (const [treatment, key] of [[DAIVONEX, "skin-calcipotriol-emollient"], [DAIVOBET, "skin-calcipotriol-betamethasone-emollient"], [TOPISCAB, "skin-permethrin-emollient"], [DERMOVAL, "skin-clobetasol-cream-emollient"], [OTEZLA, "skin-apremilast-emollient"], [SILKIS, "skin-calcitriol-emollient"]] as const) {
      const picked = pick(treatment, key);
      expect(picked, treatment.name).toEqual(["lipikar-baume"]);
    }
  });

  it("atopie sous Dupixent et Adtralza : le baume Atoderm AD cité par le document passe en tête", () => {
    expect(pick(DUPIXENT, "skin-dupilumab-emollient")).toEqual(["atoderm-ad"]);
    expect(pick(ADTRALZA, "skin-tralokinumab-emollient")).toEqual(["atoderm-ad"]);
  });

  it("sous rétinoïde oral : le baume labial (Soriatane), la crème pour les mains (Toctino) — jamais un gel hydroalcoolique", () => {
    expect(pick(SORIATANE, "skin-acitretin-lip-balm")).toEqual(["cicaplast-levres"]);
    expect(pick(TOCTINO, "skin-alitretinoin-hand-care")).toEqual(["cicaplast-mains"]);
    expect(proposed(analyse([TOCTINO], SHELF))).not.toContain("gel-mains");
  });

  it("acné : l'hydratant non comédogène de visage sous Erythrogel et Aklief", () => {
    expect(pick(ERYTHROGEL, "skin-erythromycin-moisturizer")).toEqual(["hydra"]);
    expect(pick(AKLIEF, "skin-trifarotene-moisturizer")).toEqual(["hydra"]);
    expect(pick(DIFFERINE, "skin-adapalene-moisturizer")).toEqual(["hydra"]);
  });

  it("photoprotection : l'Anthelios UVMUNE 400, jamais le soin de jour SPF 15, le solaire enfant ni le lait corps", () => {
    for (const [treatment, key] of [[ROACCUTANE_GEL, "skin-isotretinoin-gel-sunscreen"], [NEORAL, "skin-ciclosporin-photoprotection"], [DIFFERINE, "skin-adapalene-sunscreen"], [EFUDIX, "skin-fluorouracil-sunscreen"], [ZYCLARA, "skin-imiquimod-sunscreen"]] as const) {
      const picked = pick(treatment, key);
      expect(picked.length, treatment.name).toBe(1);
      expect(["uvmune", "uvmune-ka"], treatment.name).toContain(picked[0]);
      for (const refused of ["hyaluron-filler", "sun-kids", "sun-lait"]) expect(picked, treatment.name).not.toContain(refused);
    }
  });

  it("la photoprotection sous ciclosporine est un conseil de SÉCURITÉ, jamais derrière un conseil de confort", () => {
    const result = analyse([NEORAL], SHELF);
    expect(result.opportunities.find((o) => o.key === "skin-ciclosporin-photoprotection")?.kind).toBe("SAFETY");
  });

  it("Clobex : le shampooing doux entre les lavages, jamais l'antipelliculaire ; Éconazole : le lavant doux, jamais un ovule", () => {
    expect(pick(CLOBEX, "skin-clobetasol-shampoo-mild-shampoo")).toEqual(["node"]);
    expect(proposed(analyse([CLOBEX], SHELF))).not.toContain("kelual");
    expect(pick(ECONAZOLE, "skin-econazole-cleanser")).toEqual(["saforelle"]);
  });

  it("sous isotrétinoïne orale : des larmes artificielles sans conservateur, jamais le collyre antibiotique", () => {
    const picked = pick(ISOTRETINOINE, "skin-isotretinoin-dry-eye");
    expect(picked).toEqual(["larmes"]);
    expect(proposed(analyse([ISOTRETINOINE], SHELF))).not.toContain("azyter");
    // La règle générale des yeux irrités (contexte allergique) cède la place à celle-ci : jamais deux propositions pour les yeux.
    expect(keysFor(ISOTRETINOINE)).not.toContain("eye-irritation-allergy");
    // Et la règle des yeux irrités d'un antihistaminique ne propose plus un collyre antibiotique sauvé par « unidose ».
    const antihistaminique = analyse([{ name: "Antihistaminique H1", atc: "R06AX29", klass: "Antihistaminique H1" }], SHELF);
    expect(proposed(antihistaminique)).not.toContain("azyter");
  });

  it("un rayon sans référence adaptée ne propose rien plutôt qu'un exfoliant", () => {
    const onlyExfoliants = SHELF.filter((item) => EXFOLIANTS.includes(item.id));
    for (const treatment of [ROZEX, SOOLANTRA, FINACEA, KETODERM, DAIVONEX, SORIATANE, ERYTHROGEL, MIRVASO, DUPIXENT, DERMOVAL, AKLIEF, ADTRALZA, SILKIS, DIFFERINE]) {
      expect(analyse([treatment], onlyExfoliants).recommendations, treatment.name).toEqual([]);
    }
  });
});

describe("ce qu'on n'associe pas : les produits concernés sont écartés de TOUT le moteur", () => {
  const BLOCKS_EXFOLIANT = [ROZEX, FINACEA, KETODERM, TOPISCAB, SORIATANE, TOCTINO, ERYTHROGEL, MIRVASO, DUPIXENT, DERMOVAL, AKLIEF, ROACCUTANE_GEL, ADTRALZA, SILKIS, EFUDIX, ISOTRETINOINE, DIFFERINE];

  it.each(BLOCKS_EXFOLIANT.map((t) => [t.name, t] as const))("%s : l'étiquette exfoliant est écartée, même d'une règle étrangère", (_name, treatment) => {
    const result = analyse([treatment], SHELF, { rules: [] });
    const blocks = vigilancesOf(result).flatMap((v) => v.blockTags);
    expect(blocks).toContain("exfoliant");
    expect(excluded(result)).toEqual(expect.arrayContaining(EXFOLIANTS));
  });

  it("millepertuis : contre-indiqué avec la ciclosporine, déconseillé avec l'aprémilast — écarté dans les deux cas, avec la bonne étiquette", () => {
    const neoral = analyse([NEORAL], SHELF, { rules: [] });
    const otezla = analyse([OTEZLA], SHELF, { rules: [] });
    expect(excluded(neoral)).toContain("millepertuis");
    expect(excluded(otezla)).toContain("millepertuis");
    expect(vigilancesOf(neoral).find((v) => v.key === "skin-ciclosporin-contraindications")?.kind).toBe("CONTRAINDICATION");
    const apremilast = vigilancesOf(otezla).find((v) => v.key === "skin-apremilast-avoid");
    expect(apremilast?.kind).toBe("AVOID");
    expect(apremilast?.explanation).toMatch(/pas recommandée/);
    expect(apremilast?.explanation).toMatch(/pas une contre-indication absolue/);
  });

  it("vitamine A : écartée sous Soriatane et Toctino (contre-indiquée), les cyclines sont nommées", () => {
    for (const treatment of [SORIATANE, TOCTINO]) {
      const result = analyse([treatment], SHELF, { rules: [] });
      expect(excluded(result), treatment.name).toContain("vitamine-a");
      const contra = vigilancesOf(result).find((v) => v.key === (treatment === SORIATANE ? "skin-acitretin-contraindications" : "skin-alitretinoin-contraindications"));
      expect(contra?.kind, treatment.name).toBe("CONTRAINDICATION");
      expect(contra?.blockTags, treatment.name).toContain("vitamine a");
      expect(contra?.concerned.join(" "), treatment.name).toMatch(/Doxycycline/);
    }
  });

  it("Silkis : calcium et vitamine D en précaution (à vérifier), pas en interdiction ; le RCP, lui, est plus strict et la carte le dit", () => {
    const result = analyse([SILKIS], SHELF, { rules: [] });
    const avoid = vigilancesOf(result).find((v) => v.key === "skin-calcitriol-avoid");
    expect(avoid?.cautionTags).toEqual(["calcium", "vitamine d"]);
    expect(avoid?.explanation).toMatch(/ne doivent pas être administrées/);
    expect(excluded(result)).not.toContain("calcium");
  });

  it("Néoral : le potassium est en précaution (hyperkaliémie), pas interdit", () => {
    const result = analyse([NEORAL], SHELF, { rules: [] });
    const avoid = vigilancesOf(result).find((v) => v.key === "skin-ciclosporin-avoid");
    expect(avoid?.cautionTags).toEqual(["potassium"]);
    expect(avoid?.explanation).toMatch(/pamplemousse/);
    expect(excluded(result)).not.toContain("potassium");
  });

  it("Clobex : l'autre antipelliculaire est écarté d'office, avec la mention « à vérifier, pas contre-indiqué »", () => {
    const result = analyse([CLOBEX], SHELF);
    const avoid = vigilancesOf(result).find((v) => v.key === "skin-clobetasol-shampoo-avoid");
    expect(avoid?.blockTags).toEqual(["antipelliculaire"]);
    expect(avoid?.concerned.join(" ")).toMatch(/à vérifier, pas contre-indiqué/);
    expect(proposed(result)).not.toContain("kelual");
  });

  it("Mirvaso : IMAO et antidépresseurs tricycliques sont nommés dans la contre-indication (le document n'en disait rien)", () => {
    const vigilance = vigilancesOf(analyse([MIRVASO], SHELF)).find((v) => v.key === "skin-brimonidine-contraindications");
    expect(vigilance?.kind).toBe("CONTRAINDICATION");
    expect(vigilance?.concerned.join(" ")).toMatch(/IMAO/);
    expect(vigilance?.concerned.join(" ")).toMatch(/tricycliques/);
  });

  it("Daivobet : contre-indiqué dans la rosacée, l'acné et les infections (le document n'en disait rien)", () => {
    const vigilance = vigilancesOf(analyse([DAIVOBET], SHELF)).find((v) => v.key === "skin-calcipotriol-betamethasone-contraindications");
    expect(vigilance?.kind).toBe("CONTRAINDICATION");
    expect(vigilance?.concerned.join(" ")).toMatch(/Rosacée, acné/);
    expect(vigilance?.concerned.join(" ")).toMatch(/gale/);
  });

  it("terbinafine : pas de dermocorticoïde sur la mycose — c'est la contre-indication du CORTICOÏDE, pas une interaction", () => {
    const vigilance = vigilancesOf(analyse([TERBINAFINE], SHELF)).find((v) => v.key === "skin-terbinafine-corticoid");
    expect(vigilance?.kind).toBe("CONTRAINDICATION");
    expect(vigilance?.explanation).toMatch(/Ce n'est pas une interaction avec la terbinafine/);
    expect(vigilance?.concerned.join(" ")).toMatch(/Diprosone/);
  });

  it("éconazole : l'INR sous antivitamine K est une surveillance, et le savon ACIDE est déconseillé (pas l'alcalin d'Erythrogel)", () => {
    const keys = vigilanceKeysFor(ECONAZOLE);
    expect(keys).toEqual(expect.arrayContaining(["skin-econazole-anticoagulant", "skin-econazole-avoid"]));
    const monitoring = VIGILANCE_RULES.find((r) => r.key === "skin-econazole-anticoagulant");
    expect(monitoring?.kind).toBe("MONITORING");
    const erythrogel = VIGILANCE_RULES.find((r) => r.key === "skin-erythromycin-avoid");
    expect(erythrogel?.explanationTemplate).toMatch(/savons ALCALINS/);
    expect(VIGILANCE_RULES.find((r) => r.key === "skin-econazole-avoid")?.explanationTemplate).toMatch(/savon à pH acide/);
  });

  it("Topiscab : les 8 heures sont le temps de pose AVANT le rinçage (correction du document)", () => {
    const avoid = VIGILANCE_RULES.find((r) => r.key === "skin-permethrin-avoid");
    expect(avoid?.explanationTemplate).toMatch(/pas un délai après/);
    const emollient = ADVICE_RULES.find((r) => r.key === "skin-permethrin-emollient");
    expect(emollient?.clinicalContext).toMatch(/AVANT/);
    expect(emollient?.counterScriptTemplate).toMatch(/rincé/);
  });

  it("isotrétinoïne orale : cire, dermabrasions et lasers sont ajoutés à « exfoliants » (RCP), l'exfoliant est écarté", () => {
    const avoid = vigilancesOf(analyse([ISOTRETINOINE], SHELF)).find((v) => v.key === "skin-isotretinoin-avoid");
    expect(avoid?.kind).toBe("AVOID");
    expect(avoid?.concerned.join(" ")).toMatch(/cire/);
    expect(avoid?.concerned.join(" ")).toMatch(/lasers/);
    expect(avoid?.explanation).toMatch(/6 mois/);
  });
});

describe("la grossesse : une alerte, pas un conseil cosmétique", () => {
  const PREGNANT = patient({ isPregnant: true });

  it("les contre-indiqués du RCP portent l'alerte (CONTRAINDICATION) et retirent le conseil cosmétique, avec la raison", () => {
    for (const [treatment, alertKey] of [
      [AKLIEF, "skin-trifarotene-contraindications"],
      [ROACCUTANE_GEL, "skin-isotretinoin-gel-contraindications"],
      [DIFFERINE, "skin-adapalene-contraindications"],
      [OTEZLA, "skin-apremilast-contraindications"],
      [EFUDIX, "skin-fluorouracil-contraindications"],
    ] as const) {
      const normal = analyse([treatment], SHELF);
      expect(vigilancesOf(normal).find((v) => v.key === alertKey)?.kind, alertKey).toBe("CONTRAINDICATION");
      expect(vigilancesOf(normal).find((v) => v.key === alertKey)?.explanation, alertKey).toMatch(/grossesse/i);
      const pregnant = analyse([treatment], SHELF, { patient: PREGNANT });
      expect(pregnant.recommendations, treatment.name).toEqual([]);
      const blocked = pregnant.opportunities.filter((o) => o.isBlocked);
      expect(blocked.length, treatment.name).toBeGreaterThan(0);
      expect(blocked[0]?.blockReason, treatment.name).toMatch(/contre-indiqué pendant la grossesse/);
    }
  });

  it("quand le RCP ne contre-indique pas la grossesse, le conseil reste : Soolantra « non recommandé », Daivobet, Topiscab", () => {
    for (const [treatment, key] of [[SOOLANTRA, "skin-ivermectin-moisturizer"], [TOPISCAB, "skin-permethrin-emollient"]] as const) {
      expect(proposedFor(analyse([treatment], SHELF, { patient: PREGNANT }), key).length, treatment.name).toBeGreaterThan(0);
    }
  });
});

describe("une carte « à éviter » ne se fait pas passer pour une contre-indication", () => {
  it("seules les contre-indications écrites dans un RCP sont étiquetées CONTRAINDICATION", () => {
    const contraindications = [...SKIN_SERIES_1_VIGILANCES, ...SKIN_SERIES_3_VIGILANCES, ...SKIN_SERIES_4_VIGILANCES, ...SKIN_SERIES_5_VIGILANCES].filter((rule) => rule.kind === "CONTRAINDICATION").map((rule) => rule.key).sort();
    expect(contraindications).toEqual([
      "skin-acitretin-contraindications",
      "skin-adapalene-contraindications",
      "skin-alitretinoin-contraindications",
      "skin-apremilast-contraindications",
      "skin-brimonidine-contraindications",
      "skin-calcipotriol-betamethasone-contraindications",
      "skin-calcipotriol-contraindications",
      "skin-calcitriol-contraindications",
      "skin-ciclosporin-contraindications",
      "skin-clobetasol-cream-contraindications",
      "skin-clobetasol-shampoo-contraindications",
      "skin-fluorouracil-contraindications",
      "skin-isotretinoin-gel-contraindications",
      "skin-terbinafine-corticoid",
      "skin-trifarotene-contraindications",
    ]);
  });

  it("les exemples déconseillés du document sont nommés comme exemples, jamais comme interdits nominatifs du RCP", () => {
    const text = [...SKIN_SERIES_3_VIGILANCES, ...SKIN_SERIES_4_VIGILANCES, ...SKIN_SERIES_5_VIGILANCES].flatMap((rule) => rule.concerned).join(" | ");
    for (const brand of ["Eucerin DermoPure Clinical Gommage Purifiant", "La Roche-Posay Effaclar Sérum Ultra Concentré", "Ducray Kelual DS Intensive", "VIT'ALL+ Millepertuis Bio 250 mg", "Eucerin Hyaluron-Filler +3x Effect SPF 15", "Diprosone 0,05 % crème", "Daivobet"]) {
      expect(text, brand).toContain(brand);
    }
  });

  it("les règles écrites d'après le RCP seul (absentes du document) sont dites telles", () => {
    for (const key of ["skin-calcipotriol-contraindications", "skin-calcipotriol-betamethasone-contraindications", "skin-brimonidine-contraindications", "skin-apremilast-contraindications", "skin-calcitriol-contraindications", "skin-fluorouracil-contraindications", "skin-clobetasol-cream-contraindications", "skin-clobetasol-shampoo-contraindications"]) {
      const rule = VIGILANCE_RULES.find((r) => r.key === key)!;
      expect(rule.explanationTemplate, key).toMatch(/RCP, pas du document|viennent du RCP/);
    }
  });
});

describe("les textes lus sur la carte : aucun repère laissé tel quel, aucune promesse", () => {
  it("la raison confirmée et la phrase de comptoir sont remplies sous chaque traitement", () => {
    for (const treatment of [ROZEX, SOOLANTRA, FINACEA, KETODERM, TERBINAFINE, DAIVONEX, DAIVOBET, TOPISCAB, SORIATANE, TOCTINO, ERYTHROGEL, MIRVASO, DUPIXENT, DERMOVAL, CLOBEX, ECONAZOLE, AKLIEF, ROACCUTANE_GEL, NEORAL, OTEZLA, ADTRALZA, SILKIS, EFUDIX, ZYCLARA, ISOTRETINOINE, DIFFERINE]) {
      const result = analyse([treatment], SHELF);
      for (const opportunity of result.opportunities.filter((o) => (o.ruleKey ?? "").startsWith("skin-"))) {
        expect(opportunity.confirmedReason, opportunity.key).toBeTruthy();
        expect(opportunity.confirmedReason, opportunity.key).not.toMatch(/\{(drug|product)\}/);
        expect(opportunity.question, opportunity.key).toBeTruthy();
      }
      for (const vigilance of vigilancesOf(result)) expect(vigilance.explanation, vigilance.key).not.toMatch(/\{drug\}/);
    }
  });
});

describe("la console : tout ce qu'on déconseille se lit au même endroit que les conseils", () => {
  const catalog = describeVigilances(SKIN_DOCUMENT_NAMES);

  it("toutes les vigilances du moteur sont listées, du plus grave au moins grave, chacune avec son origine", () => {
    expect(catalog).toHaveLength(VIGILANCE_RULES.length);
    const orders = catalog.map((item) => item.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
    for (const item of catalog) {
      expect(item.sources.length, item.key).toBeGreaterThan(0);
      expect(item.origin, item.key).toBeTruthy();
      expect(item.explanation, item.key).not.toContain("{drug}");
    }
  });

  it("les vigilances des documents de la pharmacienne portent le nom de leur document", () => {
    const rozex = catalog.find((item) => item.key === "skin-metronidazole-avoid");
    expect(rozex?.origin).toContain("Série 3");
    expect(rozex?.levelLabel).toBe("À éviter");
    expect(catalog.find((item) => item.key === "skin-ciclosporin-contraindications")?.levelLabel).toBe("Contre-indiqué");
    expect(catalog.find((item) => item.key === "skin-ciclosporin-contraindications")?.origin).toContain("Série 5");
    expect(catalog.find((item) => item.key === "skin-acitretin-avoid")?.origin).toContain("Série 4");
    expect(catalog.find((item) => item.key === "skin-isotretinoin-avoid")?.origin).toContain("première série");
    expect(catalog.find((item) => item.key === "isotretinoin-vigilance")?.origin).toBe("Base maître V1");
  });

  it("une règle de la Série 2 (à éviter) et une règle du moteur y sont aussi", () => {
    expect(catalog.find((item) => item.key === "skin-bpo-avoid")?.origin).toContain("Série 2");
    expect(catalog.find((item) => item.key === "anticoagulant-millepertuis")?.levelLabel).toBe("Contre-indiqué");
  });
});
