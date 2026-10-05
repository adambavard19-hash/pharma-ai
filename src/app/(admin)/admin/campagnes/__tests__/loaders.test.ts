import { beforeEach, describe, expect, it, vi } from "vitest";

/** Les deux lectures annexes des écrans de campagne : sélections manuelles et liste d'un bonus. */

const db = vi.hoisted(() => ({
  prisma: {
    pharmacy: { findMany: vi.fn() },
    partner: { findMany: vi.fn() },
    campaignRecipient: { findMany: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db.prisma }));

const { BONUS_LIST_LIMIT, SELECTION_LIMIT, loadBonusRecipients, loadSelectionOptions } = await import("../loaders");

const pharmacy = (n: number) => ({ id: `ph_${n}`, name: `Pharmacie ${n}`, city: null });

beforeEach(() => {
  vi.clearAllMocks();
  db.prisma.pharmacy.findMany.mockResolvedValue([]);
  db.prisma.partner.findMany.mockResolvedValue([]);
  db.prisma.campaignRecipient.findMany.mockResolvedValue([]);
});

describe("les listes de la sélection manuelle", () => {
  it("ne propose que ce qui peut recevoir : officines actives hors démonstration, partenaires ni archivés ni suspendus", async () => {
    await loadSelectionOptions({ pharmacyIds: [], partnerIds: [] });
    expect(db.prisma.pharmacy.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isDemo: false, isActive: true }, take: SELECTION_LIMIT + 1 }));
    expect(db.prisma.partner.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: { notIn: ["ARCHIVED", "SUSPENDED"] } }, take: SELECTION_LIMIT + 1 }));
    // Aucun appel pour retrouver des choix : il n'y en a pas.
    expect(db.prisma.pharmacy.findMany).toHaveBeenCalledTimes(1);
    expect(db.prisma.partner.findMany).toHaveBeenCalledTimes(1);
  });

  it("borne la liste et dit qu'elle est tronquée", async () => {
    db.prisma.pharmacy.findMany.mockResolvedValue(Array.from({ length: SELECTION_LIMIT + 1 }, (_, i) => pharmacy(i)));
    const options = await loadSelectionOptions({ pharmacyIds: [], partnerIds: [] });
    expect(options.pharmacies).toHaveLength(SELECTION_LIMIT);
    expect(options.truncated).toEqual({ pharmacies: true, partners: false });
  });

  it("une liste qui tient dans la borne n'est pas dite tronquée", async () => {
    db.prisma.pharmacy.findMany.mockResolvedValue(Array.from({ length: SELECTION_LIMIT }, (_, i) => pharmacy(i)));
    expect((await loadSelectionOptions({ pharmacyIds: [], partnerIds: [] })).truncated.pharmacies).toBe(false);
  });

  it("retrouve les choix d'une campagne en modification, même hors de la borne, sans perdre personne en silence", async () => {
    db.prisma.pharmacy.findMany.mockResolvedValueOnce([pharmacy(1)]).mockResolvedValueOnce([{ id: "ph_hors", name: "Pharmacie hors liste", city: "Nice" }]);
    db.prisma.partner.findMany.mockResolvedValueOnce([{ id: "pa_1", name: "Labo 1" }]).mockResolvedValueOnce([{ id: "pa_2", name: "Labo 2" }]);
    const options = await loadSelectionOptions({ pharmacyIds: ["ph_1", "ph_hors"], partnerIds: ["pa_1", "pa_2"] });
    expect(db.prisma.pharmacy.findMany).toHaveBeenLastCalledWith({ where: { id: { in: ["ph_hors"] } }, select: { id: true, name: true, city: true } });
    expect(db.prisma.partner.findMany).toHaveBeenLastCalledWith({ where: { id: { in: ["pa_2"] } }, select: { id: true, name: true } });
    expect(options.pharmacies.map((p) => p.id)).toEqual(["ph_1", "ph_hors"]);
    expect(options.partners.map((p) => p.id)).toEqual(["pa_1", "pa_2"]);
  });

  it("ne lit que des noms : jamais une adresse e-mail", async () => {
    await loadSelectionOptions({ pharmacyIds: ["ph_x"], partnerIds: ["pa_x"] });
    for (const call of [...db.prisma.pharmacy.findMany.mock.calls, ...db.prisma.partner.findMany.mock.calls]) expect(JSON.stringify(call)).not.toMatch(/email|phone|contacts/i);
  });
});

describe("la liste « à appliquer » d'un bonus", () => {
  it("ne lit que les messages réellement partis, d'officines, de cette campagne", async () => {
    await loadBonusRecipients("camp_1");
    expect(db.prisma.campaignRecipient.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { campaignId: "camp_1", status: "SENT", pharmacyId: { not: null } }, take: BONUS_LIST_LIMIT + 1 }));
  });

  it("rend les noms et les liens, borne la liste et le dit", async () => {
    db.prisma.campaignRecipient.findMany.mockResolvedValue(Array.from({ length: BONUS_LIST_LIMIT + 1 }, (_, i) => ({ id: `r${i}`, pharmacyId: `ph_${i}`, name: `Pharmacie ${i}` })));
    const result = await loadBonusRecipients("camp_1");
    expect(result.rows).toHaveLength(BONUS_LIST_LIMIT);
    expect(result.truncated).toBe(true);
    expect(result.rows[0]).toEqual({ id: "r0", pharmacyId: "ph_0", name: "Pharmacie 0" });
  });

  it("n'expose pas d'adresse", async () => {
    await loadBonusRecipients("camp_1");
    expect(db.prisma.campaignRecipient.findMany.mock.calls[0][0].select).toEqual({ id: true, pharmacyId: true, name: true });
  });
});
