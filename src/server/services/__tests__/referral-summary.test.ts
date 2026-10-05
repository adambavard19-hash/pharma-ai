import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Ce que le titulaire voit de son parrainage : 20 % de moins par mois dès UN
 * filleul actif (jamais cumulé : deux filleuls, toujours 20 %), calculés sur son
 * tarif contractuel. Exception : le montant d'une offre de la console, figé sur
 * la fiche du filleul à son inscription ; le parrain a alors le plus avantageux
 * entre les 20 % et la somme de ces montants, borné par son tarif. Une offre qui
 * change ne touche jamais un filleul déjà inscrit. Base simulée, lecture seule.
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
  db.state.subscription = contract(12600);
  db.state.referredBy = null;
  vi.clearAllMocks();
});

describe("parrainage vu du titulaire : sans offre", () => {
  it("dès un filleul actif, 20 % de moins : 126 € deviennent 100,80 €, et le lien partagé porte le code", async () => {
    db.state.filleuls = [filleul("Pharmacie A")];
    const summary = await referralSummary("ph_1");
    expect(summary).toMatchObject({ code: "PB-ABC234", currentOffer: null, activeCount: 1, discountCents: 2520, discountBasis: "PERCENT", monthlyPriceCents: 12600, link: "https://pharmaboost.test/decouvrir/abonnement?parrain=PB-ABC234" });
    expect(summary.monthlyPriceCents! - summary.discountCents).toBe(10080);
    expect(summary.referrals.map((r) => r.offerAmountCents)).toEqual([null]);
  });

  it("NON CUMULABLE : deux, trois filleuls actifs donnent la même remise de 20 %, jamais 40 %", async () => {
    db.state.filleuls = [filleul("Pharmacie A"), filleul("Pharmacie B"), filleul("Pharmacie C")];
    const summary = await referralSummary("ph_1");
    expect(summary).toMatchObject({ activeCount: 3, discountCents: 2520, discountBasis: "PERCENT" });
    expect(summary.referrals.map((r) => r.offerAmountCents)).toEqual([null, null, null]);
  });

  it("la remise suit le tarif CONTRACTUEL de l'officine : 20 % de 99 €, pas de 126 €", async () => {
    db.state.subscription = { contractPriceCents: 9900, plan: { monthlyPriceCents: 12600 } };
    db.state.filleuls = [filleul("Pharmacie A")];
    expect((await referralSummary("ph_1")).discountCents).toBe(1980);
  });

  it("aucun filleul : aucune remise", async () => {
    expect(await referralSummary("ph_1")).toMatchObject({ activeCount: 0, discountCents: 0, discountBasis: null, referrals: [] });
  });

  it("sans abonnement suivi, des filleuls actifs ne donnent aucune remise : il n'y a rien à réduire", async () => {
    db.state.subscription = null;
    db.state.filleuls = [filleul("A"), filleul("B", { referralAmountCents: 4000 })];
    const summary = await referralSummary("ph_1");
    expect(summary).toMatchObject({ monthlyPriceCents: null, activeCount: 2, discountCents: 0, discountBasis: null });
  });

  it("le parrain de l'officine est nommé", async () => {
    db.state.referredBy = { name: "Pharmacie Marraine" };
    expect((await referralSummary("ph_1")).referredBy).toBe("Pharmacie Marraine");
  });
});

describe("parrainage vu du titulaire : avec une offre", () => {
  it("l'écran annonce l'offre en cours ; la remise est le plus avantageux entre les 20 % et le montant d'offre figé du filleul", async () => {
    db.state.offers = [offer("a", 4000, { endsAt: day("2026-11-01") })];
    db.state.filleuls = [filleul("Avant l'offre"), filleul("Pendant l'offre", { referralAmountCents: 4000 })];
    const summary = await referralSummary("ph_1");
    expect(summary.currentOffer).toEqual({ amountCents: 4000, endsAt: day("2026-11-01"), label: "Offre a" });
    expect(summary.referrals.map((r) => r.offerAmountCents)).toEqual([null, 4000]);
    // 40 € (le seul filleul d'offre) contre 25,20 € (20 %) : l'offre est prioritaire, sans s'ajouter aux 20 %.
    expect(summary).toMatchObject({ discountCents: 4000, discountBasis: "OFFERS" });
  });

  it("une offre moins avantageuse que les 20 % ne change rien : les 20 % s'appliquent", async () => {
    db.state.filleuls = [filleul("Pendant l'offre", { referralAmountCents: 1000 })];
    expect(await referralSummary("ph_1")).toMatchObject({ discountCents: 2520, discountBasis: "PERCENT" });
  });

  it("une offre qui change, se termine ou est annulée ne modifie JAMAIS le montant d'un filleul déjà inscrit", async () => {
    db.state.filleuls = [filleul("Inscrit à 40 €", { referralAmountCents: 4000 }), filleul("Inscrit hors offre")];
    const amounts = async () => {
      const s = await referralSummary("ph_1");
      return { amounts: s.referrals.map((r) => r.offerAmountCents), discount: s.discountCents, basis: s.discountBasis };
    };

    db.state.offers = [offer("a", 4000)];
    const during = await amounts();
    expect(during).toEqual({ amounts: [4000, null], discount: 4000, basis: "OFFERS" });

    // L'offre change : une nouvelle offre à 15 € plus récente. L'écran l'annonce, le filleul d'avant garde ses 40 €.
    db.state.offers = [offer("a", 4000), offer("b", 1500, { startsAt: day("2026-10-01"), createdAt: day("2026-10-01") })];
    const changed = await referralSummary("ph_1");
    expect(changed.currentOffer?.amountCents).toBe(1500);
    expect({ amounts: changed.referrals.map((r) => r.offerAmountCents), discount: changed.discountCents, basis: changed.discountBasis }).toEqual(during);

    // Les deux offres sont annulées : plus d'offre annoncée, rien ne bouge pour les inscrits.
    db.state.offers = [offer("a", 4000, { canceledAt: day("2026-10-02") }), offer("b", 1500, { startsAt: day("2026-10-01"), canceledAt: day("2026-10-02") })];
    const ended = await referralSummary("ph_1");
    expect(ended.currentOffer).toBeNull();
    expect({ amounts: ended.referrals.map((r) => r.offerAmountCents), discount: ended.discountCents, basis: ended.discountBasis }).toEqual(during);
  });

  it("une offre échue ou pas encore démarrée n'est pas annoncée", async () => {
    db.state.offers = [offer("echue", 4000, { endsAt: day("2026-01-01") }), offer("future", 5000, { startsAt: day("2099-01-01") })];
    const summary = await referralSummary("ph_1");
    expect(summary.currentOffer).toBeNull();
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

  it("un filleul inactif ou résilié reste listé avec son montant d'offre, mais ne compte ni dans le nombre ni dans la remise", async () => {
    db.state.filleuls = [
      filleul("Active", { referralAmountCents: 2500 }),
      filleul("Désactivée", { isActive: false, referralAmountCents: 2500 }),
      filleul("Résiliée", { referralAmountCents: 2500, organization: { subscription: { status: "CANCELED" } } }),
      filleul("En essai", { referralAmountCents: 2500, organization: { subscription: { status: "TRIALING" } } }),
    ];
    const summary = await referralSummary("ph_1");
    expect(summary.referrals.map((r) => [r.name, r.active, r.offerAmountCents])).toEqual([
      ["Active", true, 2500],
      ["Désactivée", false, 2500],
      ["Résiliée", false, 2500],
      ["En essai", true, 2500],
    ]);
    expect(summary.activeCount).toBe(2);
    // Deux filleuls d'offre actifs : 2 × 25 € = 50 €, plus avantageux que 25,20 € ; les deux inactifs n'y ajoutent rien.
    expect(summary).toMatchObject({ discountCents: 5000, discountBasis: "OFFERS" });
  });

  it("un seul filleul actif, des inactifs autour : 20 %, comme pour un seul filleul", async () => {
    db.state.filleuls = [filleul("Active"), filleul("Résiliée", { organization: { subscription: { status: "CANCELED" } } }), filleul("Désactivée", { isActive: false })];
    expect(await referralSummary("ph_1")).toMatchObject({ activeCount: 1, discountCents: 2520, discountBasis: "PERCENT" });
  });

  it("tous les filleuls sont inactifs : aucune remise", async () => {
    db.state.filleuls = [filleul("Résiliée", { organization: { subscription: { status: "CANCELED" } } }), filleul("Désactivée", { isActive: false })];
    expect(await referralSummary("ph_1")).toMatchObject({ activeCount: 0, discountCents: 0, discountBasis: null });
  });
});
