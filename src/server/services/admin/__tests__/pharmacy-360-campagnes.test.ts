import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La fiche 360° d'une officine : ce qu'elle dit des nouveautés patients, du
 * parrainage et des campagnes. Des agrégats seulement : jamais une adresse,
 * jamais une liste de patients.
 */

const db = vi.hoisted(() => ({
  prisma: {
    pharmacy: { findUnique: vi.fn() },
    contract: { findMany: vi.fn(async () => []) },
    billingPayment: { count: vi.fn(async () => 0) },
    adminNote: { count: vi.fn(async () => 0) },
    emailDispatch: { count: vi.fn(async () => 0) },
    platformIncident: { count: vi.fn(async () => 0) },
    cancellationRequest: { findFirst: vi.fn(async () => null) },
    // Volontairement SANS findMany : lister les abonnés ferait échouer ces tests.
    patientNewsSubscription: { count: vi.fn() },
    patientNewsAnnouncement: { aggregate: vi.fn(), count: vi.fn() },
    campaignRecipient: { findMany: vi.fn(), count: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db.prisma }));

const service = await import("../pharmacy-360");

type Base = Parameters<typeof service.loadNewsAggregates>[0];
const base = (overrides: Record<string, unknown> = {}) => ({ pharmacy: { id: "ph_1", patientNewsEnabled: true, ...overrides } }) as unknown as Base;

beforeEach(() => {
  vi.clearAllMocks();
  db.prisma.patientNewsSubscription.count.mockResolvedValue(0);
  db.prisma.patientNewsAnnouncement.aggregate.mockResolvedValue({ _count: { _all: 0 }, _max: { createdAt: null } });
  db.prisma.patientNewsAnnouncement.count.mockResolvedValue(0);
  db.prisma.campaignRecipient.findMany.mockResolvedValue([]);
  db.prisma.campaignRecipient.count.mockResolvedValue(0);
});

describe("nouveautés pour les patients : des effectifs, rien d'autre", () => {
  it("compte les abonnés actifs, les annonces réellement parties et la date de la dernière", async () => {
    db.prisma.patientNewsSubscription.count.mockResolvedValue(37);
    db.prisma.patientNewsAnnouncement.aggregate.mockResolvedValue({ _count: { _all: 4 }, _max: { createdAt: new Date("2026-10-02T09:00:00Z") } });
    db.prisma.patientNewsAnnouncement.count.mockResolvedValue(1);
    const news = await service.loadNewsAggregates(base());
    expect(news).toEqual({ enabled: true, activeSubscribers: 37, announcementsSent: 4, announcementsSimulated: 1, lastAnnouncementAt: new Date("2026-10-02T09:00:00Z") });
  });

  it("filtre par l'officine de la fiche, sur les abonnés actifs seulement", async () => {
    await service.loadNewsAggregates(base({ id: "ph_42" }));
    expect(db.prisma.patientNewsSubscription.count).toHaveBeenCalledWith({ where: { pharmacyId: "ph_42", status: "ACTIVE" } });
    expect(db.prisma.patientNewsAnnouncement.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { pharmacyId: "ph_42", status: { in: ["SENT", "PARTIAL"] }, simulated: false } }));
    expect(db.prisma.patientNewsAnnouncement.count).toHaveBeenCalledWith({ where: { pharmacyId: "ph_42", simulated: true } });
  });

  it("une annonce simulée ou en échec n'est pas comptée comme envoyée : elle ne fait pas la « dernière annonce »", async () => {
    await service.loadNewsAggregates(base());
    const where = db.prisma.patientNewsAnnouncement.aggregate.mock.calls[0][0].where;
    expect(where.simulated).toBe(false);
    expect(where.status.in).not.toContain("FAILED");
    expect(where.status.in).not.toContain("SENDING");
  });

  it("sans abonné ni annonce : des zéros vrais et « aucune date », pas des valeurs inventées", async () => {
    const news = await service.loadNewsAggregates(base());
    expect(news).toMatchObject({ activeSubscribers: 0, announcementsSent: 0, announcementsSimulated: 0, lastAnnouncementAt: null });
  });

  it("reprend le réglage de l'officine : fonction activée ou non", async () => {
    expect((await service.loadNewsAggregates(base({ patientNewsEnabled: false }))).enabled).toBe(false);
  });

  it("ne lit jamais une adresse : aucune liste d'abonnés n'est demandée", async () => {
    await service.loadNewsAggregates(base());
    expect(Object.keys(db.prisma.patientNewsSubscription)).toEqual(["count"]);
    expect(JSON.stringify(db.prisma.patientNewsAnnouncement.aggregate.mock.calls)).not.toMatch(/email|cipher|masked/i);
  });
});

describe("campagnes reçues par l'officine", () => {
  it("lit les destinataires figés de CETTE officine, les plus récents, en nombre borné", async () => {
    await service.loadCampaignsReceived(base({ id: "ph_7" }));
    expect(db.prisma.campaignRecipient.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { pharmacyId: "ph_7" }, take: service.CAMPAIGNS_RECEIVED_LIMIT, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }));
    expect(service.CAMPAIGNS_RECEIVED_LIMIT).toBeLessThanOrEqual(50);
    expect(db.prisma.campaignRecipient.count).toHaveBeenCalledWith({ where: { pharmacyId: "ph_7" } });
  });

  it("rend le nom de la campagne, la date et l'issue, jamais l'adresse du destinataire", async () => {
    await service.loadCampaignsReceived(base());
    const { select } = db.prisma.campaignRecipient.findMany.mock.calls[0][0];
    expect(select).toEqual({ id: true, status: true, detail: true, sentAt: true, createdAt: true, campaign: { select: { id: true, name: true, kind: true } } });
    expect(Object.keys(select)).not.toContain("email");
    expect(Object.keys(select)).not.toContain("emailKey");
  });

  it("dit le total quand il dépasse ce qui est affiché", async () => {
    db.prisma.campaignRecipient.findMany.mockResolvedValue([{ id: "r1", status: "SENT", detail: null, sentAt: null, createdAt: new Date("2026-10-01T09:00:00Z"), campaign: { id: "c1", name: "Bonus", kind: "BONUS_OFFER" } }]);
    db.prisma.campaignRecipient.count.mockResolvedValue(31);
    const received = await service.loadCampaignsReceived(base());
    expect(received.rows).toHaveLength(1);
    expect(received.total).toBe(31);
  });
});

describe("le socle de la fiche lit le parrainage et le réglage des nouveautés", () => {
  it("demande le montant figé de l'officine, celui de chaque filleule, et le réglage des nouveautés", async () => {
    db.prisma.pharmacy.findUnique.mockResolvedValue({
      id: "ph_1",
      organizationId: "org_1",
      referredBy: null,
      referrals: [],
      memberships: [],
      prospect: null,
      stockConnection: null,
      organization: { name: "Org", pharmacies: [{ id: "ph_1" }], subscription: null },
    });
    await service.loadPharmacy360("ph_1", new Date("2026-10-10T08:00:00Z"));
    const { select } = db.prisma.pharmacy.findUnique.mock.calls[0][0];
    expect(select.referralAmountCents).toBe(true);
    expect(select.patientNewsEnabled).toBe(true);
    expect(select.referrals.select.referralAmountCents).toBe(true);
  });
});
