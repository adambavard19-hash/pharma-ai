import { describe, expect, it } from "vitest";
import { runAnalysisPipeline, type PipelineInput } from "../pipeline";
import { parseCustomRuleDefinition } from "../central-advice";
import {
  ROBOT_LABEL,
  ROBOT_MAX_CANDIDATES,
  ROBOT_PATIENT_REASON,
  applyRobotSuggestions,
  buildRobotPrompt,
  candidateSimilarity,
  mayBeDrug,
  robotCacheDecision,
  robotCentralDraft,
  robotProductKey,
  robotRuleKey,
  robotSlots,
  selectRobotCandidates,
  uncoveredDrugs,
  validateRobotChoices,
  type RobotDrug,
  type RobotItem,
} from "../robot-suggestion";
import { drug, officialFacts, patient, product } from "./fixtures";
import type { CatalogProduct, PatientContext } from "../types";

/**
 * La suggestion du robot, côté domaine : ce qui la déclenche, la liste fermée envoyée au modèle, la validation stricte de sa
 * réponse, et surtout le passage de ses choix par TOUS les garde-fous du moteur. Le cas d'école : un MAALOX bipé, aucune
 * règle pour les antiacides (A02AD01), un stock de parapharmacie.
 */

const MAALOX = "MAALOX MAUX D'ESTOMAC, suspension buvable en sachet";

const maaloxKnowledge = drug({ id: "maalox", name: "MAALOX", inn: "hydroxyde d'aluminium", atcCode: "A02AD01", therapeuticClass: "Antiacides", commonSideEffects: [], origin: "AI_CLASSIFICATION" });
const maaloxFacts = officialFacts({ cisCode: "60000001", name: MAALOX, substances: ["HYDROXYDE D'ALUMINIUM", "HYDROXYDE DE MAGNÉSIUM"], prescriptionConditions: [] });

function stock(): CatalogProduct[] {
  return [
    product({ id: "p-probio", name: "LACTIBIANE Référence gélules", brand: "Pileje", category: "PROBIOTIQUES", subCategory: null, description: null, commercialClaims: [], matchingTags: ["probiotique", "flore intestinale"], ean: "3401000000011", stockQuantity: 12 }),
    product({ id: "p-tisane", name: "Tisane digestion Bio 20 sachets", brand: "Herbesan", category: "PHYTOTHERAPIE", subCategory: null, description: null, commercialClaims: [], matchingTags: ["digestion"], ean: "3401000000028", stockQuantity: 5 }),
    product({ id: "p-antiacide", name: "Gel antiacide dispositif 24 sachets", brand: "Labo", category: "DISPOSITIFS_MEDICAUX", subCategory: null, description: null, commercialClaims: [], matchingTags: ["antiacide"], ean: "3401000000035", stockQuantity: 8 }),
    product({ id: "p-maalox-otc", name: "MAALOX Maux d'estomac comprimés", brand: null, category: "AUTRE", subCategory: null, description: null, commercialClaims: [], matchingTags: [], ean: "3401000000042", stockQuantity: 4 }),
    product({ id: "p-magnesium", name: "Magnésium marin B6", brand: "Labo", category: "MAGNESIUM", subCategory: null, description: null, commercialClaims: [], matchingTags: ["magnésium"], ean: "3401000000059", stockQuantity: 9 }),
    product({ id: "p-charbon", name: "Charbon actif gélules", brand: "Labo", category: "PHYTOTHERAPIE", subCategory: null, description: null, commercialClaims: [], matchingTags: ["digestion"], ean: "3401000000066", stockQuantity: 0 }),
    product({ id: "p-creme", name: "Crème hydratante visage", brand: "Avène", category: "DERMOCOSMETIQUE", subCategory: null, description: null, commercialClaims: [], matchingTags: ["hydratation"], ean: "3401000000073", stockQuantity: 6 }),
    product({ id: "p-national", origin: "NATIONAL_DRUG", name: "GAVISCON suspension", substances: ["ALGINATE DE SODIUM"], category: "AUTRE", matchingTags: [], ean: null, stockQuantity: 3 }),
    product({ id: "p-liste", name: "Produit sur liste", prescriptionConditions: ["liste I"], category: "PHYTOTHERAPIE", matchingTags: ["digestion"], ean: "3401000000080", stockQuantity: 3 }),
  ];
}

function maaloxInput(overrides: Partial<PipelineInput> = {}, who: Partial<PatientContext> = {}): PipelineInput {
  return {
    lines: [{ lineIndex: 1, drugName: MAALOX, posology: null, durationDays: null, confirmed: true }],
    knowledge: new Map([[MAALOX.toLowerCase(), maaloxKnowledge]]),
    official: new Map([[MAALOX.toLowerCase(), maaloxFacts]]),
    patient: patient(who),
    catalog: stock(),
    rules: [],
    history: {},
    explanations: [],
    extractionFindings: [],
    usedSimulatedProviders: false,
    maxRecommendations: 3,
    stock: { configured: true, referenceCount: 9 },
    ...overrides,
  };
}

const maaloxDrug = (input = maaloxInput()): RobotDrug => uncoveredDrugs(input, runAnalysisPipeline(input))[0];
const item = (productId: string, overrides: Partial<RobotItem> = {}): RobotItem => ({
  proposalId: `prop-${productId}`,
  productId,
  need: "DIGESTIVE_COMFORT",
  reason: "Accompagne le confort digestif pendant la prise d'un antiacide.",
  counterScript: "Pour votre confort digestif, je peux vous proposer {product}.",
  ...overrides,
});

describe("le déclenchement : une ligne médicament qu'aucune règle n'a servie", () => {
  it("MAALOX (A02AD01) : aucune règle, aucun conseil — la ligne est candidate, clé « atc:A02AD01 »", () => {
    const input = maaloxInput();
    const base = runAnalysisPipeline(input);
    expect(base.recommendations).toHaveLength(0);
    const drugs = uncoveredDrugs(input, base);
    expect(drugs).toEqual([expect.objectContaining({ lineIndex: 1, drugKey: "atc:A02AD01", atcCode: "A02AD01", substances: ["HYDROXYDE D'ALUMINIUM", "HYDROXYDE DE MAGNÉSIUM"] })]);
  });

  it("une ligne déjà servie par une règle (amoxicilline → probiotique) ne l'est pas", () => {
    const amox = "AMOXICILLINE 1 g";
    const input = maaloxInput({
      lines: [{ lineIndex: 0, drugName: amox, posology: null, durationDays: 7, confirmed: true }],
      knowledge: new Map([[amox.toLowerCase(), drug()]]),
      official: new Map(),
    });
    const base = runAnalysisPipeline(input);
    expect(base.recommendations.length).toBeGreaterThan(0);
    expect(uncoveredDrugs(input, base)).toEqual([]);
  });

  it("ni un produit de parapharmacie bipé (pas de fiche), ni un produit pour animaux, ni une ligne non confirmée", () => {
    const input = maaloxInput({
      lines: [
        { lineIndex: 0, drugName: "LACTIBIANE Référence gélules", posology: null, durationDays: null, confirmed: true },
        { lineIndex: 1, drugName: "FRONTLINE SPOT ON CHIEN", posology: null, durationDays: null, confirmed: true },
        { lineIndex: 2, drugName: MAALOX, posology: null, durationDays: null, confirmed: false },
      ],
      knowledge: new Map([["frontline spot on chien", drug({ atcCode: null, therapeuticClass: "Antiparasitaire", origin: "VETERINARY_NAME" })], [MAALOX.toLowerCase(), maaloxKnowledge]]),
    });
    expect(uncoveredDrugs(input, runAnalysisPipeline(input))).toEqual([]);
  });
});

describe("la liste fermée, préparée côté serveur", () => {
  it("seulement des produits de l'officine, en stock, sans prescription ; ni doublon (antiacide, magnésium), ni le médicament lui-même", () => {
    const candidates = selectRobotCandidates({ catalog: stock(), drug: maaloxDrug() });
    expect(candidates.map((candidate) => candidate.productId)).toEqual(["p-probio", "p-tisane", "p-creme"]);
    expect(candidates.map((candidate) => candidate.shortId)).toEqual(["P01", "P02", "P03"]);
    expect(candidates[0]).toMatchObject({ productKey: "ean:3401000000011", tags: ["probiotique", "flore intestinale"] });
  });

  it("une proposition refusée par la pharmacienne de PharmaBoost ne revient plus", () => {
    const candidates = selectRobotCandidates({ catalog: stock(), drug: maaloxDrug(), refusedProductKeys: new Set([robotProductKey({ ean: "3401000000011", name: "x" })]) });
    expect(candidates.map((candidate) => candidate.productId)).not.toContain("p-probio");
  });

  it("une référence remboursée n'est jamais proposée au modèle (ce peut être un médicament)", () => {
    const catalog = stock().map((entry) => (entry.id === "p-probio" ? { ...entry, reimbursed: true } : entry));
    expect(selectRobotCandidates({ catalog, drug: maaloxDrug() }).map((candidate) => candidate.productId)).toEqual(["p-tisane", "p-creme"]);
  });

  /** Un produit tel que catalog.ts le construit : jamais de substance ni de condition de délivrance, quoi qu'il soit. */
  const asPharmacyProduct = (overrides: Partial<CatalogProduct>): CatalogProduct =>
    product({ origin: "PHARMACY_CATALOG", substances: [], prescriptionConditions: [], subCategory: null, description: null, commercialClaims: [], contraindications: [], precautions: [], reimbursed: null, stockQuantity: 30, ...overrides });

  it("un médicament créé comme produit (code CIP inconnu de la BDPM locale) n'entre jamais dans la liste, même sans substance ni condition", () => {
    const drugs = [
      // Le cas reproduit par le relecteur : code CIP 13, remboursé, rayon AUTRE, étiquettes tirées du nom.
      asPharmacyProduct({ id: "d-amox", name: "AMOXICILLINE BIOGARAN 1 g cp", category: "AUTRE", matchingTags: ["amoxicilline"], ean: "3400930000000", reimbursed: true, vatRate: 2.1 }),
      // Chaque signal suffit seul : remboursé, CIP 13 en 3400, CIP 7, TVA 2,1 %, rayon AUTRE sans usage du vocabulaire.
      asPharmacyProduct({ id: "d-rembourse", name: "Référence remboursée", category: "PHYTOTHERAPIE", matchingTags: ["digestion"], ean: "3401000009001", reimbursed: true, vatRate: 5.5 }),
      asPharmacyProduct({ id: "d-cip13", name: "Boîte au code CIP", category: "PHYTOTHERAPIE", matchingTags: ["digestion"], ean: "3400935555555", vatRate: 5.5 }),
      asPharmacyProduct({ id: "d-cip7", name: "Boîte au code CIP 7", category: "PHYTOTHERAPIE", matchingTags: ["digestion"], ean: "3555555", vatRate: 5.5 }),
      asPharmacyProduct({ id: "d-tva", name: "Boîte à TVA réduite", category: "PHYTOTHERAPIE", matchingTags: ["digestion"], ean: "3401000009002", vatRate: 2.1 }),
      asPharmacyProduct({ id: "d-autre", name: "ZOVIRAX crème", category: "AUTRE", matchingTags: ["zovirax"], ean: "3401000009003", vatRate: 10 }),
    ];
    const ok = asPharmacyProduct({ id: "ok-tisane", name: "Tisane digestion", category: "PHYTOTHERAPIE", matchingTags: ["digestion"], ean: "3401000009004", vatRate: 5.5 });
    const okAutre = asPharmacyProduct({ id: "ok-autre", name: "Gourde isotherme", category: "AUTRE", matchingTags: ["hydratation"], ean: "3401000009005", vatRate: 20 });
    const candidates = selectRobotCandidates({ catalog: [...drugs, ok, okAutre], drug: maaloxDrug() });
    expect(candidates.map((candidate) => candidate.productId).sort()).toEqual(["ok-autre", "ok-tisane"]);
    for (const entry of drugs) expect(mayBeDrug(entry)).toBe(true);
  });

  it("l'amoxicilline créée comme produit ne devient pas une suggestion, même si le modèle la nommait", () => {
    const amox = asPharmacyProduct({ id: "d-amox", name: "AMOXICILLINE BIOGARAN 1 g cp", category: "AUTRE", matchingTags: ["amoxicilline"], ean: "3400930000000", reimbursed: true, vatRate: 2.1 });
    const candidates = selectRobotCandidates({ catalog: [amox], drug: maaloxDrug() });
    expect(candidates).toEqual([]);
    expect(validateRobotChoices({ produits: [{ id: "P01", besoin: "DIGESTIVE_COMFORT", raison: "Accompagne le confort digestif.", phrase: "Je peux vous proposer {product}." }] }, candidates).choices).toEqual([]);
    // Une réponse en cache qui la nommerait (choisie avant le filtre) ne la fait pas sortir non plus.
    const input = maaloxInput({ catalog: [...stock(), amox] });
    const merged = applyRobotSuggestions({ input, base: runAnalysisPipeline(input), plans: [{ drug: maaloxDrug(input), items: [item("d-amox")] }] });
    expect(merged.added).toEqual([]);
  });

  it(`au plus ${ROBOT_MAX_CANDIDATES} produits`, () => {
    const catalog = Array.from({ length: 90 }, (_, index) => product({ id: `p${index}`, name: `Produit ${index}`, ean: `34010000${String(index).padStart(5, "0")}`, matchingTags: [] }));
    expect(selectRobotCandidates({ catalog, drug: maaloxDrug() })).toHaveLength(ROBOT_MAX_CANDIDATES);
  });

  it("le texte envoyé : le médicament, sa substance, sa famille et la liste — rien d'autre", () => {
    const prompt = buildRobotPrompt(maaloxDrug(), selectRobotCandidates({ catalog: stock(), drug: maaloxDrug() }));
    expect(prompt).toContain(`Médicament délivré : ${MAALOX}`);
    expect(prompt).toContain("HYDROXYDE D'ALUMINIUM, HYDROXYDE DE MAGNÉSIUM");
    expect(prompt).toContain("code ATC A02AD01 — Antiacides");
    expect(prompt).toContain("P01 · LACTIBIANE Référence gélules · marque Pileje · Probiotiques · usages : probiotique, flore intestinale");
    expect(prompt).not.toMatch(/prix|stock de \d|patient/i);
  });
});

describe("la validation stricte de la réponse du modèle", () => {
  const candidates = () => selectRobotCandidates({ catalog: stock(), drug: maaloxDrug() });
  const choice = (overrides: Record<string, unknown> = {}) => ({ id: "P01", besoin: "DIGESTIVE_COMFORT", raison: "Accompagne le confort digestif avec un antiacide.", phrase: "Pour votre confort digestif, je peux vous proposer {product}.", ...overrides });

  it("un identifiant hors de la liste est rejeté", () => {
    const { choices, warnings } = validateRobotChoices({ produits: [choice({ id: "P99" }), choice({ id: "p-national" })] }, candidates());
    expect(choices).toEqual([]);
    expect(warnings.join(" ")).toMatch(/hors de la liste/);
  });

  it("« aucun produit » est une réponse valable", () => {
    expect(validateRobotChoices({ produits: [] }, candidates())).toEqual({ choices: [], warnings: [] });
  });

  it("besoin inconnu, texte vide ou trop long, dosage, allégation, phrase sans {product} : rejetés", () => {
    const bad = [
      choice({ besoin: "VENDRE_PLUS" }),
      choice({ id: "P02", raison: "" }),
      choice({ id: "P02", raison: "x".repeat(200) }),
      choice({ id: "P02", phrase: "Prenez {product}, 2 gélules par jour pendant 10 jours." }),
      choice({ id: "P02", phrase: "{product} élimine les brûlures d'estomac." }),
      choice({ id: "P02", phrase: "Je vous propose les gélules Lactibiane." }),
      choice({ id: "P02", raison: "Utile avec {drug}." }),
    ];
    for (const entry of bad) expect(validateRobotChoices({ produits: [entry] }, candidates()).choices).toEqual([]);
  });

  it("les promesses de comptoir sont des allégations : soulage, traite, calme, apaise, efficace, contre les…", () => {
    const claims = [
      choice({ phrase: "{product} soulage rapidement les brûlures d'estomac." }),
      choice({ phrase: "{product} traite les reflux et calme l'acidité." }),
      choice({ phrase: "{product} est efficace contre les ulcères." }),
      choice({ raison: "Soulage les douleurs gastriques efficacement." }),
      choice({ phrase: "{product} apaise l'estomac irrité." }),
      choice({ phrase: "{product} combat les ballonnements." }),
      choice({ phrase: "{product} répare la muqueuse." }),
      choice({ phrase: "Un bon remède : {product}." }),
      choice({ phrase: "{product}, pour lutter contre l'acidité." }),
    ];
    for (const entry of claims) {
      const { choices, warnings } = validateRobotChoices({ produits: [entry] }, candidates());
      expect(choices).toEqual([]);
      expect(warnings.join(" ")).toMatch(/allégation/);
    }
  });

  it("une phrase sobre, qui parle du traitement sans rien promettre, passe", () => {
    const sober = choice({ raison: "Accompagne le traitement côté confort digestif.", phrase: "En complément de votre traitement, je peux vous proposer {product} pour votre confort digestif." });
    expect(validateRobotChoices({ produits: [sober] }, candidates()).choices).toHaveLength(1);
  });

  it("deux produits au plus, sans doublon", () => {
    const { choices, warnings } = validateRobotChoices({ produits: [choice(), choice(), choice({ id: "P02" }), choice({ id: "P03" })] }, candidates());
    expect(choices.map((entry) => entry.shortId)).toEqual(["P01", "P02"]);
    expect(warnings).toHaveLength(2);
  });
});

describe("le cache : servir, attendre, redemander", () => {
  const now = new Date("2026-10-13T10:00:00Z");
  const row = (overrides: Partial<Parameters<typeof robotCacheDecision>[0] & object> = {}) => ({
    status: "READY" as const,
    items: [item("p-probio")],
    candidateIds: ["p-probio", "p-tisane", "p-creme"],
    requestedAt: new Date("2026-10-01T10:00:00Z"),
    expiresAt: new Date("2026-10-31T10:00:00Z"),
    ...overrides,
  });

  it("une réponse fraîche sur le même stock sert telle quelle ; « aucun produit » aussi", () => {
    expect(robotCacheDecision(row(), ["p-probio", "p-tisane", "p-creme"], now)).toBe("USE");
    expect(robotCacheDecision(row({ items: [] }), ["p-probio", "p-tisane", "p-creme"], now)).toBe("USE");
  });

  it("périmée, ou un stock qui a notablement changé : on redemande", () => {
    expect(robotCacheDecision(row({ expiresAt: new Date("2026-10-13T09:00:00Z") }), ["p-probio"], now)).toBe("ASK");
    expect(robotCacheDecision(row(), ["p-probio", "a", "b", "c", "d"], now)).toBe("ASK");
    expect(candidateSimilarity(["a", "b"], ["a", "b", "c"])).toBeCloseTo(2 / 3);
  });

  it("le produit choisi a quitté la liste (rupture, refus) : on redemande", () => {
    expect(robotCacheDecision(row(), ["p-tisane", "p-creme", "p-x"], now)).toBe("ASK");
  });

  it("un appel en cours ou un échec récent : on n'attend pas, on ne repaie pas", () => {
    expect(robotCacheDecision(row({ status: "PENDING", requestedAt: new Date("2026-10-13T09:59:40Z") }), [], now)).toBe("WAIT");
    expect(robotCacheDecision(row({ status: "FAILED", expiresAt: new Date("2026-10-13T10:20:00Z") }), [], now)).toBe("WAIT");
    expect(robotCacheDecision(row({ status: "PENDING", requestedAt: new Date("2026-10-13T09:00:00Z") }), [], now)).toBe("ASK");
  });
});

describe("les garde-fous du moteur décident, pas le modèle", () => {
  it("MAALOX : la suggestion du robot passe le moteur et devient un conseil, marqué « à confirmer », sans phrase patient", () => {
    const input = maaloxInput();
    const base = runAnalysisPipeline(input);
    const merge = applyRobotSuggestions({ input, base, plans: [{ drug: maaloxDrug(input), items: [item("p-probio")] }] });
    expect(merge.added).toHaveLength(1);
    const [advice] = merge.result.recommendations;
    expect(advice).toMatchObject({ productId: "p-probio", patientReason: "", counterScript: "Pour votre confort digestif, je peux vous proposer LACTIBIANE Référence gélules." });
    expect(advice.shortReason.includes(ROBOT_LABEL)).toBe(false);
    expect(merge.result.outcome).toBe("PROPOSALS");
    const opportunity = merge.result.opportunities.find((entry) => entry.key === advice.opportunityKey);
    expect(opportunity).toMatchObject({ ruleKey: robotRuleKey("prop-p-probio"), needKey: "DIGESTIVE_COMFORT", triggeredBy: [{ lineIndex: 1, drugName: MAALOX }] });
    expect(merge.result.trace.at(-1)?.label).toMatch(/Suggestion du robot/);
  });

  it("seul le produit choisi peut sortir : jamais un voisin du même rayon", () => {
    const input = maaloxInput();
    const merge = applyRobotSuggestions({ input, base: runAnalysisPipeline(input), plans: [{ drug: maaloxDrug(input), items: [item("p-tisane")] }] });
    expect(merge.added.map((entry) => entry.productId)).toEqual(["p-tisane"]);
  });

  it("allergie du patient, contre-indication déclarée (grossesse), exclusion de l'officine, rupture : écarté", () => {
    const cases: PipelineInput[] = [
      maaloxInput({ catalog: stock().map((entry) => (entry.id === "p-probio" ? { ...entry, contraindications: ["lactose"] } : entry)) }, { allergies: ["lactose"] }),
      maaloxInput({ catalog: stock().map((entry) => (entry.id === "p-probio" ? { ...entry, vigilances: [{ population: "PREGNANCY", level: "CONTRAINDICATION", note: null }] } : entry)) }, { isPregnant: true }),
      maaloxInput({ rules: [{ id: "r1", type: "EXCLUDE_PRODUCT", productId: "p-probio", category: null, context: {}, weight: 1 }] }),
      maaloxInput({ catalog: stock().map((entry) => (entry.id === "p-probio" ? { ...entry, stockQuantity: 0 } : entry)) }),
    ];
    for (const input of cases) {
      const merge = applyRobotSuggestions({ input, base: runAnalysisPipeline(input), plans: [{ drug: maaloxDrug(input), items: [item("p-probio")] }] });
      expect(merge.added).toEqual([]);
      expect(merge.result.recommendations).toEqual([]);
      expect(merge.notes.join(" ")).toMatch(/écartée par le moteur/);
    }
  });

  it("un produit qui porte une étiquette écartée par une vigilance du traitement est écarté (même filtre que les règles)", () => {
    // Millepertuis sous anticoagulant : la vigilance du moteur écarte la référence, quel que soit celui qui l'appelle.
    const avk = "COUMADINE 5 mg";
    const input = maaloxInput({
      lines: [
        { lineIndex: 0, drugName: avk, posology: null, durationDays: null, confirmed: true },
        { lineIndex: 1, drugName: MAALOX, posology: null, durationDays: null, confirmed: true },
      ],
      knowledge: new Map([[avk.toLowerCase(), drug({ id: "avk", name: "COUMADINE", inn: "warfarine", atcCode: "B01AA03", therapeuticClass: "Antivitamine K", commonSideEffects: [] })], [MAALOX.toLowerCase(), maaloxKnowledge]]),
      catalog: [...stock(), product({ id: "p-millepertuis", name: "Millepertuis gélules", category: "PHYTOTHERAPIE", matchingTags: ["millepertuis"], ean: "3401000000080", stockQuantity: 5 })],
    });
    const base = runAnalysisPipeline(input);
    const target = uncoveredDrugs(input, base).find((entry) => entry.drugKey === "atc:A02AD01") as RobotDrug;
    const merge = applyRobotSuggestions({ input, base, plans: [{ drug: target, items: [item("p-millepertuis")] }] });
    expect(merge.added).toEqual([]);
    expect(merge.notes.join(" ")).toMatch(/écartée par le moteur/);
    // Témoin : sans l'anticoagulant, le même choix passe — c'est bien la vigilance qui l'a écarté.
    const alone = maaloxInput({ catalog: input.catalog });
    expect(applyRobotSuggestions({ input: alone, base: runAnalysisPipeline(alone), plans: [{ drug: maaloxDrug(alone), items: [item("p-millepertuis")] }] }).added).toHaveLength(1);
  });

  it("le plafond : deux suggestions au plus sans autre conseil, une seule s'il y en a déjà, aucune quand le comptoir est plein", () => {
    const input = maaloxInput();
    const base = runAnalysisPipeline(input);
    const three = applyRobotSuggestions({ input, base, plans: [{ drug: maaloxDrug(input), items: [item("p-probio"), item("p-tisane"), item("p-creme")] }] });
    expect(three.added).toHaveLength(2);
    expect(robotSlots(three.result, 3)).toBe(0);

    const amox = "AMOXICILLINE 1 g";
    const mixed = maaloxInput({
      lines: [
        { lineIndex: 0, drugName: amox, posology: null, durationDays: 7, confirmed: true },
        { lineIndex: 1, drugName: MAALOX, posology: null, durationDays: null, confirmed: true },
      ],
      knowledge: new Map([[amox.toLowerCase(), drug()], [MAALOX.toLowerCase(), maaloxKnowledge]]),
      catalog: [...stock(), product({ id: "p-flore", name: "Flore Équilibre", ean: "3401000000097" })],
    });
    const mixedBase = runAnalysisPipeline(mixed);
    expect(mixedBase.recommendations.length).toBeGreaterThan(0);
    const one = applyRobotSuggestions({ input: mixed, base: mixedBase, plans: [{ drug: uncoveredDrugs(mixed, mixedBase)[0], items: [item("p-tisane"), item("p-creme")] }] });
    expect(one.added).toHaveLength(1);
    // Rangée après les conseils des règles : l'écran du comptoir les lit par score.
    expect(one.added[0].totalScore).toBeLessThan(Math.min(...mixedBase.recommendations.map((entry) => entry.totalScore)));

    expect(robotSlots({ recommendations: [1, 2, 3].map((n) => ({ ...mixedBase.recommendations[0], productId: `x${n}` })), opportunities: mixedBase.opportunities }, 3)).toBe(0);
  });

  it("un produit déjà proposé par une règle n'est pas répété", () => {
    const amox = "AMOXICILLINE 1 g";
    const mixed = maaloxInput({
      lines: [
        { lineIndex: 0, drugName: amox, posology: null, durationDays: 7, confirmed: true },
        { lineIndex: 1, drugName: MAALOX, posology: null, durationDays: null, confirmed: true },
      ],
      knowledge: new Map([[amox.toLowerCase(), drug()], [MAALOX.toLowerCase(), maaloxKnowledge]]),
    });
    const base = runAnalysisPipeline(mixed);
    const ruleProduct = base.recommendations[0].productId;
    const merge = applyRobotSuggestions({ input: mixed, base, plans: [{ drug: uncoveredDrugs(mixed, base)[0], items: [item(ruleProduct)] }] });
    expect(merge.added).toEqual([]);
  });
});

describe("la proposition validée : ce qu'elle devient pour toutes les pharmacies", () => {
  const facts = { drugLabel: MAALOX, atcCode: "A02AD01", substance: "HYDROXYDE D'ALUMINIUM, HYDROXYDE DE MAGNÉSIUM", productName: "LACTIBIANE Référence gélules", productEan: "3401000000011", productCategory: "PROBIOTIQUES" as const, productTags: ["probiotique", "flore intestinale"], need: "DIGESTIVE_COMFORT", reason: "Accompagne le confort digestif avec un antiacide.", counterScript: "Pour votre confort digestif, je peux vous proposer {product}." };

  it("un conseil ajouté au format de la console, accepté par son validateur, avec une phrase patient neutre", () => {
    const draft = robotCentralDraft(facts);
    expect(draft.kind).toBe("CUSTOM_RULE");
    if (draft.kind !== "CUSTOM_RULE") return;
    const parsed = parseCustomRuleDefinition(draft.definition);
    expect(parsed.ok).toBe(true);
    expect(draft.definition).toMatchObject({ atcPrefixes: ["A02AD01"], category: "PROBIOTIQUES", matchingTags: ["probiotique", "flore intestinale"], patientReason: ROBOT_PATIENT_REASON, kind: "COMFORT" });
  });

  it("sans étiquette d'usage : une association commune par code-barres ; sans code-barres non plus : à écrire à la main", () => {
    const association = robotCentralDraft({ ...facts, productTags: [] });
    expect(association).toMatchObject({ kind: "ASSOCIATION", ean: "3401000000011", sentence: "Pour votre confort digestif, je peux vous proposer LACTIBIANE Référence gélules." });
    expect(robotCentralDraft({ ...facts, productTags: [], productEan: null }).kind).toBe("MANUAL");
  });
});
