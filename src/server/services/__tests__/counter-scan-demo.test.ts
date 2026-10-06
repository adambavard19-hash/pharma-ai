import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Un code-barres que le stock ne connaît pas : une vraie officine interroge les bases ouvertes pour
 * en retrouver le nom ; l'officine de démonstration, jamais. Aucun appel sortant n'est fait pour elle.
 */

const mocks = vi.hoisted(() => ({
  findOpenFactsName: vi.fn(),
  prisma: {
    drugPresentation: { findUnique: vi.fn() },
    productBarcode: { findUnique: vi.fn(), upsert: vi.fn() },
    product: { findFirst: vi.fn(), findMany: vi.fn() },
    counterPost: { findUnique: vi.fn(), update: vi.fn() },
    prescription: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    prescriptionLine: { create: vi.fn(), update: vi.fn(), count: vi.fn() },
    pharmacyDrugStock: { updateMany: vi.fn() },
    stockItem: { updateMany: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: mocks.prisma }));
vi.mock("@/server/audit/log", () => ({ recordAudit: vi.fn() }));
vi.mock("@/config/env", () => ({ isDemoMode: () => false, appEnvironment: () => "development" }));
vi.mock("@/server/services/references", () => ({ nextReference: vi.fn(async () => "ORD-0001") }));
vi.mock("@/server/services/product-images", () => ({ findOpenFactsName: mocks.findOpenFactsName }));

const { recordCounterScan } = await import("../counter-scan");

const agent = (demo: boolean) => ({ connectionId: null, postId: "post_1", scope: { pharmacyId: "ph_1", organizationId: "org_1", userId: "usr_1" }, pharmacyIsDemo: demo, intervalSeconds: 300, exportPath: null, scansPath: null });
const UNKNOWN = "3999999999991";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.drugPresentation.findUnique.mockResolvedValue(null);
  mocks.prisma.productBarcode.findUnique.mockResolvedValue(null);
  mocks.prisma.product.findFirst.mockResolvedValue(null);
  mocks.prisma.counterPost.findUnique.mockResolvedValue({ lastScanAt: null });
  mocks.prisma.prescription.create.mockResolvedValue({ id: "rx_1" });
  mocks.prisma.prescriptionLine.count.mockResolvedValue(1);
  mocks.findOpenFactsName.mockResolvedValue(null);
});

describe("un code inconnu du stock", () => {
  it("l'officine de démonstration n'interroge aucune base ouverte : le code reste inconnu, visible, à rattacher", async () => {
    const result = await recordCounterScan(agent(true), { code: UNKNOWN, post: "poste-demo", scannedAt: null });
    expect(mocks.findOpenFactsName).not.toHaveBeenCalled();
    expect(result).toMatchObject({ ok: true, kind: "UNKNOWN" });
  });

  it("une vraie officine l'interroge, comme avant", async () => {
    await recordCounterScan(agent(false), { code: UNKNOWN, post: "poste-1", scannedAt: null });
    expect(mocks.findOpenFactsName).toHaveBeenCalledWith(UNKNOWN);
  });
});
