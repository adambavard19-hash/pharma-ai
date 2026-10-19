import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * « Qui a servi ce patient ? » (19 oct. 2026) : la vente passe aux résultats du collègue touché sur la bannière — seulement un
 * membre actif de la même officine, et la vente doit être une vente du comptoir de cette officine.
 */

const mocks = vi.hoisted(() => ({
  prisma: {
    prescription: { findFirst: vi.fn(), update: vi.fn((args: unknown) => ({ op: "prescription", args })) },
    membership: { findFirst: vi.fn(), findMany: vi.fn() },
    recommendation: { updateMany: vi.fn((args: unknown) => ({ op: "recommendation", args })) },
    sale: { updateMany: vi.fn((args: unknown) => ({ op: "sale", args })) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  },
  audit: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: mocks.prisma }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.audit }));

import { counterTeamFor, setCounterServedBy, shortName } from "../counter-served";

const AGENT = { connectionId: null, postId: "poste-1", scope: { pharmacyId: "ph-1", organizationId: "org-1", userId: "titulaire" }, pharmacyIsDemo: false, intervalSeconds: 300, exportPath: null, scansPath: null } as never;

beforeEach(() => vi.clearAllMocks());

describe("qui a servi ce patient", () => {
  it("passe la vente, ses conseils tranchés et ses ventes au collègue choisi", async () => {
    mocks.prisma.prescription.findFirst.mockResolvedValue({ id: "vente-1", handledByUserId: "donna" });
    mocks.prisma.membership.findFirst.mockResolvedValue({ userId: "thomas" });
    const result = await setCounterServedBy(AGENT, { prescriptionId: "vente-1", userId: "thomas" });
    expect(result).toEqual({ ok: true, changed: true });
    expect(mocks.prisma.prescription.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "vente-1", pharmacyId: "ph-1", source: "COUNTER_SCAN" } }));
    expect(mocks.prisma.membership.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ pharmacyId: "ph-1", userId: "thomas", isActive: true }) }));
    expect(mocks.prisma.prescription.update).toHaveBeenCalledWith({ where: { id: "vente-1" }, data: { handledByUserId: "thomas" } });
    expect(mocks.prisma.recommendation.updateMany).toHaveBeenCalledWith({ where: { prescriptionId: "vente-1", pharmacyId: "ph-1", decidedByUserId: { not: null } }, data: { decidedByUserId: "thomas" } });
    expect(mocks.prisma.sale.updateMany).toHaveBeenCalledWith({ where: { prescriptionId: "vente-1", pharmacyId: "ph-1" }, data: { userId: "thomas" } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "prescription.counter_served_by", metadata: expect.objectContaining({ from: "donna", to: "thomas" }) }));
  });

  it("refuse une personne d'une autre officine (ou partie) : rien n'est écrit", async () => {
    mocks.prisma.prescription.findFirst.mockResolvedValue({ id: "vente-1", handledByUserId: "donna" });
    mocks.prisma.membership.findFirst.mockResolvedValue(null);
    expect(await setCounterServedBy(AGENT, { prescriptionId: "vente-1", userId: "intrus" })).toEqual({ ok: false, error: expect.any(String) });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuse la vente d'une autre officine", async () => {
    mocks.prisma.prescription.findFirst.mockResolvedValue(null);
    mocks.prisma.membership.findFirst.mockResolvedValue({ userId: "thomas" });
    expect((await setCounterServedBy(AGENT, { prescriptionId: "vente-autre", userId: "thomas" })).ok).toBe(false);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("la personne du comptoir déjà choisie : rien ne change", async () => {
    mocks.prisma.prescription.findFirst.mockResolvedValue({ id: "vente-1", handledByUserId: "donna" });
    mocks.prisma.membership.findFirst.mockResolvedValue({ userId: "donna" });
    expect(await setCounterServedBy(AGENT, { prescriptionId: "vente-1", userId: "donna" })).toEqual({ ok: true, changed: false });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("l'équipe : prénom et initiale, membres actifs de l'officine seulement, et la personne du comptoir", async () => {
    mocks.prisma.membership.findMany.mockResolvedValue([{ user: { id: "donna", firstName: "Donna", lastName: "Benveniste" } }, { user: { id: "thomas", firstName: "Thomas", lastName: "durand" } }]);
    mocks.prisma.prescription.findFirst.mockResolvedValue({ handledByUserId: "donna" });
    expect(await counterTeamFor("ph-1", "vente-1")).toEqual({ team: [{ id: "donna", name: "Donna B." }, { id: "thomas", name: "Thomas D." }], servedBy: "donna" });
    expect(mocks.prisma.membership.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { pharmacyId: "ph-1", isActive: true, user: { deletedAt: null } } }));
    expect(shortName("", "Martin")).toBe("Martin");
  });
});
