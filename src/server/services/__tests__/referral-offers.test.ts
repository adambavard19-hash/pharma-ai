import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Les offres de parrainage avec une table simulée en mémoire : la clé unique
 * `campaignId` y est respectée comme en vrai (P2002), l'arrêt conditionnel
 * aussi. Rien n'est écrit en base.
 */

const db = vi.hoisted(() => {
  type Offer = { id: string; label: string; amountCents: number; startsAt: Date; endsAt: Date | null; canceledAt: Date | null; campaignId: string | null; createdByAdminId: string | null; createdAt: Date };
  const state = { offers: [] as Offer[], clock: 0 };
  const project = (offer: Offer, select: Record<string, boolean>) => Object.fromEntries(Object.keys(select).map((key) => [key, offer[key as keyof Offer]]));
  const prisma = {
    referralOffer: {
      findMany: vi.fn(async ({ where, orderBy, select }: { where: { canceledAt: null; startsAt: { lte: Date } }; orderBy: { startsAt?: "desc"; createdAt?: "desc" }[]; select: Record<string, boolean> }) => {
        expect(orderBy).toEqual([{ startsAt: "desc" }, { createdAt: "desc" }]);
        return state.offers
          .filter((o) => o.canceledAt === null && o.startsAt.getTime() <= where.startsAt.lte.getTime())
          .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime() || b.createdAt.getTime() - a.createdAt.getTime())
          .map((o) => project(o, select));
      }),
      create: vi.fn(async ({ data }: { data: Omit<Offer, "id" | "canceledAt" | "createdAt"> }) => {
        if (data.campaignId && state.offers.some((o) => o.campaignId === data.campaignId)) throw Object.assign(new Error("Unique constraint failed on the fields: (`campaignId`)"), { code: "P2002" });
        state.clock += 1;
        const offer: Offer = { ...data, id: `ro_${state.offers.length + 1}`, canceledAt: null, createdAt: new Date(2026, 9, 1, 0, 0, state.clock) };
        state.offers.push(offer);
        return { id: offer.id };
      }),
      findUnique: vi.fn(async ({ where, select }: { where: { campaignId: string }; select: Record<string, boolean> }) => {
        const offer = state.offers.find((o) => o.campaignId === where.campaignId);
        return offer ? project(offer, select) : null;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; canceledAt: null }; data: { canceledAt: Date } }) => {
        const offer = state.offers.find((o) => o.id === where.id && o.canceledAt === null);
        if (!offer) return { count: 0 };
        offer.canceledAt = data.canceledAt;
        return { count: 1 };
      }),
    },
  };
  return { state, prisma };
});

const mocks = vi.hoisted(() => ({ recordAudit: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db.prisma }));
vi.mock("@/server/audit/log", () => ({ recordAudit: mocks.recordAudit }));

const { activeReferralOffer, startReferralOffer, endReferralOffer, referralAmountForNewFilleul } = await import("../referral-offers");

const NOW = new Date("2026-10-10T08:00:00Z");
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const start = (overrides: Partial<Parameters<typeof startReferralOffer>[0]> = {}) => startReferralOffer({ label: "Offre d'octobre", amountCents: 2000, startsAt: day("2026-10-01"), endsAt: null, campaignId: "cmp_1", adminId: "adm_1", ...overrides });

beforeEach(() => {
  db.state.offers = [];
  db.state.clock = 0;
  vi.clearAllMocks();
});

describe("offre de parrainage en cours", () => {
  it("aucune offre : le montant standard s'applique (`null`)", async () => {
    expect(await activeReferralOffer(NOW)).toBeNull();
    expect(await referralAmountForNewFilleul(NOW)).toBeNull();
  });

  it("une offre démarrée est en cours : son montant est celui d'un nouveau filleul", async () => {
    await start();
    expect(await activeReferralOffer(NOW)).toMatchObject({ label: "Offre d'octobre", amountCents: 2000, startsAt: day("2026-10-01"), endsAt: null });
    expect(await referralAmountForNewFilleul(NOW)).toBe(2000);
  });

  it("pas encore démarrée, échue ou annulée : n'est pas en cours", async () => {
    await start({ campaignId: "cmp_futur", startsAt: day("2026-10-20") });
    await start({ campaignId: "cmp_echue", startsAt: day("2026-09-01"), endsAt: day("2026-10-01") });
    await start({ campaignId: "cmp_annulee", startsAt: day("2026-09-15") });
    await endReferralOffer({ campaignId: "cmp_annulee" }, "adm_1");
    expect(await activeReferralOffer(NOW)).toBeNull();
    expect(await referralAmountForNewFilleul(NOW)).toBeNull();
  });

  it("plusieurs offres : la plus récemment démarrée l'emporte ; si elle s'arrête, la précédente, qui court encore, redevient applicable", async () => {
    await start({ campaignId: "cmp_a", label: "Offre A", amountCents: 1500, startsAt: day("2026-09-01") });
    await start({ campaignId: "cmp_b", label: "Offre B", amountCents: 3000, startsAt: day("2026-10-05") });
    expect(await referralAmountForNewFilleul(NOW)).toBe(3000);
    await endReferralOffer({ campaignId: "cmp_b" }, "adm_1");
    expect(await referralAmountForNewFilleul(NOW)).toBe(1500);
  });

  it("à démarrage égal, la plus récemment créée l'emporte", async () => {
    await start({ campaignId: "cmp_a", label: "Offre A", amountCents: 1500 });
    await start({ campaignId: "cmp_b", label: "Offre B", amountCents: 2500 });
    expect((await activeReferralOffer(NOW))?.label).toBe("Offre B");
  });

  it("à l'instant de sa fin, l'offre ne s'applique plus", async () => {
    await start({ endsAt: day("2026-10-11") });
    expect(await referralAmountForNewFilleul(new Date("2026-10-10T23:59:59Z"))).toBe(2000);
    expect(await referralAmountForNewFilleul(day("2026-10-11"))).toBeNull();
  });
});

describe("démarrer une offre", () => {
  it("crée l'offre et écrit l'audit : l'après, et l'avant (rien) quand aucune offre n'était en cours", async () => {
    const { id } = await start({ endsAt: day("2026-10-31") });
    expect(db.state.offers).toHaveLength(1);
    expect(db.state.offers[0]).toMatchObject({ id, label: "Offre d'octobre", amountCents: 2000, startsAt: day("2026-10-01"), endsAt: day("2026-10-31"), campaignId: "cmp_1", createdByAdminId: "adm_1", canceledAt: null });
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
    expect(mocks.recordAudit).toHaveBeenCalledWith({
      action: "campaign.referral_offer_started",
      entityType: "ReferralOffer",
      entityId: id,
      platformAdminId: "adm_1",
      metadata: { campaignId: "cmp_1", before: null, after: { id, label: "Offre d'octobre", amountCents: 2000, startsAt: "2026-10-01T00:00:00.000Z", endsAt: "2026-10-31T00:00:00.000Z" } },
    });
  });

  it("l'audit garde l'offre REMPLACÉE (avant) et la nouvelle (après)", async () => {
    const first = await start({ campaignId: "cmp_a", label: "Offre A", amountCents: 1500, startsAt: day("2026-09-01") });
    mocks.recordAudit.mockClear();
    const second = await start({ campaignId: "cmp_b", label: "Offre B", amountCents: 3000, startsAt: day("2026-10-05") });
    const metadata = mocks.recordAudit.mock.calls[0][0].metadata as { before: { id: string; amountCents: number; label: string } | null; after: { id: string; amountCents: number } };
    expect(metadata.before).toMatchObject({ id: first.id, label: "Offre A", amountCents: 1500 });
    expect(metadata.after).toMatchObject({ id: second.id, amountCents: 3000 });
  });

  it("une offre déjà échue ou annulée n'est pas « remplacée »", async () => {
    await start({ campaignId: "cmp_echue", startsAt: day("2026-08-01"), endsAt: day("2026-09-01") });
    mocks.recordAudit.mockClear();
    await start({ campaignId: "cmp_b" });
    expect((mocks.recordAudit.mock.calls[0][0].metadata as { before: unknown }).before).toBeNull();
  });

  it("une offre sans campagne est permise (aucune clé à tenir)", async () => {
    await start({ campaignId: null });
    await start({ campaignId: null });
    expect(db.state.offers).toHaveLength(2);
  });

  it("rejouée pour la même campagne (reprise), elle rend l'offre existante : une seule offre, un seul audit", async () => {
    const first = await start();
    mocks.recordAudit.mockClear();
    const again = await start({ amountCents: 9999 });
    expect(again).toEqual({ id: first.id });
    expect(db.state.offers).toHaveLength(1);
    expect(db.state.offers[0].amountCents).toBe(2000);
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("une autre erreur d'écriture remonte, sans audit", async () => {
    db.prisma.referralOffer.create.mockRejectedValueOnce(new Error("base indisponible"));
    await expect(start()).rejects.toThrow("base indisponible");
    expect(mocks.recordAudit).not.toHaveBeenCalled();
    // Une violation d'unicité SANS campagne n'est pas une reprise : elle remonte.
    db.prisma.referralOffer.create.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    await expect(start({ campaignId: null })).rejects.toThrow("unique");
  });

  it("refuse un montant nul, négatif ou non entier, un nom vide, une fin avant le début : rien n'est écrit", async () => {
    await expect(start({ amountCents: 0 })).rejects.toThrow(/montant/);
    await expect(start({ amountCents: -500 })).rejects.toThrow(/montant/);
    await expect(start({ amountCents: 12.5 })).rejects.toThrow(/montant/);
    await expect(start({ amountCents: Number.NaN })).rejects.toThrow(/montant/);
    await expect(start({ label: "   " })).rejects.toThrow(/nom/);
    await expect(start({ endsAt: day("2026-09-30") })).rejects.toThrow(/fin/);
    await expect(start({ endsAt: day("2026-10-01") })).rejects.toThrow(/fin/);
    expect(db.prisma.referralOffer.create).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });
});

describe("arrêter une offre", () => {
  it("annule l'offre de la campagne et écrit l'audit avec l'avant et l'après", async () => {
    const { id } = await start();
    mocks.recordAudit.mockClear();
    await endReferralOffer({ campaignId: "cmp_1" }, "adm_2");
    expect(db.state.offers[0].canceledAt).toBeInstanceOf(Date);
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
    const call = mocks.recordAudit.mock.calls[0][0] as { action: string; entityId: string; platformAdminId: string; metadata: { campaignId: string; before: { canceledAt: unknown; amountCents: number }; after: { canceledAt: string; amountCents: number } } };
    expect(call).toMatchObject({ action: "campaign.referral_offer_ended", entityType: "ReferralOffer", entityId: id, platformAdminId: "adm_2" });
    expect(call.metadata).toMatchObject({ campaignId: "cmp_1", before: { canceledAt: null, amountCents: 2000 } });
    expect(call.metadata.after.canceledAt).toBe(db.state.offers[0].canceledAt!.toISOString());
  });

  it("idempotent : un second arrêt, une campagne sans offre, ne font rien et n'écrivent rien", async () => {
    await start();
    await endReferralOffer({ campaignId: "cmp_1" }, "adm_1");
    const canceledAt = db.state.offers[0].canceledAt;
    mocks.recordAudit.mockClear();
    db.prisma.referralOffer.updateMany.mockClear();
    await endReferralOffer({ campaignId: "cmp_1" }, "adm_1");
    await endReferralOffer({ campaignId: "cmp_sans_offre" }, "adm_1");
    expect(db.state.offers[0].canceledAt).toBe(canceledAt);
    expect(db.prisma.referralOffer.updateMany).not.toHaveBeenCalled();
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("deux arrêts simultanés : un seul écrit, un seul audit", async () => {
    await start();
    mocks.recordAudit.mockClear();
    await Promise.all([endReferralOffer({ campaignId: "cmp_1" }, "adm_1"), endReferralOffer({ campaignId: "cmp_1" }, "adm_2")]);
    expect(mocks.recordAudit).toHaveBeenCalledTimes(1);
  });

  it("l'arrêt est conditionnel : si l'offre vient d'être arrêtée ailleurs, rien n'est audité", async () => {
    await start();
    mocks.recordAudit.mockClear();
    db.prisma.referralOffer.updateMany.mockResolvedValueOnce({ count: 0 });
    await endReferralOffer({ campaignId: "cmp_1" }, "adm_1");
    expect(mocks.recordAudit).not.toHaveBeenCalled();
  });

  it("après l'arrêt, un nouveau filleul retombe sur le montant standard", async () => {
    await start();
    expect(await referralAmountForNewFilleul(NOW)).toBe(2000);
    await endReferralOffer({ campaignId: "cmp_1" }, null);
    expect(await referralAmountForNewFilleul(NOW)).toBeNull();
  });
});
