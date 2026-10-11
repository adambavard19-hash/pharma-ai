import { describe, expect, it } from "vitest";
import {
  BONUS_TIERS,
  COMMISSION_TIERS,
  SIMULATOR_MAX,
  bonusLabel,
  bonusStatusLine,
  bonusesTotalCents,
  commissionSubject,
  commissionsTotalCents,
  currentRateCents,
  displayedRateCents,
  isProvisionalProgressive,
  isRecomputable,
  nextActivationGain,
  nextBonus,
  nextTier,
  planProgressiveSync,
  preGridTiers,
  progressToNextBonus,
  rankActivations,
  rateForRank,
  rewardsFor,
  simulate,
  simulatorMax,
  summarizeEarnings,
  unlockedBonuses,
  type PlanCommission,
} from "../progressive-commission";
import { computeCommissionCents, describeCommissionRule } from "../commission";

/**
 * La grille progressive, vérifiée contre une implémentation NAÏVE écrite à
 * part (une boucle, les seuils en dur, rien de partagé avec le module) sur
 * chaque valeur de 0 à 150, plus les valeurs de référence données par le
 * fondateur.
 */

const naiveRate = (k: number) => (k <= 9 ? 20_000 : k <= 19 ? 25_000 : 30_000);
const naiveCommissions = (n: number) => {
  let total = 0;
  for (let k = 1; k <= n; k += 1) total += naiveRate(k);
  return total;
};
const naiveBonuses = (n: number) => (n >= 10 ? 20_000 : 0) + (n >= 25 ? 35_000 : 0) + (n >= 50 ? 50_000 : 0) + (n >= 100 ? 75_000 : 0);

describe("la grille et les bonus, tels que décidés", () => {
  it("trois paliers : 200 € (1–9), 250 € (10–19), 300 € (dès 20)", () => {
    expect(COMMISSION_TIERS).toEqual([
      { from: 1, to: 9, rateCents: 20_000 },
      { from: 10, to: 19, rateCents: 25_000 },
      { from: 20, to: null, rateCents: 30_000 },
    ]);
  });

  it("quatre bonus : Bronze 10 / +200 €, Argent 25 / +350 €, Or 50 / +500 €, Élite 100 / +750 €", () => {
    expect(BONUS_TIERS).toEqual([
      { at: 10, cents: 20_000, name: "Bronze" },
      { at: 25, cents: 35_000, name: "Argent" },
      { at: 50, cents: 50_000, name: "Or" },
      { at: 100, cents: 75_000, name: "Élite" },
    ]);
  });
});

describe("valeurs de référence", () => {
  it.each([
    [0, 0, 0],
    [1, 20_000, 0],
    [9, 180_000, 0],
    [10, 205_000, 20_000],
    [19, 430_000, 20_000],
    [20, 460_000, 20_000],
    [25, 610_000, 55_000],
    [50, 1_360_000, 105_000],
    [100, 2_860_000, 180_000],
    [150, 4_360_000, 180_000],
  ])("%i pharmacies : %i de commissions, %i de bonus", (n, commissions, bonuses) => {
    expect(commissionsTotalCents(n)).toBe(commissions);
    expect(bonusesTotalCents(n)).toBe(bonuses);
    expect(simulate(n).totalCents).toBe(commissions + bonuses);
  });

  it("la maquette : 25 pharmacies = 6 100 € + 550 € = 6 650 €, commission actuelle 300 €, prochain bonus Or +500 €, encore 25", () => {
    const result = simulate(25);
    expect(result).toMatchObject({ pharmacies: 25, commissionsCents: 610_000, bonusesCents: 55_000, totalCents: 665_000, rateCents: 30_000, nextRateCents: 30_000 });
    expect(result.nextBonus).toEqual({ at: 50, cents: 50_000, name: "Or", remaining: 25 });
    expect(result.unlocked.map((bonus) => bonus.name)).toEqual(["Bronze", "Argent"]);
    expect(result.progressToNextBonus).toBe(0);
  });
});

describe("contre une implémentation naïve, de 0 à 150", () => {
  it("chaque rang, chaque total, chaque bonus", () => {
    for (let n = 0; n <= SIMULATOR_MAX; n += 1) {
      if (n >= 1) expect(rateForRank(n), `rang ${n}`).toBe(naiveRate(n));
      expect(commissionsTotalCents(n), `commissions ${n}`).toBe(naiveCommissions(n));
      expect(bonusesTotalCents(n), `bonus ${n}`).toBe(naiveBonuses(n));
      const result = simulate(n);
      expect(result.totalCents, `total ${n}`).toBe(naiveCommissions(n) + naiveBonuses(n));
      expect(result.rateCents, `commission actuelle ${n}`).toBe(naiveRate(Math.max(1, n)));
      expect(result.nextRateCents, `prochaine ${n}`).toBe(naiveRate(n + 1));
      // Marginal : la pharmacie n+1 ajoute exactement sa propre commission, les précédentes ne bougent pas.
      expect(commissionsTotalCents(n + 1) - commissionsTotalCents(n)).toBe(naiveRate(n + 1));
      const next = [10, 25, 50, 100].find((at) => n < at);
      expect(result.nextBonus?.at ?? null, `prochain bonus ${n}`).toBe(next ?? null);
      if (next) expect(result.nextBonus?.remaining).toBe(next - n);
      expect(result.progressToNextBonus).toBeGreaterThanOrEqual(0);
      expect(result.progressToNextBonus).toBeLessThanOrEqual(1);
    }
  });
});

describe("les frontières", () => {
  it("le rang : 9 → 200 €, 10 → 250 €, 19 → 250 €, 20 → 300 € ; hors grille → 0", () => {
    expect([rateForRank(9), rateForRank(10), rateForRank(19), rateForRank(20), rateForRank(1_000)]).toEqual([20_000, 25_000, 25_000, 30_000, 30_000]);
    expect([rateForRank(0), rateForRank(-3), rateForRank(Number.NaN)]).toEqual([0, 0, 0]);
  });

  it("les bonus se débloquent pile au seuil, une seule fois, et se cumulent", () => {
    expect(unlockedBonuses(9)).toEqual([]);
    expect(unlockedBonuses(10).map((b) => b.name)).toEqual(["Bronze"]);
    expect(unlockedBonuses(24).map((b) => b.name)).toEqual(["Bronze"]);
    expect(unlockedBonuses(25).map((b) => b.name)).toEqual(["Bronze", "Argent"]);
    expect(unlockedBonuses(49)).toHaveLength(2);
    expect(unlockedBonuses(50)).toHaveLength(3);
    expect(unlockedBonuses(99)).toHaveLength(3);
    expect(unlockedBonuses(100)).toHaveLength(4);
    expect(bonusesTotalCents(150)).toBe(bonusesTotalCents(100));
  });

  it("commission actuelle (palier atteint) et prochaine pharmacie : 0, 9, 10, 19, 20", () => {
    expect([0, 9, 10, 19, 20].map(displayedRateCents)).toEqual([20_000, 20_000, 25_000, 25_000, 30_000]);
    expect([0, 9, 10, 19, 20].map(currentRateCents)).toEqual([20_000, 25_000, 25_000, 30_000, 30_000]);
  });

  it("prochain palier de commission : à 0 la 10e (encore 10), à 9 la 10e (encore 1), à 10 la 20e, rien dès 20", () => {
    expect(nextTier(0)).toEqual({ from: 10, rateCents: 25_000, remaining: 10 });
    expect(nextTier(9)).toEqual({ from: 10, rateCents: 25_000, remaining: 1 });
    expect(nextTier(10)).toEqual({ from: 20, rateCents: 30_000, remaining: 10 });
    expect(nextTier(19)).toEqual({ from: 20, rateCents: 30_000, remaining: 1 });
    expect(nextTier(20)).toBeNull();
  });

  it("prochain bonus et avancement entre deux paliers", () => {
    expect(nextBonus(0)).toEqual({ at: 10, cents: 20_000, name: "Bronze", remaining: 10 });
    expect(nextBonus(99)).toEqual({ at: 100, cents: 75_000, name: "Élite", remaining: 1 });
    expect(nextBonus(100)).toBeNull();
    expect(progressToNextBonus(5)).toBe(0.5);
    expect(progressToNextBonus(10)).toBe(0);
    expect(progressToNextBonus(40)).toBe(0.6);
    expect(progressToNextBonus(75)).toBe(0.5);
    expect(progressToNextBonus(100)).toBe(1);
  });

  it("une saisie folle vaut 0 ou est arrondie vers le bas", () => {
    expect(simulate(-5).totalCents).toBe(0);
    expect(simulate(Number.NaN).totalCents).toBe(0);
    expect(simulate(Number.POSITIVE_INFINITY).totalCents).toBe(0);
    expect(simulate(10.9).pharmacies).toBe(10);
  });
});

describe("la règle d'un commercial", () => {
  it("PROGRESSIVE : la commission du rang donné ; décrite en une ligne", () => {
    const contract = { monthlyPriceCents: 12_600, durationMonths: 12 };
    expect(computeCommissionCents({ type: "PROGRESSIVE", value: 0 }, contract)).toBe(20_000);
    expect(computeCommissionCents({ type: "PROGRESSIVE", value: 0 }, contract, { rank: 12 })).toBe(25_000);
    expect(computeCommissionCents({ type: "PROGRESSIVE", value: 99_999 }, contract, { rank: 31 })).toBe(30_000);
    expect(computeCommissionCents({ type: "BONUS", value: 0 }, contract)).toBe(0);
    // Les montants s'écrivent avec une espace insécable avant « € » (formatPriceEuros) : on la lit comme une espace.
    expect(describeCommissionRule({ type: "PROGRESSIVE", value: 0 }).replace(/\u00a0/g, " ")).toBe("Grille progressive : 200 € à 300 € par pharmacie activée, + bonus de palier (10, 25, 50, 100)");
    // Les règles d'avant ne changent pas.
    expect(computeCommissionCents({ type: "FIXED", value: 25_000 }, contract)).toBe(25_000);
    expect(describeCommissionRule({ type: "FIXED", value: 25_000 })).toBe("250,00 € par contrat");
  });

  it("libellés : « Bonus Bronze — Pharmacie… » pour un bonus, la pharmacie sinon", () => {
    expect(bonusLabel({ type: "BONUS", bonusTier: 50 })).toBe("Bonus Or");
    expect(bonusLabel({ type: "BONUS", bonusTier: 7 })).toBe("Bonus de palier");
    expect(bonusLabel({ type: "PROGRESSIVE", bonusTier: null })).toBeNull();
    expect(commissionSubject({ type: "BONUS", bonusTier: 10 }, "Pharmacie du Port")).toBe("Bonus Bronze — Pharmacie du Port");
    expect(commissionSubject({ type: "FIXED" }, "Pharmacie du Port")).toBe("Pharmacie du Port");
  });
});

// ---------------------------------------------------------------- Plan du recalcul

const at = (day: number) => new Date(Date.UTC(2026, 0, day, 9));
const activation = (prospectId: string, day: number) => ({ prospectId, at: at(day) });
const commission = (overrides: Partial<PlanCommission> & { prospectId: string }): PlanCommission => ({ id: `c_${overrides.prospectId}${overrides.bonusTier ? `_b${overrides.bonusTier}` : ""}`, type: "PROGRESSIVE", status: "EARNED", amountCents: 1, invoiceId: null, bonusTier: null, ...overrides });
const many = (count: number, firstDay = 1) => Array.from({ length: count }, (_, index) => activation(`p${String(index + 1).padStart(3, "0")}`, firstDay + index));

describe("le plan du recalcul", () => {
  it("rang = ordre d'activation, puis identifiant à date égale", () => {
    const ranked = rankActivations([activation("b", 3), activation("c", 1), activation("a", 3)]);
    expect(ranked.map((row) => [row.prospectId, row.rank])).toEqual([["c", 1], ["a", 2], ["b", 3]]);
  });

  it("chaque commission de grille d'une pharmacie activée prend la commission de SON rang", () => {
    const activations = many(12);
    const commissions = activations.map((row) => commission({ prospectId: row.prospectId }));
    const plan = planProgressiveSync({ activations, commissions, paidProspectIds: new Set() });
    expect(plan.amountUpdates.map((update) => [update.rank, update.toCents])).toEqual([...Array.from({ length: 9 }, (_, i) => [i + 1, 20_000]), [10, 25_000], [11, 25_000], [12, 25_000]]);
  });

  it("une pharmacie pas encore activée : prévision = commission de la prochaine (rang n + 1)", () => {
    const plan = planProgressiveSync({ activations: many(9), commissions: [commission({ prospectId: "nouvelle", status: "FORECAST" })], paidProspectIds: new Set() });
    expect(plan.amountUpdates).toEqual([{ id: "c_nouvelle", prospectId: "nouvelle", fromCents: 1, toCents: 25_000, rank: null }]);
  });

  it("payée, annulée ou facturée : jamais touchée ; acquise, à payer (sans facture) ou prévisionnelle : recalculée", () => {
    expect(isRecomputable({ status: "PAID", invoiceId: null })).toBe(false);
    expect(isRecomputable({ status: "CANCELLED", invoiceId: null })).toBe(false);
    expect(isRecomputable({ status: "PAYABLE", invoiceId: "inv_1" })).toBe(false);
    expect(isRecomputable({ status: "EARNED", invoiceId: "inv_1" })).toBe(false);
    expect(isRecomputable({ status: "PAYABLE", invoiceId: null })).toBe(true);
    expect(isRecomputable({ status: "EARNED", invoiceId: null })).toBe(true);
    expect(isRecomputable({ status: "FORECAST", invoiceId: null })).toBe(true);
    const activations = many(3);
    const plan = planProgressiveSync({
      activations,
      commissions: [commission({ prospectId: "p001", status: "PAID" }), commission({ prospectId: "p002", status: "CANCELLED" }), commission({ prospectId: "p003", status: "PAYABLE", invoiceId: "inv_1" })],
      paidProspectIds: new Set(),
    });
    expect(plan.amountUpdates).toEqual([]);
  });

  it("les commissions d'avant la grille (montant fixe, accords) gardent leur montant", () => {
    const plan = planProgressiveSync({ activations: many(2), commissions: [commission({ prospectId: "p001", type: "FIXED", amountCents: 30_000 }), commission({ prospectId: "p002", type: "PERCENT", amountCents: 18_900 })], paidProspectIds: new Set() });
    expect(plan.amountUpdates).toEqual([]);
  });

  it("le montant déjà juste n'est pas réécrit (idempotence)", () => {
    const activations = many(10);
    const commissions = activations.map((row, index) => commission({ prospectId: row.prospectId, amountCents: rateForRank(index + 1) }));
    commissions.push(commission({ prospectId: "p010", type: "BONUS", bonusTier: 10, amountCents: 20_000, status: "FORECAST" }));
    const plan = planProgressiveSync({ activations, commissions, paidProspectIds: new Set() });
    expect(plan).toMatchObject({ amountUpdates: [], bonusCreations: [], bonusRelinks: [], bonusPromotions: [] });
  });

  it("bonus : créé au palier, rattaché à la pharmacie qui l'atteint, prévisionnel sans premier paiement, acquis avec", () => {
    const activations = many(25);
    expect(planProgressiveSync({ activations: many(9), commissions: [], paidProspectIds: new Set() }).bonusCreations).toEqual([]);
    const pending = planProgressiveSync({ activations, commissions: [], paidProspectIds: new Set(["p010"]) });
    expect(pending.bonusCreations.map((creation) => [creation.tier.name, creation.prospectId, creation.earned])).toEqual([["Bronze", "p010", true], ["Argent", "p025", false]]);
  });

  it("bonus déjà là : jamais recréé ; prévisionnel → acquis au premier paiement ; acquis, payé ou annulé : on n'y revient pas", () => {
    const activations = many(25);
    const forecast = commission({ prospectId: "p010", type: "BONUS", bonusTier: 10, amountCents: 20_000, status: "FORECAST" });
    const earned = commission({ prospectId: "p025", type: "BONUS", bonusTier: 25, amountCents: 35_000, status: "EARNED" });
    const plan = planProgressiveSync({ activations, commissions: [forecast, earned], paidProspectIds: new Set(["p010", "p025"]) });
    expect(plan.bonusCreations).toEqual([]);
    expect(plan.bonusPromotions.map((promotion) => [promotion.id, promotion.tier.name])).toEqual([[forecast.id, "Bronze"]]);
    const cancelled = commission({ prospectId: "p010", type: "BONUS", bonusTier: 10, amountCents: 20_000, status: "CANCELLED" });
    expect(planProgressiveSync({ activations, commissions: [cancelled], paidProspectIds: new Set(["p010"]) })).toMatchObject({ bonusCreations: [{ tier: { at: 25 } }], bonusPromotions: [] });
  });

  it("un bonus prévisionnel suit la pharmacie qui atteint AUJOURD'HUI le palier ; un bonus facturé ne bouge pas", () => {
    // p999 est activée avant toutes les autres : c'est désormais p009 qui est la 10e.
    const activations = [activation("p999", 0), ...many(9)];
    const forecast = commission({ prospectId: "p010", type: "BONUS", bonusTier: 10, amountCents: 20_000, status: "FORECAST" });
    const plan = planProgressiveSync({ activations, commissions: [forecast], paidProspectIds: new Set(["p009"]) });
    expect(plan.bonusRelinks).toEqual([{ id: forecast.id, tier: BONUS_TIERS[0], fromProspectId: "p010", toProspectId: "p009" }]);
    expect(plan.bonusPromotions).toEqual([{ id: forecast.id, tier: BONUS_TIERS[0], prospectId: "p009" }]);
    const invoiced = { ...forecast, invoiceId: "inv_1" };
    expect(planProgressiveSync({ activations, commissions: [invoiced], paidProspectIds: new Set(["p009"]) })).toMatchObject({ bonusRelinks: [], bonusPromotions: [] });
  });

  it("un bonus n'est jamais supprimé, même si le total redescend sous le palier (dossier réaffecté)", () => {
    const forecast = commission({ prospectId: "p010", type: "BONUS", bonusTier: 10, amountCents: 20_000, status: "FORECAST" });
    const plan = planProgressiveSync({ activations: many(9), commissions: [forecast], paidProspectIds: new Set() });
    expect(plan).toMatchObject({ bonusCreations: [], bonusRelinks: [], bonusPromotions: [] });
  });

  it("activée mais créditée à un AUTRE commercial (réaffectée avant son activation) : sa commission restée ici n'est jamais recalculée", () => {
    const plan = planProgressiveSync({ activations: many(3), commissions: [commission({ prospectId: "partie", amountCents: 30_000 })], paidProspectIds: new Set(), activatedElsewhere: new Set(["partie"]) });
    expect(plan.amountUpdates).toEqual([]);
    // Sans cette information, elle serait traitée en prévision et suivrait le total du commercial : c'est ce qu'on évite.
    expect(planProgressiveSync({ activations: many(3), commissions: [commission({ prospectId: "partie", amountCents: 30_000 })], paidProspectIds: new Set() }).amountUpdates).toHaveLength(1);
  });

  it("palier atteint AVANT le passage à la grille : listé, jamais créé d'office ; créé sur demande explicite ; un palier atteint depuis : créé", () => {
    const activations = many(25); // jours 1 à 25 : la 10e le jour 10, la 25e le jour 25
    const plan = planProgressiveSync({ activations, commissions: [], paidProspectIds: new Set(["p010"]), gridSince: at(20) });
    expect(plan.preGridBonuses.map((bonus) => [bonus.tier.name, bonus.prospectId, bonus.earned])).toEqual([["Bronze", "p010", true]]);
    expect(plan.bonusCreations.map((bonus) => bonus.tier.name)).toEqual(["Argent"]);
    const explicit = planProgressiveSync({ activations, commissions: [], paidProspectIds: new Set(), gridSince: at(20), includePreGridBonuses: true });
    expect(explicit.bonusCreations.map((bonus) => bonus.tier.name)).toEqual(["Bronze", "Argent"]);
    expect(explicit.preGridBonuses).toEqual([]);
    // La 10e activée le jour même du passage : depuis la grille.
    expect(planProgressiveSync({ activations, commissions: [], paidProspectIds: new Set(), gridSince: at(10) }).preGridBonuses).toEqual([]);
    // Une ligne de bonus déjà là (rattrapage passé) se traite comme les autres.
    const existing = commission({ prospectId: "p010", type: "BONUS", bonusTier: 10, amountCents: 20_000, status: "FORECAST" });
    expect(planProgressiveSync({ activations, commissions: [existing], paidProspectIds: new Set(["p010"]), gridSince: at(20) }).bonusPromotions).toHaveLength(1);
  });

  it("commercial sorti de la grille : ni montant, ni création, ni rattachement ; un bonus prévisionnel devient acquis au paiement de SA pharmacie", () => {
    const activations = [activation("p999", 0), ...many(12)];
    const forecast = commission({ prospectId: "p010", type: "BONUS", bonusTier: 10, amountCents: 20_000, status: "FORECAST" });
    const plan = planProgressiveSync({ activations, commissions: [commission({ prospectId: "p001" }), forecast], paidProspectIds: new Set(["p010"]), gridActive: false });
    expect(plan).toMatchObject({ amountUpdates: [], bonusCreations: [], preGridBonuses: [], bonusRelinks: [] });
    expect(plan.bonusPromotions).toEqual([{ id: forecast.id, tier: BONUS_TIERS[0], prospectId: "p010" }]);
  });

  it("paliers d'avant la grille : ceux dont la pharmacie du palier a été activée avant la date de passage", () => {
    const ranked = many(30).map((row) => ({ at: row.at }));
    expect(preGridTiers(ranked, at(26)).map((tier) => tier.at)).toEqual([10, 25]);
    expect(preGridTiers(ranked, at(25)).map((tier) => tier.at)).toEqual([10]);
    expect(preGridTiers(ranked, null)).toEqual([]);
    expect(preGridTiers([], at(26))).toEqual([]);
  });

  it("une commission de grille d'une pharmacie pas encore activée a un montant provisoire", () => {
    expect(isProvisionalProgressive({ type: "PROGRESSIVE", activated: false })).toBe(true);
    expect(isProvisionalProgressive({ type: "PROGRESSIVE", activated: true })).toBe(false);
    expect(isProvisionalProgressive({ type: "FIXED", activated: false })).toBe(false);
  });

  it("100 activations, tout payé : les quatre bonus, acquis", () => {
    const activations = many(100);
    const plan = planProgressiveSync({ activations, commissions: [], paidProspectIds: new Set(activations.map((row) => row.prospectId)) });
    expect(plan.bonusCreations.map((creation) => [creation.tier.at, creation.prospectId, creation.earned])).toEqual([[10, "p010", true], [25, "p025", true], [50, "p050", true], [100, "p100", true]]);
  });
});

// ---------------------------------------------------------------- Écran

describe("les vrais gains et les récompenses", () => {
  const rows = [
    { type: "PROGRESSIVE", status: "PAID", amountCents: 20_000, bonusTier: null },
    { type: "PROGRESSIVE", status: "EARNED", amountCents: 25_000, bonusTier: null },
    { type: "FIXED", status: "PAYABLE", amountCents: 30_000, bonusTier: null },
    { type: "PROGRESSIVE", status: "FORECAST", amountCents: 30_000, bonusTier: null },
    { type: "PROGRESSIVE", status: "CANCELLED", amountCents: 99_900, bonusTier: null },
    { type: "BONUS", status: "PAID", amountCents: 20_000, bonusTier: 10 },
    { type: "BONUS", status: "FORECAST", amountCents: 35_000, bonusTier: 25 },
  ];

  it("gains cumulés = acquis + à payer + payé ; le prévisionnel à part ; l'annulé nulle part", () => {
    expect(summarizeEarnings(rows)).toEqual({
      commissionsCents: 75_000,
      commissionsUpcomingCents: 30_000,
      bonusesCents: 20_000,
      bonusesUpcomingCents: 35_000,
      totalCents: 95_000,
      upcomingCents: 65_000,
      paidCents: 40_000,
      toBePaidCents: 55_000,
    });
    expect(summarizeEarnings([]).totalCents).toBe(0);
  });

  it("récompenses : la ligne de bonus fait foi, sinon le total d'activations", () => {
    const rewards = rewardsFor(27, rows.filter((row) => row.type === "BONUS"));
    expect(rewards.map((reward) => [reward.name, reward.state, reward.remaining])).toEqual([
      ["Bronze", "PAID", 0],
      ["Argent", "AWAITING_PAYMENT", 0],
      ["Or", "LOCKED", 23],
      ["Élite", "LOCKED", 73],
    ]);
    expect(rewardsFor(12, [{ bonusTier: 10, status: "EARNED" }])[0].state).toBe("EARNED");
    expect(rewardsFor(12, [{ bonusTier: 10, status: "PAYABLE" }])[0].state).toBe("EARNED");
    expect(rewardsFor(12, [{ bonusTier: 10, status: "CANCELLED" }])[0].state).toBe("CANCELLED");
    // Palier atteint sans ligne (recalcul pas encore passé) : en attente, jamais « débloqué » à tort.
    expect(rewardsFor(12, [])[0].state).toBe("AWAITING_PAYMENT");
    // Palier atteint avant le passage à la grille, sans ligne : il le dit.
    expect(rewardsFor(12, [], [10])[0].state).toBe("BEFORE_GRID");
    expect(rewardsFor(12, [{ bonusTier: 10, status: "EARNED" }], [10])[0].state).toBe("EARNED");
  });

  it("la ligne « Bonus débloqués » : d'après l'état de chaque récompense, un bonus annulé n'y compte pas", () => {
    const euros = (cents: number) => `${cents / 100} €`;
    expect(bonusStatusLine(rewardsFor(27, [{ bonusTier: 10, status: "PAID" }, { bonusTier: 25, status: "FORECAST" }]), euros)).toBe("1 versé · 1 en attente du 1er paiement (+350 €)");
    expect(bonusStatusLine(rewardsFor(30, [{ bonusTier: 10, status: "EARNED" }, { bonusTier: 25, status: "PAYABLE" }]), euros)).toBe("2 à verser");
    expect(bonusStatusLine(rewardsFor(12, [{ bonusTier: 10, status: "CANCELLED" }]), euros)).toBe("prochain : Argent à 25 pharmacies");
    expect(bonusStatusLine(rewardsFor(0, []), euros)).toBe("prochain : Bronze à 10 pharmacies");
    expect(bonusStatusLine(rewardsFor(12, [], [10]), euros)).toBe("1 atteint avant la grille");
    expect(bonusStatusLine(rewardsFor(100, [10, 25, 50, 100].map((bonusTier) => ({ bonusTier, status: "PAID" }))), euros)).toBe("4 versés");
  });

  it("la prochaine activation : sa commission, plus le bonus si elle atteint un palier", () => {
    expect(nextActivationGain(0)).toEqual({ rateCents: 20_000, bonus: null, totalCents: 20_000 });
    expect(nextActivationGain(9)).toEqual({ rateCents: 25_000, bonus: BONUS_TIERS[0], totalCents: 45_000 });
    expect(nextActivationGain(10)).toEqual({ rateCents: 25_000, bonus: null, totalCents: 25_000 });
    expect(nextActivationGain(24).totalCents).toBe(30_000 + 35_000);
    expect(nextActivationGain(49).totalCents).toBe(30_000 + 50_000);
    expect(nextActivationGain(99).totalCents).toBe(30_000 + 75_000);
    expect(nextActivationGain(100).totalCents).toBe(30_000);
    // Contre le calcul cumulé : la prochaine activation vaut exactement l'écart entre n + 1 et n.
    for (let n = 0; n <= 150; n += 1) expect(nextActivationGain(n).totalCents, `n=${n}`).toBe(simulate(n + 1).totalCents - simulate(n).totalCents);
  });

  it("la borne du simulateur : 150, ou au-delà du vrai total du commercial", () => {
    expect(simulatorMax(0)).toBe(SIMULATOR_MAX);
    expect(simulatorMax(125)).toBe(SIMULATOR_MAX);
    expect(simulatorMax(126)).toBe(200);
    expect(simulatorMax(160)).toBe(200);
    expect(simulatorMax(200)).toBe(250);
    for (const n of [0, 1, 150, 151, 175, 199, 200, 999]) expect(simulatorMax(n), `n=${n}`).toBeGreaterThan(n);
  });
});
