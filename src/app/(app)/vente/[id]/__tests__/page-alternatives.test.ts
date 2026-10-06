import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScoredAlternative } from "@/core/ai/types";
import type { AdviceView } from "../types";

/**
 * Ce que la page de vente donne à l'écran pour ranger un conseil sous son
 * médicament et lui montrer ses alternatives : le rattachement aux lignes,
 * puis les autres références enrichies d'UNE requête sur les produits de
 * l'officine (nom, prix, stock du jour). La page est appelée pour de bon ;
 * seuls la base et les services voisins sont simulés.
 */

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
  prescriptionFindUnique: vi.fn(),
  productFindMany: vi.fn(),
  products: [] as Row[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/server/db/demo-scope", () => ({ activityScope: () => ({}) }));
vi.mock("@/server/db/client", () => ({
  prisma: {
    prescription: { findUnique: mocks.prescriptionFindUnique },
    patient: { findMany: async () => [] },
    stockConnection: { findUnique: async () => null },
    product: { findMany: mocks.productFindMany },
  },
}));
vi.mock("@/server/auth/session", () => ({
  requirePermission: async () => ({
    scope: { pharmacyId: "ph_1", organizationId: "org_1", userId: "user_1" },
    permissions: new Set(["prescription:view", "recommendation:decide"]),
  }),
}));
vi.mock("@/config/env", () => ({ patientDataEnabled: () => false }));
vi.mock("@/server/services/reference", () => ({ getReferenceCatalogState: async () => ({ status: "EMPTY" }) }));
vi.mock("@/server/services/drug-identification", () => ({ proposeSpecialties: async () => [] }));
vi.mock("@/server/services/drug-catalog", () => ({ loadPrescribedAvailability: async () => new Map() }));
vi.mock("@/server/services/regulation", () => ({ evaluateLinesRegulation: async () => [] }));
vi.mock("@/server/services/patients", () => ({ buildPatientContext: async () => ({}) }));
vi.mock("@/server/services/stock-lots", () => ({ nearestShortDatesFor: async () => new Map(), todayFor: async () => new Date("2026-10-05T00:00:00Z") }));
vi.mock("@/server/services/training", () => ({ trainingsForProducts: async () => new Map() }));
vi.mock("@/server/services/partners/visibility", () => ({ counterBrandsFor: async () => [] }));
vi.mock("../sale-workspace", () => ({ SaleWorkspace: () => null }));

const { default: SalePage } = await import("../page");

const BREAKDOWN = { relevance: 1, safety: 1, availability: 1, patientFit: 0.95, pharmacistPreference: 0.5, validationHistory: 0.5, commercial: 0.8 };

function stored(productId: string, shortReason = "Antibiothérapie : la flore intestinale peut être perturbée."): ScoredAlternative {
  return {
    productId,
    totalScore: 0.8,
    breakdown: BREAKDOWN,
    justification: `Référence retenue : ${productId}.`,
    shortReason,
    patientReason: `${productId} l'accompagne.`,
    counterScript: `« ${productId} l'accompagne. »`,
    precautions: [],
    explanation: [],
    vigilances: [],
    shortDate: null,
  };
}

const catalogProduct = (id: string, overrides: Row = {}) => ({
  id,
  pharmacyId: "ph_1",
  name: `Produit ${id}`,
  brand: "Vitalys",
  imageUrl: null,
  imageSource: null,
  salePriceCents: 1490,
  purchasePriceCents: 600,
  commercialClaims: [],
  isActive: true,
  stockItem: { quantity: 8, alertThreshold: 5 },
  ...overrides,
});

function recommendation(id: string, overrides: Row = {}) {
  return {
    id,
    status: "PROPOSED",
    origin: "AI",
    totalScore: 0.9,
    justification: "j",
    shortReason: "s",
    patientReason: "p",
    counterScript: "c",
    precautions: [],
    quantity: 1,
    unitPriceCents: 1490,
    pharmacistNote: null,
    decidedBy: null,
    scoreBreakdown: { ...BREAKDOWN, explanation: [] },
    opportunity: null,
    routine: null,
    productId: "p1",
    product: catalogProduct("p1"),
    presentation: null,
    companion: null,
    vigilances: null,
    alternatives: null,
    ...overrides,
  };
}

const opportunity = (triggeredLineIds: string[] | undefined) => ({
  id: "opp_1",
  title: "Tolérance digestive",
  rationale: "r",
  clinicalContext: null,
  priority: 72,
  safetyNotes: [],
  question: null,
  requiresConfirmation: false,
  answer: null,
  answeredAt: null,
  aiJustification: null,
  confirmedReason: null,
  benefits: [],
  category: "PROBIOTIQUES",
  isBlocked: false,
  ...(triggeredLineIds ? { triggeredLineIds } : {}),
});

function line(id: string, position: number) {
  return {
    id,
    position,
    rawText: null,
    drugName: `Médicament ${position}`,
    dosage: null,
    form: null,
    posology: null,
    schedule: null,
    durationDays: null,
    quantity: null,
    instructions: null,
    fieldConfidence: {},
    unreadableFields: [],
    status: "CONFIRMED",
    explanation: null,
    specialty: null,
    drugSpecialtyId: null,
    identifiedBy: null,
    regulationChecks: [],
    updatedAt: new Date("2026-10-05T09:00:00Z"),
  };
}

function prescription(recommendations: ReturnType<typeof recommendation>[]) {
  return {
    id: "rx_1",
    pharmacyId: "ph_1",
    reference: "ORD-0001",
    status: "ANALYZED",
    verifiedAt: null,
    patientId: null,
    patient: null,
    prescriberName: null,
    prescribedAt: null,
    source: "UPLOAD",
    lines: [line("line_a", 0), line("line_b", 1)],
    recommendations,
    analysisRuns: [],
    sales: [],
  };
}

async function render(recommendations: ReturnType<typeof recommendation>[]): Promise<AdviceView[]> {
  mocks.prescriptionFindUnique.mockResolvedValue(prescription(recommendations));
  const element = (await SalePage({ params: Promise.resolve({ id: "rx_1" }) })) as { props: { recommendations: AdviceView[] } };
  return element.props.recommendations;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.products = [];
  // Une base minimale : elle applique les filtres de la requête, comme la vraie.
  mocks.productFindMany.mockImplementation(async ({ where }: { where: { id: { in: string[] }; pharmacyId: string; isActive: boolean } }) =>
    mocks.products.filter((p) => where.id.in.includes(p.id as string) && p.pharmacyId === where.pharmacyId && p.isActive === where.isActive),
  );
});

describe("le rattachement d'un conseil à ses médicaments", () => {
  it("reprend les lignes qui l'ont déclenché, dans l'ordre enregistré", async () => {
    const [advice] = await render([recommendation("rec_1", { opportunity: opportunity(["line_b", "line_a"]) })]);
    expect(advice.lineIds).toEqual(["line_b", "line_a"]);
  });

  it("une analyse ancienne (colonne vide ou absente), un conseil sans besoin ou ajouté à la main : aucune ligne, sans erreur", async () => {
    const [empty, absent, noOpportunity, manual] = await render([
      recommendation("rec_empty", { opportunity: opportunity([]) }),
      recommendation("rec_absent", { opportunity: opportunity(undefined) }),
      recommendation("rec_none", { opportunity: null }),
      recommendation("rec_manual", { origin: "MANUAL", opportunity: null }),
    ]);
    for (const advice of [empty, absent, noOpportunity, manual]) {
      expect(advice.lineIds).toEqual([]);
      expect(advice.alternatives).toEqual([]);
    }
  });
});

describe("les alternatives d'un conseil", () => {
  it("s'enrichissent du nom, de la marque, de l'image, du prix et du stock du jour", async () => {
    mocks.products = [
      catalogProduct("p2", { name: "Probiotique B", brand: "Vitalys", imageUrl: "https://images.example/b.png", salePriceCents: 1690, stockItem: { quantity: 3, alertThreshold: 5 } }),
      catalogProduct("p3", { name: "Probiotique C", brand: null, salePriceCents: 990, stockItem: { quantity: 40, alertThreshold: 5 } }),
    ];
    const [advice] = await render([
      recommendation("rec_1", { alternatives: [stored("p2", "Raison de B"), stored("p3", "")] }),
    ]);
    expect(advice.alternatives).toEqual([
      { productId: "p2", name: "Probiotique B", brand: "Vitalys", imageUrl: "https://images.example/b.png", salePriceCents: 1690, quantity: 3, shortReason: "Raison de B" },
      { productId: "p3", name: "Probiotique C", brand: null, imageUrl: null, salePriceCents: 990, quantity: 40, shortReason: null },
    ]);
  });

  it("se lisent par UNE requête groupée, filtrée sur l'officine de la session et sur les produits actifs", async () => {
    mocks.products = [catalogProduct("p2"), catalogProduct("p3"), catalogProduct("p4")];
    await render([
      recommendation("rec_1", { alternatives: [stored("p2"), stored("p3")] }),
      recommendation("rec_2", { productId: "p9", product: catalogProduct("p9"), alternatives: [stored("p3"), stored("p4")] }),
    ]);
    expect(mocks.productFindMany).toHaveBeenCalledTimes(1);
    const [{ where }] = mocks.productFindMany.mock.calls[0];
    expect(where.pharmacyId).toBe("ph_1");
    expect(where.isActive).toBe(true);
    expect([...where.id.in].sort()).toEqual(["p2", "p3", "p4"]);
  });

  it("écartent sans bruit une référence disparue, inactive, hors stock, sans fiche de stock ou d'une autre officine", async () => {
    mocks.products = [
      catalogProduct("ok"),
      catalogProduct("inactive", { isActive: false }),
      catalogProduct("rupture", { stockItem: { quantity: 0, alertThreshold: 5 } }),
      catalogProduct("negatif", { stockItem: { quantity: -2, alertThreshold: 5 } }),
      catalogProduct("sans-stock", { stockItem: null }),
      catalogProduct("autre-officine", { pharmacyId: "ph_2" }),
    ];
    const [advice] = await render([
      recommendation("rec_1", { alternatives: ["disparue", "inactive", "rupture", "negatif", "sans-stock", "autre-officine", "ok"].map((id) => stored(id)) }),
    ]);
    expect(advice.alternatives.map((a) => a.productId)).toEqual(["ok"]);
  });

  it("n'en montrent jamais plus de trois", async () => {
    mocks.products = ["p2", "p3", "p4", "p5", "p6"].map((id) => catalogProduct(id));
    const [advice] = await render([recommendation("rec_1", { alternatives: ["p2", "p3", "p4", "p5", "p6"].map((id) => stored(id)) })]);
    expect(advice.alternatives.map((a) => a.productId)).toEqual(["p2", "p3", "p4"]);
  });

  it("ne remettent pas la référence retenue à côté d'elle-même", async () => {
    mocks.products = [catalogProduct("p1"), catalogProduct("p2")];
    const [advice] = await render([recommendation("rec_1", { alternatives: [stored("p1"), stored("p2")] })]);
    expect(advice.alternatives.map((a) => a.productId)).toEqual(["p2"]);
  });

  it("restent propres à chaque conseil, même quand une référence sert à deux conseils", async () => {
    mocks.products = [catalogProduct("p2"), catalogProduct("p3")];
    const [first, second] = await render([
      recommendation("rec_1", { alternatives: [stored("p2")] }),
      recommendation("rec_2", { productId: "p9", product: catalogProduct("p9"), alternatives: [stored("p2"), stored("p3")] }),
    ]);
    expect(first.alternatives.map((a) => a.productId)).toEqual(["p2"]);
    expect(second.alternatives.map((a) => a.productId)).toEqual(["p2", "p3"]);
  });

  it("une colonne vide ou illisible donne une liste vide, sans requête et sans erreur", async () => {
    const advice = await render([
      recommendation("rec_null", { alternatives: null }),
      recommendation("rec_junk", { alternatives: "n'importe quoi" }),
      recommendation("rec_partial", { alternatives: [{ productId: "p2" }, null, 3] }),
    ]);
    for (const view of advice) expect(view.alternatives).toEqual([]);
    expect(mocks.productFindMany).not.toHaveBeenCalled();
  });

  it("ne changent rien au reste de la carte ni à l'ordre des conseils", async () => {
    mocks.products = [catalogProduct("p2")];
    const [first, second] = await render([
      recommendation("rec_low", { totalScore: 0.7, opportunity: { ...opportunity([]), priority: 40 } }),
      recommendation("rec_high", { totalScore: 0.8, opportunity: { ...opportunity(["line_a"]), priority: 90 }, alternatives: [stored("p2")] }),
    ]);
    // La priorité clinique commande l'ordre, comme avant.
    expect([first.id, second.id]).toEqual(["rec_high", "rec_low"]);
    expect(first.product).toMatchObject({ id: "p1", name: "Produit p1", quantity: 8, salePriceCents: 1490 });
  });
});

describe("la famille d'un conseil, calculée côté serveur", () => {
  const presentation = { id: "pres_1", priceCents: 520, imageUrl: null, imageSource: null, specialty: { name: "SPASFON LYOC" }, pharmacyStocks: [{ quantity: 4, alertThreshold: 1, priceCents: 520 }] };

  it("un produit de l'officine : sa catégorie décide (complément alimentaire, ou parapharmacie)", async () => {
    const [probiotique, magnesium, creme, dispositif] = await render([
      recommendation("rec_1", { product: catalogProduct("p1", { category: "PROBIOTIQUES" }) }),
      recommendation("rec_2", { product: catalogProduct("p2", { category: "MAGNESIUM" }) }),
      recommendation("rec_3", { product: catalogProduct("p3", { category: "DERMOCOSMETIQUE" }) }),
      recommendation("rec_4", { product: catalogProduct("p4", { category: "DISPOSITIFS_MEDICAUX" }) }),
    ]);
    expect(probiotique.family).toBe("COMPLEMENT");
    expect(magnesium.family).toBe("COMPLEMENT");
    expect(creme.family).toBe("PARAPHARMACIE");
    expect(dispositif.family).toBe("PARAPHARMACIE");
  });

  it("une présentation du catalogue national est un médicament conseil", async () => {
    const [advice] = await render([recommendation("rec_1", { productId: null, product: null, presentation })]);
    expect(advice.family).toBe("MEDICAMENT");
  });

  it("sans produit : parapharmacie par défaut, sans erreur", async () => {
    const [advice] = await render([recommendation("rec_1", { productId: null, product: null, presentation: null })]);
    expect(advice.family).toBe("PARAPHARMACIE");
  });

  it("ne change ni l'ordre des conseils ni leur score", async () => {
    const [first, second] = await render([
      recommendation("rec_low", { totalScore: 0.7, product: catalogProduct("p1", { category: "PROBIOTIQUES" }), opportunity: { ...opportunity([]), priority: 40 } }),
      recommendation("rec_high", { totalScore: 0.8, product: catalogProduct("p2", { category: "HYGIENE" }), opportunity: { ...opportunity(["line_a"]), priority: 90 } }),
    ]);
    expect([first.id, second.id]).toEqual(["rec_high", "rec_low"]);
    expect([first.totalScore, second.totalScore]).toEqual([0.8, 0.7]);
    expect([first.family, second.family]).toEqual(["PARAPHARMACIE", "COMPLEMENT"]);
  });
});
