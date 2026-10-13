import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La console « Suggestions du robot » : valider une proposition la transforme en conseil central (format de la console
 * « Conseils », validé au nom de la pharmacienne) ou en association commune ; la refuser l'écarte pour toujours. Deux clics
 * ne font jamais deux règles.
 */

const m = vi.hoisted(() => {
  const rows: Record<string, unknown>[] = [];
  return {
    rows,
    addCustomRule: vi.fn(),
    decideRule: vi.fn(),
    addCentralAssociation: vi.fn(),
    decideCentralAssociation: vi.fn(),
    audit: vi.fn(),
    prisma: {
      robotRuleProposal: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows.find((row) => row.id === where.id) ?? null),
        findMany: vi.fn(async () => []),
        updateMany: vi.fn(async ({ where, data }: { where: { id: string; status: string }; data: Record<string, unknown> }) => {
          const row = rows.find((entry) => entry.id === where.id && entry.status === where.status);
          if (!row) return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(rows.find((row) => row.id === where.id) as object, data)),
        count: vi.fn(async () => rows.filter((row) => row.status === "PENDING").length),
      },
      pharmacy: { findMany: vi.fn(async () => []) },
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: m.prisma }));
vi.mock("@/server/audit/log", () => ({ recordAudit: m.audit }));
vi.mock("../central-advice", () => ({
  addCustomRule: m.addCustomRule,
  decideRule: m.decideRule,
  addCentralAssociation: m.addCentralAssociation,
  decideCentralAssociation: m.decideCentralAssociation,
  loadRuleFeedback: vi.fn(async () => new Map()),
}));

const { validateRobotProposal, refuseRobotProposal } = await import("../robot-proposals");
const admin = { id: "adm-donna", fullName: "Donna" };

const proposal = (overrides: Record<string, unknown> = {}) => ({
  id: "prop-1",
  drugKey: "atc:A02AD01",
  drugLabel: "MAALOX MAUX D'ESTOMAC, suspension buvable en sachet",
  atcCode: "A02AD01",
  therapeuticClass: "Antiacides",
  substance: "HYDROXYDE D'ALUMINIUM",
  productKey: "ean:3401000000011",
  productName: "LACTIBIANE Référence gélules",
  productBrand: "Pileje",
  productEan: "3401000000011",
  productCategory: "PROBIOTIQUES",
  productTags: ["probiotique", "flore intestinale"],
  need: "DIGESTIVE_COMFORT",
  reason: "Accompagne le confort digestif pendant la prise d'un antiacide.",
  counterScript: "Pour votre confort digestif, je peux vous proposer {product}.",
  status: "PENDING",
  pharmacyIds: ["ph-a"],
  occurrences: 1,
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.rows.length = 0;
  m.addCustomRule.mockResolvedValue({ ok: true, ruleKey: "custom-abc123", definition: {} });
  m.decideRule.mockResolvedValue({ ok: true, title: "x" });
  m.addCentralAssociation.mockResolvedValue({ ok: true, id: "assoc-1" });
  m.decideCentralAssociation.mockResolvedValue({ ok: true, label: "x" });
});

describe("valider pour toutes les pharmacies", () => {
  it("devient un conseil ajouté (code ATC → rayon et usages), validé au nom de la pharmacienne", async () => {
    m.rows.push(proposal());
    const result = await validateRobotProposal(admin, "prop-1");
    expect(result).toMatchObject({ ok: true });
    expect(m.addCustomRule).toHaveBeenCalledWith(admin, expect.objectContaining({ atcPrefixes: ["A02AD01"], category: "PROBIOTIQUES", matchingTags: ["probiotique", "flore intestinale"], kind: "COMFORT", counterScript: "Pour votre confort digestif, je peux vous proposer {product}." }));
    expect(m.decideRule).toHaveBeenCalledWith(admin, "custom-abc123", "VALIDATE");
    expect(m.rows[0]).toMatchObject({ status: "VALIDATED", centralKind: "CUSTOM_RULE", centralRef: "custom-abc123", decidedByName: "Donna" });
  });

  it("sans étiquette d'usage : une association commune par code-barres", async () => {
    m.rows.push(proposal({ productTags: [] }));
    await validateRobotProposal(admin, "prop-1");
    expect(m.addCentralAssociation).toHaveBeenCalledWith(admin, expect.objectContaining({ trigger: { kind: "MEDICINE", name: "MAALOX MAUX D'ESTOMAC, suspension buvable en sachet" }, advice: { ean: "3401000000011", name: "LACTIBIANE Référence gélules" } }));
    expect(m.rows[0]).toMatchObject({ status: "VALIDATED", centralKind: "ASSOCIATION", centralRef: "association:assoc-1" });
  });

  it("ni étiquette ni code-barres : refusé avec l'explication, la proposition reste à traiter", async () => {
    m.rows.push(proposal({ productTags: [], productEan: null }));
    const result = await validateRobotProposal(admin, "prop-1");
    expect(result).toMatchObject({ ok: false });
    expect(m.rows[0].status).toBe("PENDING");
  });

  it("deux clics ne font qu'une règle ; un échec d'écriture rend la proposition", async () => {
    m.rows.push(proposal());
    await validateRobotProposal(admin, "prop-1");
    expect(await validateRobotProposal(admin, "prop-1")).toMatchObject({ ok: false });
    expect(m.addCustomRule).toHaveBeenCalledTimes(1);

    m.rows.length = 0;
    m.rows.push(proposal({ id: "prop-2" }));
    m.addCustomRule.mockResolvedValueOnce({ ok: false, error: "Six étiquettes au plus." });
    expect(await validateRobotProposal(admin, "prop-2")).toMatchObject({ ok: false, error: "Six étiquettes au plus." });
    expect(m.rows[0].status).toBe("PENDING");
  });
});

describe("refuser", () => {
  it("la proposition est refusée pour toujours, une seule fois", async () => {
    m.rows.push(proposal());
    expect(await refuseRobotProposal(admin, "prop-1")).toMatchObject({ ok: true });
    expect(m.rows[0]).toMatchObject({ status: "REFUSED", decidedByName: "Donna" });
    expect(await refuseRobotProposal(admin, "prop-1")).toMatchObject({ ok: false });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ entityType: "RobotRuleProposal", metadata: expect.objectContaining({ decision: "REFUSE" }) }));
  });
});
