import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ce que le titulaire voit de son parrainage : la remise est la somme des
 * montants figés de ses filleuls actifs, bornée par son tarif contractuel — la
 * même que celle qui sera appliquée. Une offre qui change ne touche jamais un
 * filleul déjà inscrit. Base simulée, lecture seule.
 */

type OfferRow = { id: string; label: string; amountCents: number; startsAt: Date; endsAt: Date | null; canceledAt: Date | null; createdAt: Date };
type FilleulRow = { name: string; city: string | null; isActive: boolean; createdAt: Date; referralAmountCents: number | null; organization: { subscription: { status: string } | null } };

const db = vi.hoisted(() => {
  const state = {
    offers: [] as unknown[],
    filleuls: [] as unknown[],
    subscription: null as unknown,
    referredBy: null as { name: string } | null,
  };
  const prisma = {
    pharmacy: {
      findUniqueOrThrow: vi.fn(async ({ select }: { select: Record<string, unknown> }) => {
        // Le premier appel lit le code ; le second, tout le reste.
        if ("referralCode" in select) return { referralCode: "PB-ABC234" };
        return { referredBy: state.referredBy, referrals: state.filleuls, organization: { subscription: state.subscription } };
      }),
    },
    referralOffer: {
      findMany: vi.fn(async ({ where }: { where: { canceledAt: null; startsAt: { lte: Date } } }) =>
        (state.offers as OfferRow[])
          .filter((o) => o.canceledAt === null && o.startsAt.getTime() <= where.startsAt.lte.getTime())
          .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime() || b.createdAt.getTime() - a.createdAt.getTime()),
      ),
    },
  };
  return { state, prisma };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", () => ({ prisma: db.prisma }));
vi.mock("@/server/audit/log", () => ({ recordAudit: vi.fn() }));
vi.mock("@/server/public-url", () => ({ publicUrl: (path: string) => `https://pharmaboost.test${path}` }));

const { referralSummary } = await import("../referral");

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const filleul = (name: string, overrides: Partial<FilleulRow> = {}): FilleulRow => ({ name, city: null, isActive: true, createdAt: day("2026-08-01"), referralAmountCents: null, organization: { subscription: { status: "ACTIVE" } }, ...overrides });
const offer = (id: string, amountCents: number, overrides: Partial<OfferRow> = {}): OfferRow => ({ id, label: `Offre ${id}`, amountCents, startsAt: day("2020-01-01"), endsAt: null, canceledAt: null, createdAt: day("2020-01-01"), ...overrides });
const contract = (priceCents: number) => ({ contractPriceCents: priceCents, plan: { monthlyPriceCents: priceCents } });

beforeEach(() => {
  db.state.offers = [];
  db.state.filleuls = [];
  db.state.subscription = contract(29000);
  db.state.referredBy = null;
  vi.clearAllMocks();
});

describe("parrainage vu du titulaire : sans offre", () => {
  it("chaque filleul actif apporte le montant standard (filleuls d'avant les offres compris), la remise est leur somme", async () => {
    db.state.filleuls = [filleul("Pharmacie A"), filleul("Pharmacie B")];
    const summary = await referralSummary("ph_1");
    expect(summary).toMatchObject({ code: "PB-ABC234", discountPerReferralCents: 1000, currentOffer: null, activeCount: 2, discountCents: 2000, monthlyPriceCents: 29000, link: "https://pharmaboost.test/decouvrir/abonnement?parrain=PB-ABC234" });
    expect(summary.referrals.map((r) => r.amountCents)).toEqual([1000, 1000]);
  });

  it("aucun filleul : aucune remise", async () => {
    expect(await referralSummary("ph_1")).toMatchObject({ activeCount: 0, discountCents: 0, referrals: [] });
  });

  it("le parrain de l'officine est nommé", async () => {
    db.state.referredBy = { name: "Pharmacie Marraine" };
    expect((await referralSummary("ph_1")).referredBy).toBe("Pharmacie Marraine");
  });
});

describe("parrainage vu du titulaire : avec une offre", () => {
  it("l'écran annonce l'offre en cours et son montant pour un NOUVEAU filleul ; chaque filleul garde le sien", async () => {
    db.state.offers = [offer("a", 4000, { endsAt: day("2026-11-01") })];
    db.state.filleuls = [filleul("Avant l'offre"), filleul("Pendant l'offre", { referralAmountCents: 4000 })];
    const summary = await referralSummary("ph_1");
    expect(summary.currentOffer).toEqual({ amountCents: 4000, endsAt: day("2026-11-01"), label: "Offre a" });
    expect(summary.discountPerReferralCents).toBe(4000);
    expect(summary.referrals.map((r) => r.amountCents)).toEqual([1000, 4000]);
    // 10 € + 40 €, et non 2 × 40 € : l'offre d'aujourd'hui ne réécrit pas le montant du filleul d'avant.
    expect(summary.discountCents).toBe(5000);
  });

  it("une offre qui change, se termine ou est annulée ne modifie JAMAIS le montant d'un filleul déjà inscrit", async () => {
    db.state.filleuls = [filleul("Inscrit à 40 €", { referralAmountCents: 4000 }), filleul("Inscrit au standard")];
    const amounts = async () => {
      const s = await referralSummary("ph_1");
      return { amounts: s.referrals.map((r) => r.amountCents), discount: s.discountCents };
    };

    db.state.offers = [offer("a", 4000)];
    const during = await amounts();
    expect(during).toEqual({ amounts: [4000, 1000], discount: 5000 });

    // L'offre change : une nouvelle offre à 1 500 € plus récente.
    db.state.offers = [offer("a", 4000), offer("b", 1500, { startsAt: day("2026-10-01"), createdAt: day("2026-10-01") })];
    const changed = await referralSummary("ph_1");
    expect(changed.discountPerReferralCents).toBe(1500);
    expect({ amounts: changed.referrals.map((r) => r.amountCents), discount: changed.discountCents }).toEqual(during);

    // Les deux offres sont annulées : retour au montant standard pour les nouveaux, rien ne bouge pour les inscrits.
    db.state.offers = [offer("a", 4000, { canceledAt: day("2026-10-02") }), offer("b", 1500, { startsAt: day("2026-10-01"), canceledAt: day("2026-10-02") })];
    const ended = await referralSummary("ph_1");
    expect(ended.currentOffer).toBeNull();
    expect(ended.discountPerReferralCents).toBe(1000);
    expect({ amounts: ended.referrals.map((r) => r.amountCents), discount: ended.discountCents }).toEqual(during);
  });

  it("une offre échue ou pas encore démarrée n'est pas annoncée", async () => {
    db.state.offers = [offer("echue", 4000, { endsAt: day("2026-01-01") }), offer("future", 5000, { startsAt: day("2099-01-01") })];
    const summary = await referralSummary("ph_1");
    expect(summary.currentOffer).toBeNull();
    expect(summary.discountPerReferralCents).toBe(1000);
  });
});

describe("parrainage vu du titulaire : ce qui compte, et le plafond", () => {
  it("la remise ne dépasse jamais le tarif contractuel", async () => {
    db.state.subscription = contract(2000);
    db.state.filleuls = [filleul("A", { referralAmountCents: 4000 }), filleul("B", { referralAmountCents: 4000 })];
    const summary = await referralSummary("ph_1");
    expect(summary.monthlyPriceCents).toBe(2000);
    expect(summary.discountCents).toBe(2000);
  });

  it("le tarif contractuel borne la remise, pas le prix catalogue de l'offre", async () => {
    db.state.subscription = { contractPriceCents: 1500, plan: { monthlyPriceCents: 29000 } };
    db.state.filleuls = [filleul("A", { referralAmountCents: 2000 })];
    expect((await referralSummary("ph_1")).discountCents).toBe(1500);
  });

  it("sans abonnement suivi, rien ne borne la somme", async () => {
    db.state.subscription = null;
    db.state.filleuls = [filleul("A", { referralAmountCents: 4000 }), filleul("B")];
    const summary = await referralSummary("ph_1");
    expect(summary.monthlyPriceCents).toBeNull();
    expect(summary.discountCents).toBe(5000);
  });

  it("un filleul inactif ou résilié reste listé avec son montant, mais ne compte ni dans le nombre ni dans la remise", async () => {
    db.state.filleuls = [
      filleul("Active", { referralAmountCents: 2500 }),
      filleul("Désactivée", { isActive: false, referralAmountCents: 2500 }),
      filleul("Résiliée", { referralAmountCents: 2500, organization: { subscription: { status: "CANCELED" } } }),
      filleul("En essai", { referralAmountCents: 2500, organization: { subscription: { status: "TRIALING" } } }),
    ];
    const summary = await referralSummary("ph_1");
    expect(summary.referrals.map((r) => [r.name, r.active, r.amountCents])).toEqual([
      ["Active", true, 2500],
      ["Désactivée", false, 2500],
      ["Résiliée", false, 2500],
      ["En essai", true, 2500],
    ]);
    expect(summary.activeCount).toBe(2);
    expect(summary.discountCents).toBe(5000);
  });
});
