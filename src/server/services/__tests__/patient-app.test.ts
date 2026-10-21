import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  presentation: vi.fn(),
  sideEffects: vi.fn(),
  reference: vi.fn(),
  specialty: vi.fn(),
  partnerProducts: vi.fn(),
  partnerProduct: vi.fn(),
  product: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({
  prisma: {
    drugPresentation: { findUnique: db.presentation },
    drugOfficialSideEffects: { findUnique: db.sideEffects },
    drugReference: { findFirst: db.reference },
    drugSpecialty: { findUnique: db.specialty },
    partnerProduct: { findMany: db.partnerProducts, findFirst: db.partnerProduct },
    product: { findFirst: db.product },
    pharmacy: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock("../central-advice", () => ({ loadCentralAdvice: async () => ({ removed: [], custom: [] }) }));
vi.mock("../drug-identification", () => ({ searchSpecialties: async () => [] }));

const { adviceForSpecialty, lookupProductByCode, MAX_PATIENT_ADVICE } = await import("../patient-app");

const doxy = { id: "sp1", cisCode: "65203952", name: "DOXYCYCLINE BIOGARAN 100 mg, comprimé pelliculé sécable", pharmaceuticalForm: "comprimé pelliculé sécable", administrationRoutes: ["orale"], compositions: [{ substanceLabel: "HYCLATE DE DOXYCYCLINE", dosage: "100 mg", nature: "SA" }], prescriptionConditions: [{ label: "liste I" }] };

beforeEach(() => {
  vi.clearAllMocks();
  db.sideEffects.mockResolvedValue(null);
  db.reference.mockResolvedValue(null);
});

describe("appli des patients : une boîte scannée → sa fiche, rien d'enregistré", () => {
  it("le Datamatrix d'une boîte ouvre la fiche officielle ; la fiche éditoriale n'est lue que si elle n'est pas de démonstration", async () => {
    db.presentation.mockResolvedValue({ label: "plaquette(s) de 5 comprimé(s)", reimbursementRate: 65, specialty: doxy });
    const result = await lookupProductByCode("(01)03400935332639(17)271231");
    expect(db.presentation.mock.calls[0][0].where).toEqual({ cip13: "3400935332639" });
    expect(db.reference.mock.calls[0][0].where).toEqual({ cisCode: "65203952", isDemoData: false });
    expect(result.found && result.sheet.kind === "MEDICINE" && result.sheet.sections.map((s) => s.key)).toEqual(["family", "composition"]);
  });

  it("un effet indésirable n'est montré que si le RCP a été lu (statut READ)", async () => {
    db.presentation.mockResolvedValue({ label: "x", reimbursementRate: null, specialty: doxy });
    db.sideEffects.mockResolvedValue({ status: "NO_FREQUENCY", effects: ["nausées"] });
    const result = await lookupProductByCode("3400935332639");
    expect(result.found && result.sheet.kind === "MEDICINE" && result.sheet.sections.some((s) => s.key === "sideEffects")).toBe(false);
  });

  it("un code inconnu : introuvable, sans rien inventer", async () => {
    db.presentation.mockResolvedValue(null);
    expect(await lookupProductByCode("3400999999999")).toEqual({ found: false });
    expect(await lookupProductByCode("doliprane")).toEqual({ found: false });
  });
});

describe("appli des patients : les conseils ne proposent que de la parapharmacie", () => {
  it("sous doxycycline, la photoprotection ressort avec la crème solaire partenaire ; un médicament partenaire (CIP 3400) n'est jamais proposé", async () => {
    db.specialty.mockResolvedValue({ name: doxy.name, cisCode: doxy.cisCode, pharmaceuticalForm: doxy.pharmaceuticalForm, compositions: [{ substanceLabel: "DOXYCYCLINE", nature: "FT" }] });
    db.partnerProducts.mockResolvedValue([
      { id: "p-solaire", name: "Crème solaire SPF 50+ très haute protection", ean: "3337875597180", cip13: null, description: "écran solaire visage et corps", imageUrl: null, publicPriceCents: 1690, brand: { name: "Marque A" } },
      { id: "p-medicament", name: "Crème solaire SPF 50+ médicament", ean: "3400935332639", cip13: "3400935332639", description: null, imageUrl: null, publicPriceCents: 900, brand: { name: "Marque B" } },
    ]);
    const advice = await adviceForSpecialty("sp1");
    expect(advice.length).toBeGreaterThan(0);
    expect(advice.length).toBeLessThanOrEqual(MAX_PATIENT_ADVICE);
    const ids = advice.flatMap((item) => item.products.map((p) => p.id));
    expect(ids).not.toContain("p-medicament");
    expect(advice.some((item) => /photoprotection/i.test(item.title))).toBe(true);
  });

  it("famille officielle inconnue : aucun conseil (rien n'est deviné)", async () => {
    db.specialty.mockResolvedValue({ name: "X", cisCode: "00000000", pharmaceuticalForm: null, compositions: [] });
    expect(await adviceForSpecialty("sp-x")).toEqual([]);
  });
});
