import { beforeEach, describe, expect, it, vi } from "vitest";
import { ENGINE_VERSION, MAX_RECOMMENDATIONS_PER_PRESCRIPTION } from "@/config/constants";
import { detectAdviceOpportunities } from "../engines/advice";
import { reserveFamilies, type PortfolioProfile } from "../portfolio";
import type { AdviceKind, AdviceOpportunityResult, AnalysisResult, CatalogProduct, ProductCategoryCode, ScoredRecommendation } from "../types";
import { product } from "./fixtures";
import { AMOXICILLINE, SPIRONOLACTONE, analyse, probioticShelf } from "./scenarios-conseils";

/**
 * Le câblage du moteur, éprouvé par le parcours réel de `runAnalysisPipeline`.
 *
 * Les règles et la sélection ont leurs propres tests ; ici on tient les fils
 * qui les relient, et que rien d'autre ne tient :
 *  - ce que le pipeline dit à la sélection d'un conseil de SÉCURITÉ (jamais déplacé) ;
 *  - la durée de l'ordonnance, qui doit arriver jusqu'aux règles ;
 *  - la version du moteur, enregistrée sur chaque analyse.
 *
 * `detectAdviceOpportunities` et `reserveFamilies` sont enveloppés d'un espion qui
 * appelle la VRAIE fonction : rien n'est simulé, sauf, dans quelques tests, la
 * liste des besoins (le seul moyen de fabriquer un conseil de sécurité de faible
 * priorité, que les règles écrites n'ont pas).
 */

vi.mock("../engines/advice", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../engines/advice")>();
  return { ...actual, detectAdviceOpportunities: vi.fn(actual.detectAdviceOpportunities) };
});
vi.mock("../portfolio", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../portfolio")>();
  return { ...actual, reserveFamilies: vi.fn(actual.reserveFamilies) };
});

const detect = vi.mocked(detectAdviceOpportunities);
const reserve = vi.mocked(reserveFamilies);

beforeEach(() => {
  detect.mockClear();
  reserve.mockClear();
});

const keys = (result: AnalysisResult) => result.recommendations.map((r) => r.opportunityKey);
const traceNotes = (result: AnalysisResult) => result.trace.find((stage) => stage.stage === "COMMERCIAL_OPTIMIZATION")?.notes ?? [];

const stocked = (id: string, name: string, category: CatalogProduct["category"], tags: string[]) =>
  product({ id, name, category, subCategory: null, matchingTags: tags, commercialClaims: [], stockQuantity: 6 });

// --- La sécurité : jamais déplacée -------------------------------------------

describe("un conseil de sécurité n'est jamais déplacé : le pipeline le dit à la sélection", () => {
  it("avec les vraies règles, le conseil de photosensibilisation est profilé « sécurité », et lui seul", () => {
    const sun = stocked("sun", "Écran solaire SPF50", "DERMOCOSMETIQUE", ["protection solaire", "spf", "photoprotection"]);
    const result = analyse([SPIRONOLACTONE, AMOXICILLINE], [sun, ...probioticShelf()]);
    expect(keys(result)).toEqual(expect.arrayContaining(["sun-photosensitivity", "digestive-tolerance-antibiotics"]));

    expect(reserve).toHaveBeenCalledTimes(1);
    const [selected, limit, profileOf] = reserve.mock.calls[0] as unknown as [ScoredRecommendation[], number, (item: ScoredRecommendation) => PortfolioProfile];
    expect(limit).toBe(MAX_RECOMMENDATIONS_PER_PRESCRIPTION);
    const safetyByKey = Object.fromEntries(selected.map((item) => [item.opportunityKey, profileOf(item).safety]));
    expect(safetyByKey["sun-photosensitivity"]).toBe(true);
    expect(safetyByKey["digestive-tolerance-antibiotics"]).toBe(false);
    expect(Object.values(safetyByKey).filter(Boolean)).toHaveLength(1);
  });

  /** Des besoins fabriqués : quatre conseils, dont un de sécurité, le dernier de la liste classée. */
  function needs(lastKind: AdviceKind): AdviceOpportunityResult[] {
    const base = (key: string, kind: AdviceKind, priority: number, category: ProductCategoryCode, tag: string): AdviceOpportunityResult => ({
      key,
      kind,
      category,
      title: key,
      rationale: "Test.",
      shortReason: "Test.",
      counterScriptTemplate: "« {product} »",
      patientReasonTemplate: "{product}",
      clinicalContext: null,
      safetyNotes: [],
      priority,
      isBlocked: false,
      blockReason: null,
      matchingTags: [tag],
      excludeTags: [],
      triggeredBy: [{ lineIndex: 0, drugName: AMOXICILLINE.name }],
    });
    return [
      base("conseil-a", "COMFORT", 90, "SOINS", "alpha"),
      base("conseil-b", "COMFORT", 80, "SOINS", "beta"),
      base("conseil-c", lastKind, 70, "SOINS", "gamma"),
      base("conseil-d", "COMFORT", 60, "VITAMINES", "delta"),
    ];
  }
  const shelf = [
    stocked("pa", "Produit alpha", "SOINS", ["alpha"]),
    stocked("pb", "Produit beta", "SOINS", ["beta"]),
    stocked("pc", "Produit gamma", "SOINS", ["gamma"]),
    stocked("pd", "Produit delta", "VITAMINES", ["delta"]),
  ];

  it("témoin : la même liste, le dernier conseil étant de confort, est déplacée pour garder la famille manquante", () => {
    detect.mockImplementationOnce(() => needs("COMFORT"));
    const result = analyse([AMOXICILLINE], shelf, { maxRecommendations: 3 });
    // Retenus d'abord : a, b, c (tous de parapharmacie). Le complément (d) manque : il prend la place du dernier déplaçable, c.
    expect(keys(result)).toEqual(["conseil-a", "conseil-b", "conseil-d"]);
    expect(traceNotes(result)).toContain("Un conseil de la famille « Complément alimentaire » a été gardé malgré la limite.");
  });

  it("le dernier conseil est de SÉCURITÉ : il reste, c'est le conseil de confort d'avant qui cède", () => {
    detect.mockImplementationOnce(() => needs("SAFETY"));
    const result = analyse([AMOXICILLINE], shelf, { maxRecommendations: 3 });
    expect(keys(result)).toEqual(["conseil-a", "conseil-c", "conseil-d"]);
    expect(traceNotes(result)).toContain("Un conseil de la famille « Complément alimentaire » a été gardé malgré la limite.");
  });

  it("un conseil de sécurité garde sa référence : un conseil de confort de priorité plus haute qui voulait la même ne la lui prend pas", () => {
    const comfort = needs("COMFORT")[0];
    const safety: AdviceOpportunityResult = { ...needs("SAFETY")[2], matchingTags: ["alpha"], key: "securite-alpha", priority: 50 };
    detect.mockImplementationOnce(() => [comfort, safety]);
    const result = analyse([AMOXICILLINE], [shelf[0]]);
    // Les deux voulaient « Produit alpha » : une seule carte, et c'est celle de la sécurité.
    expect(result.recommendations.map((r) => [r.opportunityKey, r.productId])).toEqual([["securite-alpha", "pa"]]);
    expect(traceNotes(result)).toContain("« conseil-a » : référence déjà proposée pour un autre conseil, non répétée.");
  });
});

// --- La durée de l'ordonnance --------------------------------------------------

describe("la durée de l'ordonnance arrive jusqu'aux règles de conseil", () => {
  const SOLUPRED = { name: "Solupred 20", atc: "H02AB06", klass: "Corticoïde par voie orale" };
  const line = (lineIndex: number, drugName: string, durationDays: number | null, confirmed = true) => ({ lineIndex, drugName, posology: null, durationDays, confirmed });
  const passedDrugs = () => {
    expect(detect).toHaveBeenCalledTimes(1);
    return detect.mock.calls[0][0].drugs as { lineIndex: number; drugName: string; durationDays?: number | null }[];
  };

  it("une cure de cinq jours est transmise telle quelle", () => {
    analyse([SOLUPRED], [], { lines: [line(0, SOLUPRED.name, 5)] });
    expect(passedDrugs()).toEqual([expect.objectContaining({ lineIndex: 0, drugName: SOLUPRED.name, durationDays: 5 })]);
  });

  it("une durée inconnue reste inconnue : `null`, jamais un zéro ni un défaut", () => {
    analyse([SOLUPRED], [], { lines: [line(0, SOLUPRED.name, null)] });
    expect(passedDrugs()[0].durationDays).toBeNull();
  });

  it("chaque médicament porte SA durée, et une ligne non confirmée n'est pas transmise", () => {
    analyse([SOLUPRED, AMOXICILLINE, { name: "Ibuprofene 400", atc: "M01AE01", klass: "Anti-inflammatoire non stéroïdien" }], [], {
      lines: [line(0, SOLUPRED.name, 120), line(1, AMOXICILLINE.name, 6), line(2, "Ibuprofene 400", 3, false)],
    });
    expect(passedDrugs().map((d) => [d.lineIndex, d.durationDays])).toEqual([
      [0, 120],
      [1, 6],
    ]);
  });
});

describe("la durée de l'ordonnance, de bout en bout : une cure courte de corticoïde n'a pas de conseil osseux", () => {
  const SOLUPRED = { name: "Solupred 20", atc: "H02AB06", klass: "Corticoïde par voie orale" };
  const ALENDRONATE = { name: "Alendronate 70", atc: "M05BA04", klass: "Traitement de l'ostéoporose" };
  const line = (lineIndex: number, drugName: string, durationDays: number | null) => ({ lineIndex, drugName, posology: null, durationDays, confirmed: true });
  const BONE_KEYS = ["corticosteroid-oral-calcium", "vitamin-d-elderly"];
  const shelf = [
    stocked("calcium", "Calcium 500 mg comprimés", "MINERAUX", ["calcium"]),
    stocked("vitd", "Vitamine D3 100 000 UI", "VITAMINES", ["vitamine d", "os", "calcium"]),
  ];
  const boneAdvice = (result: AnalysisResult) => result.opportunities.map((o) => o.key).filter((key) => BONE_KEYS.includes(key));

  it("Solupred 5 jours : ni la question du calcium, ni la vitamine D, donc aucune carte", () => {
    const result = analyse([SOLUPRED], shelf, { lines: [line(0, SOLUPRED.name, 5)] });
    expect(boneAdvice(result)).toEqual([]);
    expect(result.recommendations).toEqual([]);
  });

  it("durée inconnue : la question du calcium reste, et la vitamine D aussi (rien n'est écarté sans savoir)", () => {
    const result = analyse([SOLUPRED], shelf, { lines: [line(0, SOLUPRED.name, null)] });
    expect(boneAdvice(result).sort()).toEqual(BONE_KEYS);
    expect(keys(result)).toEqual(expect.arrayContaining(BONE_KEYS));
  });

  it("corticothérapie de plus de trois mois : les deux conseils restent", () => {
    for (const days of [90, 120]) {
      expect(boneAdvice(analyse([SOLUPRED], shelf, { lines: [line(0, SOLUPRED.name, days)] })).sort(), `${days} jours`).toEqual(BONE_KEYS);
    }
    expect(boneAdvice(analyse([SOLUPRED], shelf, { lines: [line(0, SOLUPRED.name, 89)] }))).toEqual([]);
  });

  it("la durée d'une boîte de biphosphonate n'est pas celle du traitement : la vitamine D reste, sur 28 jours", () => {
    const result = analyse([ALENDRONATE], shelf, { lines: [line(0, ALENDRONATE.name, 28)] });
    expect(boneAdvice(result)).toEqual(["vitamin-d-elderly"]);
  });

  it("une cure courte de corticoïde ne fait pas écarter la vitamine D qu'appelle l'autre médicament de l'ordonnance", () => {
    const result = analyse([SOLUPRED, ALENDRONATE], shelf, { lines: [line(0, SOLUPRED.name, 5), line(1, ALENDRONATE.name, 28)] });
    expect(boneAdvice(result)).toEqual(["vitamin-d-elderly"]);
    const vitaminD = result.opportunities.find((o) => o.key === "vitamin-d-elderly");
    expect(vitaminD?.triggeredBy.map((t) => t.drugName)).toEqual([ALENDRONATE.name]);
  });
});

// --- La version du moteur --------------------------------------------------------

describe("la version du moteur", () => {
  it("passe à 1.1.0 : le lot a changé les règles et la sélection", () => {
    expect(ENGINE_VERSION).toBe("1.1.0");
  });

  it("chaque analyse la porte, y compris celle qui échoue faute de ligne confirmée", () => {
    expect(analyse([AMOXICILLINE], probioticShelf()).engineVersion).toBe("1.1.0");
    const failed = analyse([AMOXICILLINE], probioticShelf(), { lines: [{ lineIndex: 0, drugName: AMOXICILLINE.name, posology: null, durationDays: null, confirmed: false }] });
    expect(failed.status).toBe("FAILED");
    expect(failed.engineVersion).toBe("1.1.0");
  });
});
