import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyProductByName } from "@/core/catalog/product-vocabulary";
import { ADVICE_RULES, detectAdviceOpportunities } from "../engines/advice";
import { adviceFamilyOf } from "../family";
import { runAnalysisPipeline } from "../pipeline";
import type { CatalogProduct, PatientContext } from "../types";
import { drug, patient, product } from "./fixtures";

/**
 * Les cinq règles minces du « conseil complet par ordonnance » : chambre
 * d'inhalation, peigne à poux, collecteur d'aiguilles, calcium sous
 * corticoïde au long cours, sucre rapide sous insuline ou sulfamide.
 *
 * Ce qui est tenu : chacune est sourcée, à relire (PENDING), au conditionnel,
 * jamais un conseil de sécurité ; elle se déclenche sur sa classe et sur
 * aucune autre ; elle attend sa question ; elle ne propose que ce que le stock
 * porte, par nom, avec la bonne catégorie.
 */

const KEYS = ["inhaler-spacer-chamber", "head-lice-comb", "self-injection-sharps-container", "corticosteroid-oral-calcium", "hypoglycemia-fast-sugar"] as const;
type Key = (typeof KEYS)[number];
const rule = (key: Key) => ADVICE_RULES.find((r) => r.key === key)!;

function opportunities(atcCode: string, over: { patient?: Partial<PatientContext>; therapeuticClass?: string | null; substance?: string } = {}) {
  const substance = over.substance ?? "SUBSTANCE";
  return detectAdviceOpportunities({
    drugs: [{ lineIndex: 0, drugName: substance, knowledge: drug({ name: substance, inn: substance, atcCode, therapeuticClass: over.therapeuticClass ?? null, commonSideEffects: [] }), officialSubstance: substance }],
    patient: patient(over.patient),
    needs: [],
  });
}
const keysFor = (atcCode: string, over: Parameters<typeof opportunities>[1] = {}) => opportunities(atcCode, over).map((o) => o.key);

describe("cinq règles à relire, sourcées, au conditionnel", () => {
  it.each(KEYS)("« %s » : PENDING, version 1.0.0, jamais SAFETY, pas une ligne de la Base maître", (key) => {
    const r = rule(key);
    expect(r).toBeDefined();
    expect(r.validation).toEqual({ status: "PENDING" });
    expect(r.version).toBe("1.0.0");
    expect(r.kind).not.toBe("SAFETY");
    expect(r.sourceRules).toBeUndefined();
    expect(r.triggerMode).toBe("CLASS_ONLY");
  });

  it.each(KEYS)("« %s » : texte au conditionnel, jamais « doit »", (key) => {
    const r = rule(key);
    for (const text of [r.rationaleTemplate, r.counterScriptTemplate, r.patientReasonTemplate]) expect(text).not.toMatch(/\b(doit|doivent|il faut|obligatoire)\b/i);
    expect(`${r.rationaleTemplate} ${r.counterScriptTemplate}`).toMatch(/\b(peut|peuvent|à envisager|à évoquer)\b/);
    expect(r.counterScriptTemplate).toContain("{product}");
    expect(r.patientReasonTemplate).toContain("{product}");
    expect(r.shortReasonTemplate).not.toContain("{product}");
  });

  it.each(KEYS)("« %s » : la source est nommée dans la règle et dans docs/sources-conseil.md", (key) => {
    expect(rule(key).clinicalContext).toMatch(/(RCP|Assurance Maladie|SFR|GRIO|code de la santé publique|CSP)/);
    const doc = readFileSync(resolve(process.cwd(), "docs/sources-conseil.md"), "utf8");
    expect(doc).toContain(`\`${key}\``);
  });

  it.each(KEYS)("« %s » : une question, posée avant toute proposition", (key) => {
    const r = rule(key);
    expect(r.question).toBeTruthy();
    expect(r.confirmedReasonTemplate).toBeTruthy();
    const atc = { "inhaler-spacer-chamber": "R03AC02", "head-lice-comb": "P03AC04", "self-injection-sharps-container": "A10AB05", "corticosteroid-oral-calcium": "H02AB07", "hypoglycemia-fast-sugar": "A10BB09" }[key];
    const opportunity = opportunities(atc).find((o) => o.key === key)!;
    expect(opportunity.requiresConfirmation).toBe(true);
    expect(opportunity.question).toBe(r.question);
  });

  it("la raison courte reste lisible d'un coup d'œil, avec la substance déclencheuse", () => {
    const cases: [Key, string][] = [["inhaler-spacer-chamber", "R03AC02"], ["head-lice-comb", "P03AC04"], ["self-injection-sharps-container", "A10AB05"], ["corticosteroid-oral-calcium", "H02AB07"], ["hypoglycemia-fast-sugar", "A10BB09"]];
    for (const [key, atc] of cases) {
      const short = opportunities(atc, { substance: "SALBUTAMOL" }).find((o) => o.key === key)!.shortReason;
      expect(short.length).toBeLessThanOrEqual(130);
      expect(short).toContain("SALBUTAMOL");
    }
  });

  it("les familles : trois produits de parapharmacie, deux compléments", () => {
    const family = (key: Key) => adviceFamilyOf({ category: rule(key).category });
    expect(family("inhaler-spacer-chamber")).toBe("PARAPHARMACIE");
    expect(family("head-lice-comb")).toBe("PARAPHARMACIE");
    expect(family("self-injection-sharps-container")).toBe("PARAPHARMACIE");
    expect(family("corticosteroid-oral-calcium")).toBe("COMPLEMENT");
    expect(family("hypoglycemia-fast-sugar")).toBe("COMPLEMENT");
  });
});

describe("chaque règle se déclenche sur sa classe, et sur aucune autre", () => {
  const TABLE: { key: Key; yes: string[]; no: string[] }[] = [
    {
      key: "inhaler-spacer-chamber",
      yes: ["R03AC02", "R03AC13", "R03BA01", "R03BA05"],
      // Anticholinergique, bêta-2 par voie orale, antihistaminique, opioïde, antibiotique.
      no: ["R03BB04", "R03CC02", "R06AX27", "N02AA01", "J01CA04"],
    },
    { key: "head-lice-comb", yes: ["P03AC04", "P03AX03"], no: ["P02CF01", "J01CA04", "D10BA01", "D07AC01"] },
    {
      key: "self-injection-sharps-container",
      yes: ["A10AB05", "A10AE04", "A10BJ02", "B01AB05"],
      // Metformine, sulfamide, DPP-4, anticoagulant oral, antiagrégant, tramadol.
      no: ["A10BA02", "A10BB09", "A10BH01", "B01AF02", "B01AC06", "N02AX02"],
    },
    { key: "corticosteroid-oral-calcium", yes: ["H02AB07", "H02AB06"], no: ["H02AA02", "R03BA01", "D07AC01", "H03AA01", "M01AE01"] },
    {
      key: "hypoglycemia-fast-sugar",
      yes: ["A10AB05", "A10BB09", "A10BX02"],
      // Metformine, DPP-4, GLP-1, iSGLT2 : pas d'hypoglycémie propre.
      no: ["A10BA02", "A10BH01", "A10BJ02", "A10BK01", "C09AA05"],
    },
  ];

  for (const { key, yes, no } of TABLE) {
    it.each(yes)(`« ${key} » se déclenche sur %s`, (atc) => {
      expect(keysFor(atc)).toContain(key);
    });
    it.each(no)(`« ${key} » ne se déclenche pas sur %s`, (atc) => {
      expect(keysFor(atc)).not.toContain(key);
    });
  }

  it("la classe écrite par le modèle déclenche aussi, mais « sensibilisateur à l'insuline » ne déclenche rien", () => {
    expect(keysFor("", { therapeuticClass: "Analogue de l'insuline à action rapide" })).toEqual(expect.arrayContaining(["self-injection-sharps-container", "hypoglycemia-fast-sugar"]));
    expect(keysFor("", { therapeuticClass: "Sensibilisateur à l'insuline" })).not.toContain("self-injection-sharps-container");
    expect(keysFor("", { therapeuticClass: "Sensibilisateur à l'insuline" })).not.toContain("hypoglycemia-fast-sugar");
  });

  it("une insuline appelle le collecteur, le sucre rapide et les soins du pied : trois familles de gestes, aucun doublon", () => {
    const keys = keysFor("A10AB05");
    expect(keys).toEqual(expect.arrayContaining(["self-injection-sharps-container", "hypoglycemia-fast-sugar", "diabetes-foot-care"]));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("la population : écartée quand la source le dit, jamais autrement", () => {
  it("le calcium est écarté en cas d'insuffisance rénale, de lithiase calcique, d'hypercalcémie ou chez l'enfant", () => {
    for (const over of [{ renalImpairment: true }, { chronicConditions: ["Lithiase calcique"] }, { chronicConditions: ["hypercalcémie"] }, { ageYears: 12 }]) {
      const opportunity = opportunities("H02AB07", { patient: over }).find((o) => o.key === "corticosteroid-oral-calcium")!;
      expect(opportunity.isBlocked, JSON.stringify(over)).toBe(true);
      expect(opportunity.blockReason).toBeTruthy();
    }
    expect(opportunities("H02AB07").find((o) => o.key === "corticosteroid-oral-calcium")!.isBlocked).toBe(false);
  });

  it("les quatre autres règles ne citent aucune contre-indication de population : rien n'est écarté", () => {
    const patients: Partial<PatientContext>[] = [{ ageYears: 3 }, { ageYears: 85 }, { isPregnant: true }, { isBreastfeeding: true }, { renalImpairment: true }, { chronicConditions: ["asthme", "épilepsie"] }];
    const cases: [Key, string][] = [["inhaler-spacer-chamber", "R03AC02"], ["head-lice-comb", "P03AC04"], ["self-injection-sharps-container", "A10AB05"], ["hypoglycemia-fast-sugar", "A10BB09"]];
    for (const [key, atc] of cases) for (const over of patients) expect(opportunities(atc, { patient: over }).find((o) => o.key === key)!.isBlocked, `${key} ${JSON.stringify(over)}`).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// De bout en bout : le produit vient du stock, rangé par le dictionnaire.
// ---------------------------------------------------------------------------

/** Un produit du stock tel que le dictionnaire le range à l'import. */
function stock(id: string, name: string, over: Partial<CatalogProduct> = {}): CatalogProduct {
  const classified = classifyProductByName(name);
  return product({ id, name, brand: null, category: classified?.category ?? "AUTRE", subCategory: null, matchingTags: classified?.tags ?? [], commercialClaims: [], description: null, stockQuantity: 6, salePriceCents: 1200, ...over });
}

function analyse(atcCode: string, catalog: CatalogProduct[], over: { patient?: Partial<PatientContext>; substance?: string } = {}) {
  const substance = over.substance ?? "SUBSTANCE";
  return runAnalysisPipeline({
    lines: [{ lineIndex: 0, drugName: substance, posology: null, durationDays: null, confirmed: true }],
    knowledge: new Map([[substance.toLowerCase(), drug({ name: substance, inn: substance, atcCode, therapeuticClass: null, commonSideEffects: [] })]]),
    patient: patient(over.patient),
    catalog,
    rules: [],
    history: {},
    explanations: [],
    extractionFindings: [],
    usedSimulatedProviders: false,
  });
}
const idsFor = (result: ReturnType<typeof analyse>, key: Key) => result.recommendations.filter((r) => r.opportunityKey === key).map((r) => r.productId);

describe("chambre d'inhalation, de bout en bout", () => {
  const adult = stock("adulte", "AEROCHAMBER PLUS CHAMBRE D'INHALATION ADULTE EMBOUT");
  const baby = stock("bebe", "BABYHALER CHAMBRE D'INHALATION BEBE MASQUE");

  it("propose la chambre du stock pour un aérosol-doseur, en attendant la réponse du patient", () => {
    const result = analyse("R03AC02", [adult], { substance: "SALBUTAMOL" });
    expect(idsFor(result, "inhaler-spacer-chamber")).toEqual(["adulte"]);
    const opportunity = result.opportunities.find((o) => o.key === "inhaler-spacer-chamber")!;
    expect(opportunity.requiresConfirmation).toBe(true);
    expect(opportunity.coverage).toBe("COVERED");
  });

  it("un jeune enfant reçoit la chambre à masque, un adulte celle à embout, jamais la chambre de nourrisson", () => {
    expect(idsFor(analyse("R03AC02", [adult, baby], { patient: { ageYears: 3 } }), "inhaler-spacer-chamber")[0]).toBe("bebe");
    expect(idsFor(analyse("R03AC02", [baby, adult], { patient: { ageYears: 40 } }), "inhaler-spacer-chamber")).toEqual(["adulte"]);
    // Sans autre chambre que celle du nourrisson, un adulte n'en reçoit aucune : rien d'inventé.
    expect(idsFor(analyse("R03AC02", [baby], { patient: { ageYears: 40 } }), "inhaler-spacer-chamber")).toEqual([]);
  });

  it("un stock sans chambre : aucune proposition, besoin non référencé", () => {
    const result = analyse("R03AC02", [stock("autre", "SHAMPOOING DOUX 200 ML")]);
    expect(idsFor(result, "inhaler-spacer-chamber")).toEqual([]);
    expect(result.opportunities.find((o) => o.key === "inhaler-spacer-chamber")?.coverage).toBe("NOT_REFERENCED");
  });

  it("une chambre en rupture n'est jamais proposée", () => {
    const result = analyse("R03AC02", [{ ...adult, stockQuantity: 0 }]);
    expect(idsFor(result, "inhaler-spacer-chamber")).toEqual([]);
    expect(result.opportunities.find((o) => o.key === "inhaler-spacer-chamber")?.coverage).toBe("OUT_OF_STOCK");
  });
});

describe("peigne à poux, de bout en bout", () => {
  it("propose le peigne, jamais la lotion ni le peigne électrique", () => {
    const result = analyse("P03AC04", [stock("peigne", "PEIGNE ANTI-POUX INOX"), stock("lotion", "LOTION ANTI-POUX ET LENTES 100 ML"), stock("elec", "PEIGNE ANTI-POUX ELECTRIQUE")]);
    expect(idsFor(result, "head-lice-comb")).toEqual(["peigne"]);
  });

  it("attend la question « poux ou gale ? » avant de proposer", () => {
    const opportunity = analyse("P03AX01", [stock("peigne", "PEIGNE ANTI-POUX INOX")]).opportunities.find((o) => o.key === "head-lice-comb")!;
    expect(opportunity.requiresConfirmation).toBe(true);
    expect(opportunity.question).toMatch(/poux/);
    expect(opportunity.question).toMatch(/gale/);
  });
});

describe("collecteur d'aiguilles, de bout en bout", () => {
  const collector = stock("collecteur", "COLLECTEUR D'AIGUILLES DASTRI 1 L");
  const needles = stock("aiguilles", "AIGUILLES STYLO INSULINE 31G 5 MM BOITE DE 100", { category: "DISPOSITIFS_MEDICAUX" });

  it.each([["A10AB05", "insuline"], ["A10BJ02", "analogue du GLP-1"], ["B01AB05", "héparine de bas poids moléculaire"]])("%s (%s) : le collecteur, pas les aiguilles de stylo", (atc) => {
    const result = analyse(atc, [needles, collector]);
    expect(idsFor(result, "self-injection-sharps-container")).toEqual(["collecteur"]);
    expect(result.opportunities.find((o) => o.key === "self-injection-sharps-container")?.requiresConfirmation).toBe(true);
  });

  it("rien pour un antidiabétique qui ne s'injecte pas", () => {
    expect(idsFor(analyse("A10BA02", [collector]), "self-injection-sharps-container")).toEqual([]);
  });
});

describe("calcium sous corticoïde, de bout en bout", () => {
  const calcium = stock("calcium", "OROCAL 500 mg comprimé à croquer");
  const vitaminD = stock("uvedose", "UVEDOSE 100 000 UI solution buvable");

  it("propose un calcium du stock, pas une vitamine D seule, et attend la réponse sur la durée", () => {
    const result = analyse("H02AB07", [calcium, vitaminD], { substance: "PREDNISONE" });
    expect(idsFor(result, "corticosteroid-oral-calcium")).toEqual(["calcium"]);
    expect(result.opportunities.find((o) => o.key === "corticosteroid-oral-calcium")?.question).toMatch(/3 mois/);
  });

  it("ne propose rien à un patient en insuffisance rénale : écarté par la sécurité, pas un manque d'assortiment", () => {
    const result = analyse("H02AB07", [calcium], { patient: { renalImpairment: true } });
    expect(idsFor(result, "corticosteroid-oral-calcium")).toEqual([]);
    const opportunity = result.opportunities.find((o) => o.key === "corticosteroid-oral-calcium")!;
    expect(opportunity.isBlocked).toBe(true);
    expect(opportunity.coverage).toBeNull();
  });

  it("ne se déclenche pas sur un corticoïde inhalé", () => {
    expect(idsFor(analyse("R03BA01", [calcium]), "corticosteroid-oral-calcium")).toEqual([]);
  });
});

describe("sucre rapide, de bout en bout", () => {
  const sugar = stock("dextro", "DEXTRO ENERGY CLASSIC 14 COMPRIMES");
  const glucagon = stock("glucagen", "GLUCAGEN HYPOKIT 1 MG", { category: "NUTRITION" });
  const syrup = stock("sirop", "SIROP DE GLUCOSE 125 ML", { category: "NUTRITION" });

  it.each([["A10AB05", "insuline"], ["A10BB09", "sulfamide"], ["A10BX02", "glinide"]])("%s (%s) : du glucose en comprimés, ni glucagon ni sirop", (atc) => {
    const result = analyse(atc, [glucagon, syrup, sugar]);
    expect(idsFor(result, "hypoglycemia-fast-sugar")).toEqual(["dextro"]);
    expect(result.opportunities.find((o) => o.key === "hypoglycemia-fast-sugar")?.requiresConfirmation).toBe(true);
  });

  it("rien pour la metformine seule", () => {
    expect(analyse("A10BA02", [sugar]).opportunities.map((o) => o.key)).not.toContain("hypoglycemia-fast-sugar");
  });
});

describe("la sécurité passe toujours avant", () => {
  it("aucune de ces règles ne peut dépasser un conseil de sécurité : plafond des conseils non SAFETY", () => {
    const safetyFloor = 80;
    for (const key of KEYS) {
      const atc = { "inhaler-spacer-chamber": "R03AC02", "head-lice-comb": "P03AC04", "self-injection-sharps-container": "A10AB05", "corticosteroid-oral-calcium": "H02AB07", "hypoglycemia-fast-sugar": "A10BB09" }[key];
      expect(opportunities(atc).find((o) => o.key === key)!.priority).toBeLessThan(safetyFloor);
    }
  });
});

describe("la poche chaud/froid : une douleur, pas un rhume (retour d'officine du 10 octobre 2026)", () => {
  const keys = (name: string, atc: string) =>
    detectAdviceOpportunities({
      drugs: [{ lineIndex: 0, drugName: name, knowledge: drug({ name, inn: name.toUpperCase(), atcCode: atc, therapeuticClass: "Antalgique antipyrétique", commonSideEffects: [] }) }],
      patient: patient(),
    }).map((opportunity) => opportunity.key);

  it("Fervex, Dolirhume et Actifed (même code N02BE que le paracétamol) n'ouvrent pas la règle", () => {
    for (const [name, atc] of [["Fervex adulte sachet", "N02BE51"], ["Dolirhume paracétamol pseudoéphédrine", "N02BE51"], ["Actifed rhume jour et nuit", "N02BE51"]] as const) {
      expect(keys(name, atc).filter((key) => key.startsWith("pain-pack-")), name).toEqual([]);
    }
  });

  it("le paracétamol et l'ibuprofène, eux, l'ouvrent toujours", () => {
    expect(keys("Doliprane 1000 mg", "N02BE01")).toContain("pain-pack-back");
    expect(keys("Ibuprofène 400 mg", "M01AE01")).toContain("pain-pack-knee");
  });
});
