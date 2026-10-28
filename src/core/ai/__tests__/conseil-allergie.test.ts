import { describe, expect, it } from "vitest";
import { runAnalysisPipeline } from "../pipeline";
import { classifiedDrugKnowledge } from "../classified-knowledge";
import { deriveUnderstanding, type DrugClassification } from "../../understanding";
import { classifyNationalDrug, classifyProductByName } from "../../catalog/product-vocabulary";
import { MAX_RECOMMENDATIONS_COUNTER_SCAN } from "@/config/constants";
import { patient, product } from "./fixtures";
import type { CatalogProduct, PatientContext } from "../types";

/**
 * Le conseil après un antihistaminique (retour du fondateur, pharmacien, 13 oct. 2026).
 *
 * Bip réel d'une CÉTIRIZINE 10 mg : PharmaBoost proposait un gel lubrifiant pour les yeux, puis un substitut salivaire
 * remboursé. « Tu aurais dû proposer exactement ça » : un collyre ANTI-ALLERGIQUE sans ordonnance, une eau de mer « nez
 * allergique » (ou un spray « rhinite allergique »), un comprimé à sucer pour la gorge.
 *
 * Le rayon de ces tests est construit comme le vrai : chaque référence est rangée par le dictionnaire d'usage (son libellé,
 * ou ses substances pour une boîte du catalogue national) — jamais étiquetée à la main pour le besoin du test. Aucun nom de
 * marque : le collyre est reconnu par sa substance, l'eau de mer et le spray par leur libellé.
 */

const CETIRIZINE: DrugClassification = { lineIndex: 0, substance: "DICHLORHYDRATE DE CÉTIRIZINE", atcCode: "R06AE07", therapeuticClass: "Antihistaminique H1", commonSideEffects: [], confidence: 1, source: "OFFICIAL" };
const ANTIBIOTIQUE: DrugClassification = { lineIndex: 0, substance: "ROXITHROMYCINE", atcCode: "J01FA06", therapeuticClass: "Antibiotique macrolide", commonSideEffects: [], confidence: 0.95, source: "MODEL" };
const ANTIDEPRESSEUR: DrugClassification = { lineIndex: 0, substance: "SERTRALINE", atcCode: "N06AB06", therapeuticClass: "Antidépresseur", commonSideEffects: [], confidence: 0.95, source: "MODEL" };
const AMITRIPTYLINE: DrugClassification = { lineIndex: 0, substance: "AMITRIPTYLINE", atcCode: "N06AA09", therapeuticClass: "Antidépresseur", commonSideEffects: [], confidence: 0.95, source: "MODEL" };
const OLOPATADINE_COLLYRE: DrugClassification = { lineIndex: 0, substance: "OLOPATADINE", atcCode: "S01GX09", therapeuticClass: "Antiallergique ophtalmique", commonSideEffects: [], confidence: 1, source: "OFFICIAL" };
const CROMOGLICATE_COLLYRE: DrugClassification = { lineIndex: 0, substance: "CROMOGLICATE DE SODIUM", atcCode: "S01GX01", therapeuticClass: "Antiallergique ophtalmique", commonSideEffects: [], confidence: 1, source: "OFFICIAL" };

/** Un produit de parapharmacie, rangé par son libellé comme à l'import du stock. */
function para(id: string, name: string, overrides: Partial<CatalogProduct> = {}): CatalogProduct {
  const understood = classifyProductByName(name);
  if (!understood) throw new Error(`« ${name} » n'est pas reconnu par le dictionnaire`);
  // Un code ACL de parapharmacie (3401…), pas un CIP de médicament (3400…).
  return product({ id, name, brand: null, ean: "3401000000017", category: understood.category, subCategory: null, description: null, matchingTags: understood.tags, commercialClaims: [], stockQuantity: 6, salePriceCents: 990, purchasePriceCents: 500, vatRate: 20, ...overrides });
}

/** Une boîte du catalogue national sans ordonnance, rangée par ses substances, comme `loadNationalDrugCandidates`. */
function boite(id: string, name: string, substances: string[], routes: string[]): CatalogProduct {
  const understood = classifyNationalDrug({ name, substances, routes });
  return product({
    id: `presentation:${id}`,
    origin: "NATIONAL_DRUG",
    presentationId: id,
    substances,
    prescriptionConditions: [],
    name,
    brand: null,
    category: understood?.category ?? "AUTRE",
    subCategory: null,
    description: name,
    commercialClaims: [],
    matchingTags: [...(understood?.tags ?? []), ...substances, name],
    salePriceCents: 790,
    purchasePriceCents: 0,
    vatRate: 0,
    stockQuantity: 5,
  });
}

// --- Ce que le fondateur a montré, en termes génériques -------------------------------------------------------------
const collyreAntiAllergique = boite("levo", "OPHTALEVO 0,05 %, collyre en solution en récipient unidose", ["CHLORHYDRATE DE LÉVOCABASTINE"], ["ophtalmique"]);
const nezAllergique = para("nez-allergique", "EAU DE MER NEZ ALLERGIQUE SPRAY 50ML");
const sprayRhiniteHE = para("spray-rhinite-he", "SPRAY NASAL RHINITE ALLERGIQUE AUX HUILES ESSENTIELLES 15ML");
const gorge = para("gorge", "COMPRIMES A SUCER GORGE MIEL CITRON X30");
// --- Ce qui était proposé, et ce qui reste en rayon -----------------------------------------------------------------
const gelLarmes = boite("gel", "GEL LARMES, gel ophtalmique en récipient unidose", ["CARBOMÈRE 974P"], ["ophtalmique"]);
const substitutSalivaire = para("salivaire", "SUBSTITUT SALIVAIRE SPRAY BUCCAL 40ML", { reimbursed: true, reimbursementSource: "export : prestation AAD (LPP)", purchasePriceCents: 640, salePriceCents: 797 });
const eauDeMer = para("eau-de-mer", "EAU DE MER ISOTONIQUE SPRAY NASAL 100ML");
const eauDeMerRhume = para("eau-de-mer-rhume", "EAU DE MER HYPERTONIQUE RHUME SPRAY NASAL 50ML");

const RAYON_COMPLET = [collyreAntiAllergique, nezAllergique, sprayRhiniteHE, gorge, gelLarmes, substitutSalivaire, eauDeMer, eauDeMerRhume];
const RAYON_SANS_ALLERGIE = [gelLarmes, substitutSalivaire, eauDeMer, eauDeMerRhume];

function analyse(drugs: DrugClassification[], catalog: CatalogProduct[], options: { patient?: PatientContext; max?: number; disabled?: string[] } = {}) {
  const who = options.patient ?? patient();
  const lines = drugs.map((drug, index) => ({ ...drug, lineIndex: index }));
  const understanding = deriveUnderstanding({ drugs: lines, patient: { ageYears: who.ageYears, sex: who.sex, isPregnant: who.isPregnant, isBreastfeeding: who.isBreastfeeding }, providerId: "test", model: "test" });
  return runAnalysisPipeline({
    maxRecommendations: options.max ?? MAX_RECOMMENDATIONS_COUNTER_SCAN,
    lines: lines.map((drug) => ({ lineIndex: drug.lineIndex, drugName: drug.substance!, posology: null, durationDays: null, confirmed: true })),
    knowledge: new Map(lines.map((drug) => [drug.substance!.toLowerCase(), classifiedDrugKnowledge({ key: drug.substance!.toLowerCase(), drugName: drug.substance!, form: null, classification: drug, publishedSubstance: drug.substance, model: "test" })])),
    patient: who,
    catalog,
    rules: [],
    history: {},
    explanations: [],
    extractionFindings: [],
    understanding,
    usedSimulatedProviders: false,
    disabledRuleKeys: options.disabled,
  });
}

const cards = (result: ReturnType<typeof analyse>) => Object.fromEntries(result.recommendations.map((r) => [r.opportunityKey, r.productId]));
const everyProposed = (result: ReturnType<typeof analyse>) => result.recommendations.flatMap((r) => [r.productId, ...(r.alternatives ?? []).map((a) => a.productId)]);
const notes = (result: ReturnType<typeof analyse>) => result.trace.find((s) => s.stage === "COMMERCIAL_OPTIMIZATION")?.notes.join(" ") ?? "";

describe("le dictionnaire d'usage reconnaît le produit de l'allergie, sans marque", () => {
  it("un collyre à la lévocabastine ou au cromoglicate est « anti-allergique », par sa substance", () => {
    expect(collyreAntiAllergique.matchingTags).toEqual(expect.arrayContaining(["anti-allergique", "allergie", "yeux"]));
    expect(collyreAntiAllergique.matchingTags).not.toContain("larmes");
    const cromoglicate = classifyNationalDrug({ name: "CROMO 2 %, collyre en solution", substances: ["CROMOGLICATE DE SODIUM"], routes: ["ophtalmique"] });
    expect(cromoglicate?.tags).toContain("anti-allergique");
    // Le gel lubrifiant reste un lubrifiant : il ne devient pas anti-allergique.
    expect(gelLarmes.matchingTags).not.toContain("anti-allergique");
  });

  it("un collyre anti-allergique de parapharmacie se reconnaît à son libellé ; un soin du contour des yeux, non", () => {
    expect(classifyProductByName("COLLYRE APAISANT ALLERGIES UNIDOSES X10")?.tags).toContain("anti-allergique");
    expect(classifyProductByName("CREME CONTOUR DES YEUX PEAUX ALLERGIQUES 15ML")?.tags ?? []).not.toContain("anti-allergique");
  });

  it("un médicament actif du nez (corticoïde, cromoglicate) n'est plus rangé comme un lavage nasal", () => {
    const corticoide = classifyNationalDrug({ name: "RHUME DES FOINS A LA BECLOMETASONE 50 microgrammes/dose, suspension pour pulvérisation nasale", substances: ["BÉCLOMÉTASONE (DIPROPIONATE DE)"], routes: ["nasale"] });
    expect(corticoide?.tags).toEqual([]);
    const cromoNasal = classifyNationalDrug({ name: "CROMO 2 %, solution pour pulvérisation nasale", substances: ["CROMOGLICATE DE SODIUM"], routes: ["nasale"] });
    expect(cromoNasal?.tags ?? []).not.toContain("lavage");
    expect(cromoNasal?.tags ?? []).not.toContain("anti-allergique");
  });
});

// La prise en charge globale (fondateur, 28 oct. 2026) : sous antihistaminique, le collyre et le nez forment une routine.
const EYES = "allergy-global-routine:eyes";
const NOSE = "allergy-global-routine:nose";

describe("CÉTIRIZINE seule, adulte : le conseil du fondateur", () => {
  it("au comptoir : la routine de l'allergie (collyre anti-allergique, eau de mer « nez allergique ») et le comprimé à sucer — ni gel lubrifiant, ni substitut salivaire", () => {
    const result = analyse([CETIRIZINE], RAYON_COMPLET);
    expect(cards(result)).toEqual({
      [NOSE]: "nez-allergique",
      [EYES]: "presentation:levo",
      "antihistamine-dry-throat": "gorge",
    });
    expect(result.recommendations.filter((r) => r.routine).map((r) => r.routine?.stepLabel)).toEqual(["Yeux", "Nez"]);
    const proposed = result.recommendations.map((r) => r.productId);
    expect(proposed).not.toContain("presentation:gel");
    expect(proposed).not.toContain("salivaire");
  });

  it("le spray « rhinite allergique » aux huiles essentielles reste en alternative du nez, avec sa vigilance à valider", () => {
    const nose = analyse([CETIRIZINE], RAYON_COMPLET).recommendations.find((r) => r.opportunityKey === NOSE);
    const spray = nose?.alternatives?.find((a) => a.productId === "spray-rhinite-he");
    expect(spray).toBeDefined();
    expect(spray?.vigilances?.map((v) => v.population)).toEqual(expect.arrayContaining(["ASTHMA", "EPILEPSY"]));
    // L'eau de mer, elle, ne porte aucune vigilance « huiles essentielles ».
    expect(nose?.vigilances ?? []).toEqual([]);
  });

  it("sans le « nez allergique », le spray « rhinite allergique » passe devant l'eau de mer générique", () => {
    const result = analyse([CETIRIZINE], [sprayRhiniteHE, eauDeMer]);
    expect(cards(result)["nasal-hygiene-orl"]).toBe("spray-rhinite-he");
  });

  it("à pertinence égale (eau de mer hypertonique, préférée nez bouché), la référence sans huiles essentielles passe devant : la moins signalée", () => {
    const nose = analyse([CETIRIZINE], [sprayRhiniteHE, eauDeMerRhume]).recommendations.find((r) => r.opportunityKey === "nasal-hygiene-orl");
    expect(nose?.productId).toBe("eau-de-mer-rhume");
    expect(nose?.alternatives?.map((a) => a.productId)).toEqual(["spray-rhinite-he"]);
  });

  it("analyse complète (8 conseils) : le gel et le substitut salivaire ne s'ajoutent pas en cartes à côté — ils ne sont que des replis", () => {
    const result = analyse([CETIRIZINE], RAYON_COMPLET, { max: 8 });
    expect(Object.keys(cards(result)).sort()).toEqual([EYES, NOSE, "antihistamine-dry-throat"]);
    expect(notes(result)).toContain("« eye-allergy-antiallergic-drops » : besoin déjà couvert par une étape de routine, non répété.");
    expect(notes(result)).toContain("« dry-mouth-hygiene » : repli non proposé, « antihistamine-dry-throat » a sa référence en rayon.");
  });

  it("pour la gorge : une pastille dont le nom ne parle pas de la gorge (stress), un antiseptique ou un sirop ne sont pas proposés", () => {
    const stress = para("stress", "PASTILLES FLEURS DE BACH STRESS FRUITS ROUGES");
    const antiseptique = boite("antiseptique", "GORGEMAX MIEL CITRON, pastille", ["AMYLMÉTACRÉSOL", "ALCOOL 2,4-DICHLOROBENZYLIQUE"], ["buccale"]);
    const sirop = para("sirop", "SIROP GORGE MIEL 150ML");
    const result = analyse([CETIRIZINE], [stress, antiseptique, sirop, substitutSalivaire], { max: 8 });
    // Ni pour la gorge, ni ailleurs : le dictionnaire lui donne « orl », et l'hygiène nasale écarte désormais les pastilles.
    expect(everyProposed(result)).not.toContain("stress");
    expect(everyProposed(result)).not.toContain("presentation:antiseptique");
    expect(everyProposed(result)).not.toContain("sirop");
    // Rien pour la gorge : le substitut salivaire revient, en repli.
    expect(cards(result)["dry-mouth-hygiene"]).toBe("salivaire");
  });

  it("la carte du collyre dit ce qu'il est, et porte les faits du RCP — pas « sans principe actif »", () => {
    const eye = analyse([CETIRIZINE], RAYON_COMPLET).recommendations.find((r) => r.opportunityKey === EYES);
    expect(eye?.routine?.stepLabel).toBe("Yeux");
    expect(eye?.precautions.join(" ")).toContain("pas plus de 5 jours sans avis médical");
    expect(eye?.counterScript).not.toMatch(/sans principe actif|lave l'œil/);
  });
});

describe("les garde-fous du patient restent", () => {
  it("enfant de 2 ans : aucun produit aux huiles essentielles, ni pastille ; le collyre médicamenteux laisse place au lavage", () => {
    const result = analyse([CETIRIZINE], RAYON_COMPLET, { patient: patient({ ageYears: 2 }), max: 8 });
    expect(everyProposed(result)).not.toContain("spray-rhinite-he");
    expect(everyProposed(result)).not.toContain("gorge");
    expect(result.opportunities.find((o) => o.key === "antihistamine-dry-throat")?.isBlocked).toBe(true);
    expect(cards(result)["nasal-hygiene-orl"]).toBe("nez-allergique");
    expect(result.opportunities.find((o) => o.key === "eye-allergy-antiallergic-drops")?.isBlocked).toBe(true);
    expect(cards(result)["eye-irritation-allergy"]).toBe("presentation:gel");
    // Le collyre anti-allergique n'est jamais présenté comme un lavage, même quand sa règle est bloquée.
    expect(everyProposed(result)).not.toContain("presentation:levo");
  });

  it("enfant de 8 ans : ni huiles essentielles, ni comprimé à sucer (âge minimal du produit inconnu, avant 12 ans) — le substitut salivaire revient", () => {
    const result = analyse([CETIRIZINE], RAYON_COMPLET, { patient: patient({ ageYears: 8 }), max: 8 });
    expect(everyProposed(result)).not.toContain("spray-rhinite-he");
    expect(everyProposed(result)).not.toContain("gorge");
    expect(result.opportunities.find((o) => o.key === "antihistamine-dry-throat")?.isBlocked).toBe(true);
    expect(cards(result)["dry-mouth-hygiene"]).toBe("salivaire");
  });

  it("dès 12 ans, le comprimé à sucer revient", () => {
    expect(cards(analyse([CETIRIZINE], RAYON_COMPLET, { patient: patient({ ageYears: 12 }) }))["antihistamine-dry-throat"]).toBe("gorge");
  });

  it("le nom « préféré » ne lève pas l'exclusion due au patient : sans eau de mer « allergie », l'enfant n'a pas le spray aux huiles essentielles", () => {
    const result = analyse([CETIRIZINE], [sprayRhiniteHE, eauDeMer], { patient: patient({ ageYears: 2 }) });
    expect(cards(result)["nasal-hygiene-orl"]).toBe("eau-de-mer");
    expect(everyProposed(result)).not.toContain("spray-rhinite-he");
  });

  it("grossesse, allaitement, asthme : pas d'huiles essentielles ; le collyre porte la prudence de son RCP", () => {
    for (const who of [patient({ isPregnant: true }), patient({ isBreastfeeding: true }), patient({ chronicConditions: ["asthme"] })]) {
      expect(everyProposed(analyse([CETIRIZINE], RAYON_COMPLET.filter((p) => p.id !== "nez-allergique"), { patient: who }))).not.toContain("spray-rhinite-he");
    }
    const eye = analyse([CETIRIZINE], RAYON_COMPLET, { patient: patient({ isBreastfeeding: true }) }).recommendations.find((r) => r.opportunityKey === EYES);
    expect(eye?.vigilances?.find((v) => v.population === "BREASTFEEDING")).toMatchObject({ level: "CAUTION", status: true });
  });

  it("une contre-indication « enfant » déclarée sur la fiche produit écarte la référence (garde-fou existant)", () => {
    const declared = { ...nezAllergique, contraindications: ["enfant de moins de 6 ans"] };
    const result = analyse([CETIRIZINE], [declared, eauDeMer], { patient: patient({ ageYears: 4 }) });
    expect(cards(result)["nasal-hygiene-orl"]).toBe("eau-de-mer");
  });
});

describe("sans produit de l'allergie en rayon : repli sur les produits d'avant", () => {
  it("gel lubrifiant pour les yeux, eau de mer du rhume pour le nez, substitut salivaire pour la bouche — comme avant", () => {
    const result = analyse([CETIRIZINE], RAYON_SANS_ALLERGIE);
    expect(cards(result)).toEqual({
      "nasal-hygiene-orl": "eau-de-mer-rhume",
      "eye-irritation-allergy": "presentation:gel",
      "dry-mouth-hygiene": "salivaire",
    });
  });

  it("la règle du collyre anti-allergique supprimée depuis la console : le lavage revient, sans jamais présenter le collyre comme un lavage", () => {
    // La routine aussi supprimée : sinon le collyre reste proposé dans son étape « Yeux », pour ce qu'il est.
    const result = analyse([CETIRIZINE], RAYON_COMPLET, { disabled: ["eye-allergy-antiallergic-drops", "allergy-global-routine"] });
    expect(cards(result)["eye-irritation-allergy"]).toBe("presentation:gel");
    expect(everyProposed(result)).not.toContain("presentation:levo");
  });
});

describe("les défauts relevés en relecture (13 oct. 2026)", () => {
  it("un collyre sur liste rangé parmi les produits de l'officine (code CIP 3400, conditions non lues) n'est jamais proposé, même étiqueté « anti-allergique »", () => {
    const listeI = product({ id: "allergodil", name: "ALLERGODIL 0,05% COLLYRE FL 6ML", ean: "3400936000000", brand: null, category: "SOINS", subCategory: null, description: null, commercialClaims: [], matchingTags: classifyProductByName("ALLERGODIL 0,05% COLLYRE FL 6ML")?.tags ?? [], stockQuantity: 4, salePriceCents: 900, purchasePriceCents: 400, vatRate: 10 });
    expect(listeI.matchingTags).toContain("anti-allergique");
    const result = analyse([CETIRIZINE], [listeI, gelLarmes], { max: 8 });
    expect(everyProposed(result)).not.toContain("allergodil");
    expect(cards(result)["eye-irritation-allergy"]).toBe("presentation:gel");
  });

  it("le collyre anti-allergique de parapharmacie (code ACL) reste proposé", () => {
    const para1 = para("collyre-allergies", "COLLYRE APAISANT ALLERGIES UNIDOSES X10");
    expect(cards(analyse([CETIRIZINE], [para1, gelLarmes]))["eye-allergy-antiallergic-drops"]).toBe("collyre-allergies");
  });

  it("AMITRIPTYLINE + CÉTIRIZINE : la bouche sèche de l'antidépresseur garde son substitut salivaire, à côté du comprimé à sucer", () => {
    for (const antidepresseur of [AMITRIPTYLINE, ANTIDEPRESSEUR]) {
      const result = analyse([antidepresseur, CETIRIZINE], RAYON_COMPLET, { max: 8 });
      expect(cards(result)["dry-mouth-hygiene"]).toBe("salivaire");
      expect(cards(result)["antihistamine-dry-throat"]).toBe("gorge");
    }
  });

  it("un collyre « allergie » ne sort jamais comme une hygiène nasale, quelles que soient ses étiquettes", () => {
    // Étiquettes de l'ancien dictionnaire, encore en base tant que les étiquettes n'ont pas été rafraîchies.
    const ancien = para("collyre-ancien", "COLLYRE APAISANT ALLERGIES UNIDOSES X10", { matchingTags: ["yeux", "oculaire", "collyre", "lavage", "larmes"] });
    const lavage = para("lavage-oculaire", "LAVAGE OCULAIRE ALLERGIES UNIDOSES X10");
    for (const rayon of [[ancien], [ancien, eauDeMer], [lavage], [lavage, eauDeMer]]) {
      const nose = analyse([CETIRIZINE], rayon, { max: 8 }).recommendations.find((r) => r.opportunityKey === "nasal-hygiene-orl");
      expect([nose?.productId, ...(nose?.alternatives ?? []).map((a) => a.productId)]).not.toContain("collyre-ancien");
      expect([nose?.productId, ...(nose?.alternatives ?? []).map((a) => a.productId)]).not.toContain("lavage-oculaire");
    }
  });

  it("un collyre anti-allergique déjà sur la vente (olopatadine, cromoglicate) : pas de second, le lubrifiant reste", () => {
    for (const collyre of [OLOPATADINE_COLLYRE, CROMOGLICATE_COLLYRE]) {
      const result = analyse([CETIRIZINE, collyre], RAYON_COMPLET, { max: 8 });
      expect(result.opportunities.find((o) => o.key === "eye-allergy-antiallergic-drops")?.isBlocked).toBe(true);
      expect(everyProposed(result)).not.toContain("presentation:levo");
      expect(cards(result)["eye-irritation-allergy"]).toBe("presentation:gel");
    }
  });

  it("seuls la lévocabastine et le cromoglicate (RCP lus) rendent un collyre « anti-allergique » — ni NAAGA, ni kétotifène, ni libellé seul", () => {
    for (const [name, substance] of [["NAABAK 4,9 POUR CENT, collyre en solution", "ACIDE N-ACÉTYL-ASPARTYL-GLUTAMIQUE"], ["ZAGRAPA 0,25 mg/ml, collyre en solution", "FUMARATE DE KÉTOTIFÈNE"], ["ALLERGO 0,5 mg/ml, collyre en solution", "ÉPINASTINE"]]) {
      expect(classifyNationalDrug({ name, substances: [substance], routes: ["ophtalmique"] })?.tags ?? []).not.toContain("anti-allergique");
    }
  });
});

describe("rien ne change hors du contexte allergique", () => {
  it("antibiotique (contexte ORL) : l'eau de mer du rhume reste préférée à celle du « nez allergique »", () => {
    expect(cards(analyse([ANTIBIOTIQUE], RAYON_COMPLET, { max: 8 }))["nasal-hygiene-orl"]).toBe("eau-de-mer-rhume");
  });

  it("antihistaminique dans un contexte ORL (antibiotique + antitussif) : une seule carte pour la gorge, celle de la gorge irritée", () => {
    const ANTITUSSIF: DrugClassification = { lineIndex: 0, substance: "DEXTROMETHORPHANE", atcCode: "R05DA09", therapeuticClass: "Antitussif", commonSideEffects: [], confidence: 0.95, source: "MODEL" };
    const keys = Object.keys(cards(analyse([ANTIBIOTIQUE, ANTITUSSIF, CETIRIZINE], RAYON_COMPLET, { max: 8 })));
    expect(keys).toContain("sore-throat-orl");
    expect(keys).not.toContain("antihistamine-dry-throat");
  });

  it("antidépresseur : la bouche sèche garde son substitut salivaire, même avec des comprimés à sucer en rayon", () => {
    const result = analyse([ANTIDEPRESSEUR], RAYON_COMPLET, { max: 8 });
    expect(cards(result)["dry-mouth-hygiene"]).toBe("salivaire");
    expect(result.opportunities.map((o) => o.key)).not.toContain("antihistamine-dry-throat");
  });
});

describe("jamais un produit de la gamme d'une boîte déjà dans la vente (essai du 16 oct. 2026)", () => {
  it("une eau de mer STERIMAR déjà bipée : l'eau de mer STERIMAR du rayon n'est pas proposée, l'autre marque peut l'être", () => {
    const who = patient();
    const lines = [{ ...CETIRIZINE, lineIndex: 0 }];
    const understanding = deriveUnderstanding({ drugs: lines, patient: { ageYears: who.ageYears, sex: who.sex, isPregnant: who.isPregnant, isBreastfeeding: who.isBreastfeeding }, providerId: "test", model: "test" });
    const sterimar = para("sterimar-allergie", "EAU DE MER NEZ ALLERGIQUE SPRAY 50ML", { brand: "STERIMAR" });
    const run = (saleLines: { lineIndex: number; drugName: string }[]) =>
      runAnalysisPipeline({
        maxRecommendations: MAX_RECOMMENDATIONS_COUNTER_SCAN,
        lines: saleLines.map((line) => ({ ...line, posology: null, durationDays: null, confirmed: true })),
        knowledge: new Map([[CETIRIZINE.substance!.toLowerCase(), classifiedDrugKnowledge({ key: CETIRIZINE.substance!.toLowerCase(), drugName: CETIRIZINE.substance!, form: null, classification: CETIRIZINE, publishedSubstance: CETIRIZINE.substance, model: "test" })]]),
        patient: who,
        catalog: [sterimar, collyreAntiAllergique, gorge],
        rules: [],
        history: {},
        explanations: [],
        extractionFindings: [],
        understanding,
        usedSimulatedProviders: false,
      });
    const without = run([{ lineIndex: 0, drugName: CETIRIZINE.substance! }]);
    expect(without.recommendations.map((r) => r.productId)).toContain("sterimar-allergie");
    const withSterimar = run([{ lineIndex: 0, drugName: CETIRIZINE.substance! }, { lineIndex: 1, drugName: "STERIMAR NEZ BOUCHÉ SPRAY 100ML" }]);
    expect(withSterimar.recommendations.map((r) => r.productId)).not.toContain("sterimar-allergie");
  });
});
