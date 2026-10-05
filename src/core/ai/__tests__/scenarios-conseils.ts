import { runAnalysisPipeline, type PipelineInput } from "../pipeline";
import { deriveUnderstanding, type DrugClassification } from "../../understanding";
import type { AnalysisResult, CatalogProduct, PatientContext } from "../types";
import { drug, patient, product } from "./fixtures";

/**
 * Des ordonnances types, rejouées de bout en bout dans le moteur pur, avec un
 * rayon où plusieurs références répondent au même besoin : c'est le terrain où
 * le choix du conseil principal est le plus exposé (départage, routine, gamme,
 * limite, produit associé). Elles servent à prouver que l'ajout des
 * alternatives ne change JAMAIS ce que le moteur retient comme conseil.
 */

type Treatment = { name: string; atc: string; klass: string };

function classify(treatments: Treatment[]): DrugClassification[] {
  return treatments.map((treatment, index) => ({
    lineIndex: index,
    substance: treatment.name.toUpperCase(),
    atcCode: treatment.atc,
    therapeuticClass: treatment.klass,
    commonSideEffects: [],
    confidence: 0.95,
    source: "MODEL" as const,
  }));
}

function understandingFor(treatments: Treatment[], who: PatientContext) {
  return deriveUnderstanding({
    drugs: classify(treatments),
    patient: { ageYears: who.ageYears, sex: who.sex, isPregnant: who.isPregnant, isBreastfeeding: who.isBreastfeeding },
    providerId: "test",
    model: "m",
  });
}

export function analyse(
  treatments: Treatment[],
  catalog: CatalogProduct[],
  options: Partial<PipelineInput> = {},
): AnalysisResult {
  const who = options.patient ?? patient();
  return runAnalysisPipeline({
    lines: treatments.map((treatment, index) => ({ lineIndex: index, drugName: treatment.name, posology: null, durationDays: null, confirmed: true })),
    knowledge: new Map(
      treatments.map((treatment) => [
        treatment.name.toLowerCase(),
        drug({ name: treatment.name, inn: treatment.name.toUpperCase(), atcCode: treatment.atc, therapeuticClass: treatment.klass, commonSideEffects: [] }),
      ]),
    ),
    patient: who,
    catalog,
    rules: [],
    history: {},
    explanations: [],
    extractionFindings: [],
    understanding: understandingFor(treatments, who),
    usedSimulatedProviders: false,
    ...options,
  });
}

// --- Les traitements ---------------------------------------------------------
const PARACETAMOL: Treatment = { name: "Paracetamol 1 g", atc: "N02BE01", klass: "Antalgique antipyrétique" };
export const ROXITHROMYCINE: Treatment = { name: "Roxithromycine 150", atc: "J01FA06", klass: "Antibiotique macrolide" };
export const AMOXICILLINE: Treatment = { name: "Amoxicilline 1 g", atc: "J01CA04", klass: "Antibiotique pénicilline" };
const ANTITUSSIF: Treatment = { name: "Antitussif sirop", atc: "R05DA09", klass: "Antitussif opioïde" };
const ANTIHISTAMINIQUE: Treatment = { name: "Antihistaminique H1", atc: "R06AX29", klass: "Antihistaminique H1" };
const IBUPROFENE: Treatment = { name: "Ibuprofene 400", atc: "M01AE01", klass: "Anti-inflammatoire non stéroïdien" };
const CORTICOIDE_CREME: Treatment = { name: "Corticoïde crème", atc: "D07AC01", klass: "Corticoïde topique" };
const LEVOTHYROXINE: Treatment = { name: "Levothyroxine 75", atc: "H03AA01", klass: "Hormone thyroïdienne" };
const IPP: Treatment = { name: "Esomeprazole 20", atc: "A02BC05", klass: "Inhibiteur de la pompe à protons" };
export const SPIRONOLACTONE: Treatment = { name: "Spironolactone 25", atc: "C03DA01", klass: "Diurétique épargneur de potassium" };
const ISOTRETINOINE: Treatment = { name: "Isotretinoine 10", atc: "D10BA01", klass: "Rétinoïde oral" };
const OPIOIDE: Treatment = { name: "Tramadol 50", atc: "N02AX02", klass: "Antalgique opioïde" };

// --- Le rayon ----------------------------------------------------------------
const PROBIOTIC_TAGS = ["probiotique", "flore intestinale", "tolérance digestive"];

/** Six références qui répondent à la tolérance digestive, plus ou moins adaptées. */
export function probioticShelf(): CatalogProduct[] {
  const probiotic = (id: string, name: string, overrides: Partial<CatalogProduct> = {}) =>
    product({ id, name, category: "PROBIOTIQUES", matchingTags: PROBIOTIC_TAGS, commercialClaims: [], stockQuantity: 12, ...overrides });
  return [
    probiotic("probio-a", "Ferments lactiques 10 souches", { purchasePriceCents: 620, salePriceCents: 1490 }),
    probiotic("probio-b", "Probiotique Lactobacillus 5 milliards", { purchasePriceCents: 900, salePriceCents: 1490 }),
    probiotic("probio-c", "Flore intestinale confort", { matchingTags: ["probiotique", "flore intestinale"], stockQuantity: 3 }),
    probiotic("probio-d", "Levure Saccharomyces boulardii", { matchingTags: ["probiotique"], salePriceCents: 1190 }),
    probiotic("probio-e", "Probiotique voyage", { matchingTags: ["probiotique", "tolérance digestive"], precautions: ["À conserver au frais."] }),
    probiotic("probio-f", "Probiotique en rupture", { stockQuantity: 0 }),
  ];
}

const nasal = (id: string, name: string, overrides: Partial<CatalogProduct> = {}) =>
  product({ id, name, category: "SOINS", subCategory: null, matchingTags: ["nez", "nasal", "eau de mer", "spray nasal", "orl"], commercialClaims: [], stockQuantity: 9, salePriceCents: 790, ...overrides });

export function nasalShelf(): CatalogProduct[] {
  return [
    nasal("nasal-spray", "Spray nasal eau de mer isotonique"),
    nasal("nasal-hyper", "Spray nasal eau de mer hypertonique décongestion"),
    nasal("nasal-flacon", "Sérum physiologique flacon 500 ml", { matchingTags: ["nez", "nasal", "lavage", "eau de mer"] }),
    product({ id: "nasal-seringue", name: "Seringue nasale de lavage", category: "DISPOSITIFS_MEDICAUX", subCategory: null, matchingTags: ["lavage nasal"], commercialClaims: [], stockQuantity: 4, salePriceCents: 590 }),
  ];
}

function otherShelf(): CatalogProduct[] {
  const make = (id: string, name: string, category: CatalogProduct["category"], tags: string[], overrides: Partial<CatalogProduct> = {}) =>
    product({ id, name, category, subCategory: null, matchingTags: tags, commercialClaims: [], stockQuantity: 6, ...overrides });
  return [
    make("thermo-a", "Thermomètre frontal", "DISPOSITIFS_MEDICAUX", ["thermomètre", "fièvre", "mesure"], { stockQuantity: 3 }),
    make("thermo-b", "Thermomètre auriculaire", "DISPOSITIFS_MEDICAUX", ["thermomètre", "fièvre", "mesure"]),
    make("gorge-a", "Pastilles gorge irritée miel", "SOINS", ["gorge", "irritée", "pastilles"]),
    make("eyes-a", "Larmes artificielles", "SOINS", ["yeux", "oculaire", "collyre", "larmes"]),
    make("eyes-b", "Collyre apaisant monodoses", "SOINS", ["yeux", "oculaire", "collyre", "apaisant"]),
    make("emol-a", "Crème émolliente", "DERMOCOSMETIQUE", ["hydratation", "peau sensible", "émollient", "apaisant"]),
    make("emol-b", "Baume émollient peaux sèches", "DERMOCOSMETIQUE", ["hydratation", "émollient"]),
    make("emol-c", "Lait hydratant corps", "DERMOCOSMETIQUE", ["hydratation", "peau sensible"], { purchasePriceCents: 300, salePriceCents: 1290 }),
    make("gastric-a", "Gel gastrique", "SOINS", ["confort gastrique", "estomac", "digestion"]),
    make("gastric-b", "Pansement gastrique sachets", "SOINS", ["confort gastrique", "estomac"]),
    make("shampoo", "Shampooing doux", "HYGIENE", ["shampooing", "doux"], { stockQuantity: 40 }),
  ];
}

const magnesium = (id: string, name: string, overrides: Partial<CatalogProduct> = {}) =>
  product({ id, name, category: "MAGNESIUM", subCategory: null, matchingTags: ["magnésium", "fatigue", "crampes"], commercialClaims: [], stockQuantity: 12, salePriceCents: 890, ...overrides });

const derm = (id: string, name: string, brand: string, tags: string[], price = 1290) =>
  product({ id, name, brand, category: "DERMOCOSMETIQUE", subCategory: null, matchingTags: tags, commercialClaims: [], stockQuantity: 6, salePriceCents: price });

const CLEANSE = ["nettoyant", "visage"];
const HYDRATE = ["hydratation", "peau sensible", "apaisant", "émollient"];
const PROTECT = ["protection solaire", "spf", "photoprotection"];

function routineShelf(): CatalogProduct[] {
  return [
    derm("e1", "EUCERIN DERMOPURE gel nettoyant 200 ml", "Eucerin", CLEANSE),
    derm("e2", "EUCERIN DERMOPURE hydra repair crème visage 50 ml", "Eucerin", HYDRATE),
    derm("e3", "EUCERIN SUN oil control SPF 50+ visage", "Eucerin", PROTECT),
    derm("l1", "LA ROCHE-POSAY effaclar gel moussant purifiant", "La Roche-Posay", CLEANSE),
    derm("l2", "LA ROCHE-POSAY toleriane sensitive crème visage", "La Roche-Posay", HYDRATE),
    derm("l3", "LA ROCHE-POSAY anthelios SPF 50+ fluide visage", "La Roche-Posay", PROTECT),
    derm("a1", "AVENE cleanance gel nettoyant visage", "Avène", CLEANSE),
    derm("a2", "AVENE hydrance crème visage", "Avène", HYDRATE),
    derm("lip", "CERALIP baume lèvres réparateur", "La Roche-Posay", ["lèvres", "baume"]),
    derm("lip-b", "NUXE rêve de miel baume lèvres", "Nuxe", ["lèvres", "baume"]),
    derm("vita", "ARKOVITAL vitamine A", "Arkopharma", ["vitamine a"]),
  ];
}

function preferBrand(brand: string): PipelineInput["rules"][number] {
  return { id: `prefer-${brand}`, type: "PREFER_BRAND", productId: null, category: null, brand, context: {}, weight: 1 };
}

const FULL_SHELF = [...probioticShelf(), ...nasalShelf(), ...otherShelf()];

type Scenario = { name: string; run: () => AnalysisResult };

/** Les scénarios rejoués avant/après : leur nom est la clé de la valeur attendue. */
export const SCENARIOS: Scenario[] = [
  { name: "orl-antibiotique-rayon-complet", run: () => analyse([PARACETAMOL, ROXITHROMYCINE, ANTITUSSIF], FULL_SHELF) },
  { name: "antibiotique-seul-references-equivalentes", run: () => analyse([AMOXICILLINE], probioticShelf()) },
  {
    name: "antibiotique-preference-officine-produit",
    run: () => analyse([AMOXICILLINE], probioticShelf(), { rules: [{ id: "r1", type: "PREFER_PRODUCT", productId: "probio-b", category: null, context: {}, weight: 1 }] }),
  },
  {
    name: "antibiotique-marque-et-exclusion",
    run: () =>
      analyse([AMOXICILLINE], probioticShelf(), {
        rules: [{ id: "r2", type: "EXCLUDE_PRODUCT", productId: "probio-a", category: null, context: {}, weight: 1 }, preferBrand("Vitalys")],
      }),
  },
  {
    name: "antibiotique-historique-de-validation",
    run: () => analyse([AMOXICILLINE], probioticShelf(), { history: { "probio-b": { proposed: 10, accepted: 9, purchased: 8 }, "probio-a": { proposed: 10, accepted: 2, purchased: 1 } } }),
  },
  {
    name: "antibiotique-date-courte",
    run: () =>
      analyse(
        [AMOXICILLINE],
        probioticShelf().map((item) => (item.id === "probio-b" ? { ...item, shortDate: { expiresOn: "2026-11-20", daysLeft: 40, level: "SOON" as const } } : item)),
      ),
  },
  { name: "antibiotique-patient-allergique", run: () => analyse([AMOXICILLINE], [...probioticShelf(), product({ id: "probio-lactose", name: "Probiotique lacté", category: "PROBIOTIQUES", matchingTags: [...PROBIOTIC_TAGS, "lactose"], commercialClaims: [] })], { patient: patient({ allergies: ["lactose"] }) }) },
  {
    name: "antibiotique-contre-indication-declaree",
    run: () =>
      analyse(
        [AMOXICILLINE],
        probioticShelf().map((item) => (item.id === "probio-a" ? { ...item, vigilances: [{ population: "PREGNANCY", level: "CONTRAINDICATION" as const, note: null }] } : item)),
        { patient: patient({ isPregnant: true }) },
      ),
  },
  {
    name: "serum-flacon-principal-d-un-besoin-candidat-d-un-autre",
    run: () => analyse([ANTIHISTAMINIQUE], [nasal("nasal-flacon", "Sérum physiologique flacon 500 ml", { matchingTags: ["nez", "nasal", "lavage", "eau de mer", "orl", "spray nasal"] }), otherShelf()[3], nasalShelf()[3]]),
  },
  {
    name: "nasal-flacon-avec-seringue-associee",
    run: () => analyse([ANTIHISTAMINIQUE], [nasal("nasal-flacon", "Sérum physiologique flacon 500 ml", { matchingTags: ["nez", "nasal", "lavage", "eau de mer", "orl", "spray nasal"] }), nasal("nasal-flacon-b", "Eau de mer flacon 250 ml", { stockQuantity: 5 }), nasal("nasal-spray", "Spray nasal eau de mer isotonique", { matchingTags: ["nez", "nasal", "eau de mer"] }), nasalShelf()[3]]),
  },
  { name: "ibuprofene-protection-gastrique", run: () => analyse([IBUPROFENE], FULL_SHELF) },
  { name: "allergie-collyres", run: () => analyse([ANTIHISTAMINIQUE], FULL_SHELF) },
  { name: "dermatologie-emollients", run: () => analyse([CORTICOIDE_CREME], FULL_SHELF) },
  { name: "levothyroxine-ipp-magnesium", run: () => analyse([LEVOTHYROXINE, IPP], [magnesium("mag-a", "MAG 2 magnésium marin 60 comprimés"), magnesium("mag-b", "Magnésium B6 comprimés", { salePriceCents: 790 }), magnesium("mag-c", "Magné vital fatigue", { matchingTags: ["magnésium", "fatigue"] })]) },
  {
    name: "spironolactone-potassium-ecarte",
    run: () => analyse([SPIRONOLACTONE], [product({ id: "k", name: "POTASSIUM 600 mg gélules", category: "MINERAUX", subCategory: null, matchingTags: ["potassium"], commercialClaims: [], stockQuantity: 5 }), magnesium("mag-a", "MAG 2 magnésium marin"), magnesium("mag-b", "Magnésium B6")]),
  },
  { name: "isotretinoine-routine", run: () => analyse([ISOTRETINOINE], routineShelf()) },
  { name: "isotretinoine-gamme-eucerin", run: () => analyse([ISOTRETINOINE], routineShelf(), { rules: [preferBrand("Eucerin")] }) },
  { name: "isotretinoine-gamme-la-roche-posay", run: () => analyse([ISOTRETINOINE], routineShelf(), { rules: [preferBrand("La Roche-Posay")] }) },
  { name: "isotretinoine-etape-sans-reference", run: () => analyse([ISOTRETINOINE], routineShelf().filter((item) => item.id !== "e3" && item.id !== "l3")) },
  { name: "ordonnance-chargee-limite-par-defaut", run: () => analyse([PARACETAMOL, ROXITHROMYCINE, ANTITUSSIF, IBUPROFENE, ANTIHISTAMINIQUE, CORTICOIDE_CREME, OPIOIDE], FULL_SHELF) },
  { name: "ordonnance-chargee-limite-deux", run: () => analyse([PARACETAMOL, ROXITHROMYCINE, ANTITUSSIF, IBUPROFENE, ANTIHISTAMINIQUE], FULL_SHELF, { maxRecommendations: 2 }) },
  { name: "deux-antibiotiques-meme-besoin", run: () => analyse([AMOXICILLINE, ROXITHROMYCINE], probioticShelf()) },
  { name: "rayon-en-rupture-partielle", run: () => analyse([ROXITHROMYCINE], probioticShelf().map((item) => ({ ...item, stockQuantity: item.id === "probio-a" ? 0 : item.stockQuantity }))) },
];
