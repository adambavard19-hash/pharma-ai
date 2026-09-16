import { describe, expect, it } from "vitest";
import { runAnalysisPipeline, type PipelineInput } from "../pipeline";
import { deriveUnderstanding, type DrugClassification } from "../../understanding";
import { VIGILANCE_RULES, evaluateVigilances } from "../engines/vigilance";
import { ADVICE_VOCABULARY, classifyProductByName } from "../../catalog/product-vocabulary";
import { drug, patient, product } from "./fixtures";

/**
 * Les vigilances du comptoir et la routine dermatologique : ce que le
 * traitement impose de savoir, et ce qu'une routine propose ensemble.
 */

function classify(substance: string, atc: string, cls: string): DrugClassification {
  return { lineIndex: 0, substance, atcCode: atc, therapeuticClass: cls, commonSideEffects: [], confidence: 0.95, source: "MODEL" };
}

function analyse(drugs: DrugClassification[], catalog: PipelineInput["catalog"], rules: PipelineInput["rules"] = []) {
  const understanding = deriveUnderstanding({ drugs, patient: { ageYears: null, sex: "UNSPECIFIED", isPregnant: false, isBreastfeeding: false }, providerId: "test", model: "m" });
  return runAnalysisPipeline({
    lines: drugs.map((d, i) => ({ lineIndex: i, drugName: d.substance ?? "X", posology: null, durationDays: null, confirmed: true })),
    knowledge: new Map(drugs.map((d) => [(d.substance ?? "x").toLowerCase(), drug({ name: d.substance ?? "X", inn: d.substance, atcCode: d.atcCode, therapeuticClass: d.therapeuticClass, commonSideEffects: [] })])),
    patient: patient(),
    catalog,
    rules,
    history: {},
    explanations: [],
    extractionFindings: [],
    understanding,
    usedSimulatedProviders: false,
  });
}

const levo = classify("LEVOTHYROXINE", "H03AA01", "Hormone thyroïdienne");
const ipp = classify("ESOMEPRAZOLE", "A02BC05", "Inhibiteur de la pompe à protons");
const spiro = classify("SPIRONOLACTONE", "C03DA01", "Diurétique épargneur de potassium");
const metformine = classify("METFORMINE", "A10BA02", "Biguanide");
const iso = classify("ISOTRETINOINE", "D10BA01", "Rétinoïde oral");

const magnesium = product({ id: "mag", name: "MAG 2 magnésium marin 60 comprimés", category: "MAGNESIUM", subCategory: null, matchingTags: ["magnésium", "fatigue", "crampes"], commercialClaims: [], stockQuantity: 12, salePriceCents: 890 });

describe("règles de vigilance", () => {
  it("chaque règle est sourcée, versionnée, et parle avec prudence", () => {
    for (const rule of VIGILANCE_RULES) {
      expect(rule.sources.length).toBeGreaterThan(0);
      expect(rule.version).toMatch(/^\d+\.\d+$/);
      expect(rule.explanationTemplate).toContain("{drug}");
      expect(rule.atcPrefixes.length + rule.substances.length).toBeGreaterThan(0);
    }
  });

  it("reconnaît le traitement par code ATC ou par substance", () => {
    const byAtc = evaluateVigilances([drug({ name: "LEVOTHYROX 50", inn: "LEVOTHYROXINE", atcCode: "H03AA01", therapeuticClass: null, commonSideEffects: [] })]);
    expect(byAtc.map((v) => v.key)).toEqual(["levothyroxine-mineral-spacing"]);
    const bySubstance = evaluateVigilances([drug({ name: "Lévothyroxine 75 µg", inn: null, atcCode: null, therapeuticClass: null, commonSideEffects: [] })]);
    expect(bySubstance.map((v) => v.key)).toEqual(["levothyroxine-mineral-spacing"]);
    // Le paracétamol n'appelle aucune vigilance — seulement un rappel de bon usage.
    expect(evaluateVigilances([drug({ name: "DOLIPRANE", inn: "PARACETAMOL", atcCode: "N02BE01", therapeuticClass: null, commonSideEffects: [] })]).filter((v) => v.kind !== "USAGE")).toEqual([]);
  });

  it("étiquettes de vigilance dans le vocabulaire fermé, et reconnues dans les noms", () => {
    for (const tag of ["fer", "calcium", "zinc", "potassium", "vitamine a", "millepertuis"]) expect(ADVICE_VOCABULARY).toContain(tag);
    expect(classifyProductByName("TARDYFERON 80 mg comprimé")?.tags).toContain("fer");
    expect(classifyProductByName("DIFFU-K 600 mg gélule")?.tags).toContain("potassium");
    expect(classifyProductByName("MILDAC 600 mg millepertuis")?.tags).toContain("millepertuis");
    expect(classifyProductByName("EUCERIN DERMOPURE gel nettoyant purifiant 200 ml")?.tags).toContain("nettoyant");
    expect(classifyProductByName("CERALIP baume lèvres réparateur")?.tags).toContain("lèvres");
  });
});

describe("vigilances dans l'analyse", () => {
  it("lévothyroxine + IPP : le magnésium reste proposé, avec la prise à distance en précaution", () => {
    const result = analyse([levo, ipp], [magnesium]);
    const vigilance = result.safetyFindings.find((f) => f.code === "VIGILANCE_INTERACTION");
    expect(vigilance?.details?.subtitle).toBe("Lévothyroxine détectée");
    expect(vigilance?.details?.patientAdvice).toMatch(/2 heures/);
    const mag = result.recommendations.find((r) => r.productId === "mag");
    expect(mag).toBeDefined();
    expect(mag?.precautions.join(" ")).toMatch(/Lévothyroxine sur l'ordonnance/);
  });

  it("spironolactone : un complément de potassium est écarté, et la carte l'explique", () => {
    const potassium = product({ id: "k", name: "POTASSIUM 600 mg gélules", category: "MINERAUX", subCategory: null, matchingTags: ["potassium"], commercialClaims: [], stockQuantity: 5 });
    const result = analyse([spiro], [potassium, magnesium]);
    expect(result.safetyFindings.find((f) => f.code === "VIGILANCE_CONTRAINDICATION")?.details?.concerned[0]).toMatch(/Potassium/);
    expect(result.safetyFindings.find((f) => f.code === "VIGILANCE_PRODUCT_EXCLUDED")?.subjectId).toBe("k");
    expect(result.recommendations.map((r) => r.productId)).not.toContain("k");
  });

  it("metformine : un dépistage B12 est signalé en information, sans produit poussé", () => {
    const b12 = product({ id: "b12", name: "VITAMINE B12 1000 µg", category: "VITAMINES", subCategory: null, matchingTags: [], commercialClaims: [], stockQuantity: 5 });
    const result = analyse([metformine], [b12]);
    const screening = result.safetyFindings.find((f) => f.code === "VIGILANCE_SCREENING");
    expect(screening?.severity).toBe("INFO");
    expect(screening?.details?.kind).toBe("SCREENING");
    expect(result.recommendations.map((r) => r.productId)).not.toContain("b12");
  });
});

describe("routine dermatologique sous isotrétinoïne", () => {
  const derm = (id: string, name: string, brand: string, tags: string[], price = 1290) =>
    product({ id, name, brand, category: "DERMOCOSMETIQUE", subCategory: null, matchingTags: tags, commercialClaims: [], stockQuantity: 6, salePriceCents: price });
  const cleanse = ["nettoyant", "visage"];
  const hydrate = ["hydratation", "peau sensible", "apaisant", "émollient"];
  const protect = ["protection solaire", "spf", "photoprotection"];
  const catalog = [
    derm("e1", "EUCERIN DERMOPURE gel nettoyant 200 ml", "Eucerin", cleanse),
    derm("e2", "EUCERIN DERMOPURE hydra repair crème visage 50 ml", "Eucerin", hydrate),
    derm("e3", "EUCERIN SUN oil control SPF 50+ visage", "Eucerin", protect),
    derm("l1", "LA ROCHE-POSAY effaclar gel moussant purifiant", "La Roche-Posay", cleanse),
    derm("l2", "LA ROCHE-POSAY toleriane sensitive crème visage", "La Roche-Posay", hydrate),
    derm("l3", "LA ROCHE-POSAY anthelios SPF 50+ fluide visage", "La Roche-Posay", protect),
    derm("g1", "AVENE gommage doux visage", "Avène", cleanse),
    derm("lip", "CERALIP baume lèvres réparateur", "La Roche-Posay", ["lèvres", "baume"]),
    derm("vita", "ARKOVITAL vitamine A", "Arkopharma", ["vitamine a"]),
  ];

  it("propose les trois étapes ensemble, sans gommage, avec la vigilance isotrétinoïne", () => {
    const result = analyse([iso], catalog);
    const steps = result.recommendations.filter((r) => r.routine?.key === "isotretinoin-skin-routine");
    expect(steps.map((s) => s.routine?.stepLabel)).toEqual(["Nettoyer", "Hydrater et réparer", "Protéger"]);
    expect(result.recommendations.map((r) => r.productId)).not.toContain("g1");
    expect(result.recommendations.map((r) => r.productId)).not.toContain("vita");
    expect(result.safetyFindings.find((f) => f.code === "VIGILANCE_CONTRAINDICATION")?.details?.subtitle).toBe("Isotrétinoïne détectée");
    // Le baume à lèvres accompagne la routine : quatre produits, deux conseils.
    expect(result.recommendations.find((r) => r.productId === "lip")).toBeDefined();
    expect(result.recommendations.length).toBe(4);
  });

  it("suit la gamme que l'officine met en avant quand elle couvre la routine", () => {
    const rules: PipelineInput["rules"] = [{ id: "r", type: "PREFER_BRAND", productId: null, category: null, brand: "Eucerin", context: {}, weight: 1 }];
    const withEucerin = analyse([iso], catalog, rules);
    const brands = withEucerin.recommendations.filter((r) => r.routine).map((r) => catalog.find((p) => p.id === r.productId)?.brand);
    expect(brands).toEqual(["Eucerin", "Eucerin", "Eucerin"]);
    const withLrp = analyse([iso], catalog, [{ ...rules[0], brand: "La Roche-Posay" }]);
    const lrp = withLrp.recommendations.filter((r) => r.routine).map((r) => catalog.find((p) => p.id === r.productId)?.brand);
    expect(lrp).toEqual(["La Roche-Posay", "La Roche-Posay", "La Roche-Posay"]);
  });

  it("une étape sans référence en stock n'empêche pas les autres", () => {
    const result = analyse([iso], catalog.filter((p) => p.id !== "e3" && p.id !== "l3"));
    const steps = result.recommendations.filter((r) => r.routine);
    expect(steps.map((s) => s.routine?.stepKey)).toEqual(["cleanse", "hydrate"]);
  });
});

describe("bon usage au comptoir", () => {
  it("corticoïde oral, paracétamol et antitussif : un rappel de bon usage chacun, en information", () => {
    const solupred = classify("PREDNISOLONE", "H02AB06", "Corticoïde");
    const doliprane = { ...classify("PARACETAMOL", "N02BE01", "Antalgique"), lineIndex: 1 };
    const toplexil = { ...classify("OXOMEMAZINE", "R06AD08", "Antitussif antihistaminique"), lineIndex: 2 };
    const result = analyse([solupred, doliprane, toplexil], []);
    const usage = result.safetyFindings.filter((f) => f.code === "VIGILANCE_USAGE");
    expect(usage.map((f) => f.details?.subtitle)).toEqual(["Corticoïde par voie orale", "Paracétamol", "Sirop contre la toux sèche"]);
    expect(usage.every((f) => f.severity === "INFO")).toBe(true);
    expect(usage[0]?.details?.patientAdvice).toMatch(/pendant le repas/);
    expect(usage[2]?.details?.patientAdvice).toMatch(/toux devient grasse/);
  });
});

describe("huiles essentielles respiratoires", () => {
  const oils = product({ id: "oils", name: "OLIOSEPTIL BRONCHE GELU 15", category: "PHYTOTHERAPIE", subCategory: null, matchingTags: ["huiles essentielles", "bronches"], commercialClaims: [], stockQuantity: 12, salePriceCents: 990 });
  const toplexil = classify("OXOMEMAZINE", "R06AD08", "Antitussif antihistaminique");

  it("proposées pendant une toux, jamais à un asthmatique, un épileptique, une femme enceinte ou un enfant", () => {
    expect(analyse([toplexil], [oils]).recommendations.map((r) => r.productId)).toContain("oils");
    const understanding = deriveUnderstanding({ drugs: [toplexil], patient: { ageYears: null, sex: "UNSPECIFIED", isPregnant: false, isBreastfeeding: false }, providerId: "test", model: "m" });
    const base: PipelineInput = {
      lines: [{ lineIndex: 0, drugName: "OXOMEMAZINE", posology: null, durationDays: null, confirmed: true }],
      knowledge: new Map([["oxomemazine", drug({ name: "OXOMEMAZINE", inn: "OXOMEMAZINE", atcCode: "R06AD08", therapeuticClass: "Antitussif", commonSideEffects: [] })]]),
      patient: patient(), catalog: [oils], rules: [], history: {}, explanations: [], extractionFindings: [], understanding, usedSimulatedProviders: false,
    };
    for (const blocked of [patient({ chronicConditions: ["Asthme"] }), patient({ chronicConditions: ["Épilepsie"] }), patient({ isPregnant: true }), patient({ ageYears: 8 })]) {
      const result = runAnalysisPipeline({ ...base, patient: blocked });
      expect(result.recommendations.map((r) => r.productId)).not.toContain("oils");
    }
  });
});

describe("lubrifiants oculaires reconnus au nom", () => {
  it("chaque marque courante reçoit l'étiquette « sécheresse oculaire »", () => {
    for (const name of ["SYSTANE BALANCE S ocul lubrif Fl/10ml", "SYSTANE ULTRA GTTE OCUL/LUBRI", "VISMED MULTI 10ML", "THEALOSE DUO 10ML", "THEALOZ DUO GEL", "REFRESH TEARS 15ML", "HYABAK 10ML", "HYLO CONFORT COLLY HYD FL", "AQUALARM ECRAN 10ML", "OPTIVE GTT LUBR FL10ML", "CATIONORM MULT EMUL OPH 10ML"]) {
      expect(classifyProductByName(name)?.tags, name).toContain("sécheresse oculaire");
    }
    // Les cosmétiques à l'acide hyaluronique ne sont pas des collyres.
    expect(classifyProductByName("EUCERIN HYALURON+ELASTICITY YEUX")?.tags ?? []).not.toContain("sécheresse oculaire");
  });
});

