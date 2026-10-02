import { describe, expect, it } from "vitest";
import {
  computeChallengeProgress,
  effectiveStatusOf,
  progressPercent,
  sumRewards,
  type ChallengeManualEntry,
  type ChallengeSaleLine,
  type ChallengeTerms,
} from "../progress";

/**
 * La progression d'un challenge laboratoire : unités comptées selon le mode,
 * part des ventes et des saisies, objectif, primes (par unité ou par palier),
 * statut selon les dates et jours restants. Tout est daté par l'appelant :
 * aucune horloge n'est lue ici.
 */

const terms = (overrides: Partial<ChallengeTerms> = {}): ChallengeTerms => ({
  startsOn: "2026-10-01",
  endsOn: "2026-10-31",
  status: "ACTIVE",
  countMode: "ALL_SALES",
  targetUnits: 100,
  bonusPerUnitCents: 150,
  tiers: null,
  timeZone: "Europe/Paris",
  ...overrides,
});

const line = (overrides: Partial<ChallengeSaleLine> = {}): ChallengeSaleLine => ({
  productId: "p1",
  presentationId: null,
  quantity: 1,
  userId: "u1",
  createdAt: new Date("2026-10-10T09:00:00Z"),
  attributed: false,
  ...overrides,
});

const progress = (options: { terms?: Partial<ChallengeTerms>; lines?: ChallengeSaleLine[]; entries?: ChallengeManualEntry[]; today?: string } = {}) =>
  computeChallengeProgress({
    terms: terms(options.terms),
    lines: options.lines ?? [],
    entries: options.entries ?? [],
    today: options.today ?? "2026-10-15",
  });

describe("unités comptées", () => {
  it("compte toutes les ventes enregistrées en mode « toutes les ventes »", () => {
    const result = progress({ lines: [line({ quantity: 3 }), line({ quantity: 2, attributed: true })] });
    expect(result.salesUnits).toBe(5);
    expect(result.allSalesUnits).toBe(5);
    expect(result.attributedSalesUnits).toBe(2);
    expect(result.units).toBe(5);
  });

  it("ne compte que les ventes issues d'un conseil en mode « attribuées »", () => {
    const result = progress({ terms: { countMode: "ATTRIBUTED" }, lines: [line({ quantity: 3 }), line({ quantity: 2, attributed: true })] });
    expect(result.salesUnits).toBe(2);
    expect(result.allSalesUnits).toBe(5);
    expect(result.units).toBe(2);
  });

  it("ajoute les saisies manuelles, quel que soit le mode, et donne la part des ventes", () => {
    const result = progress({
      terms: { countMode: "ATTRIBUTED" },
      lines: [line({ quantity: 6, attributed: true }), line({ quantity: 4 })],
      entries: [{ units: 4, occurredOn: "2026-10-05" }],
    });
    expect(result.salesUnits).toBe(6);
    expect(result.manualUnits).toBe(4);
    expect(result.units).toBe(10);
    expect(result.salesShare).toBeCloseTo(0.6);
  });

  it("accepte une saisie négative qui corrige un relevé, sans jamais descendre sous zéro", () => {
    expect(progress({ lines: [line({ quantity: 5 })], entries: [{ units: -2, occurredOn: "2026-10-05" }] }).units).toBe(3);
    const negative = progress({ lines: [line({ quantity: 1 })], entries: [{ units: -5, occurredOn: "2026-10-05" }] });
    expect(negative.units).toBe(0);
    expect(negative.salesShare).toBeNull();
  });

  it("ignore les saisies datées hors de la période et les signale", () => {
    const result = progress({
      entries: [
        { units: 3, occurredOn: "2026-09-30" },
        { units: 2, occurredOn: new Date("2026-10-01T00:00:00Z") },
        { units: 5, occurredOn: "2026-10-31" },
        { units: 7, occurredOn: "2026-11-01" },
      ],
    });
    expect(result.manualUnits).toBe(7);
    expect(result.ignoredManualUnits).toBe(10);
  });

  it("n'a pas de part des ventes tant qu'aucune unité n'est comptée", () => {
    const result = progress();
    expect(result.units).toBe(0);
    expect(result.salesShare).toBeNull();
    expect(result.byProduct).toEqual([]);
  });
});

describe("bornes de la période (heure de Paris, jours inclus)", () => {
  it("compte une vente du premier jour à 0 h 05 et du dernier jour à 23 h 59", () => {
    const result = progress({
      today: "2026-11-02",
      lines: [
        line({ createdAt: new Date("2026-09-30T22:05:00Z") }), // 1er oct., 0 h 05 à Paris
        line({ createdAt: new Date("2026-10-31T22:59:00Z") }), // 31 oct., 23 h 59 à Paris (heure d'hiver)
      ],
    });
    expect(result.units).toBe(2);
  });

  it("écarte une vente de la veille au soir et du lendemain à 0 h 01", () => {
    const result = progress({
      lines: [
        line({ createdAt: new Date("2026-09-30T21:59:00Z") }), // 30 sept., 23 h 59 à Paris
        line({ createdAt: new Date("2026-10-31T23:01:00Z") }), // 1er nov., 0 h 01 à Paris
      ],
    });
    expect(result.units).toBe(0);
    expect(result.allSalesUnits).toBe(0);
  });
});

describe("objectif et pourcentage", () => {
  it("rapporte les unités à l'objectif, au-delà de 100 % si l'objectif est dépassé", () => {
    expect(progressPercent(progress({ lines: [line({ quantity: 25 })] }))).toBe(25);
    const exceeded = progress({ terms: { targetUnits: 20 }, lines: [line({ quantity: 25 })] });
    expect(exceeded.ratio).toBeCloseTo(1.25);
    expect(progressPercent(exceeded)).toBe(125);
  });

  it("sans objectif ni palier : ni pourcentage ni montant potentiel", () => {
    const result = progress({ terms: { targetUnits: null }, lines: [line({ quantity: 4 })] });
    expect(result.target).toBeNull();
    expect(result.ratio).toBeNull();
    expect(progressPercent(result)).toBeNull();
    expect(result.potentialCents).toBeNull();
    expect(result.earnedCents).toBe(600);
  });

  it("sans objectif mais avec paliers : le dernier palier sert d'objectif, et on le dit", () => {
    const result = progress({
      terms: { targetUnits: null, bonusPerUnitCents: null, tiers: [{ units: 50, bonusCents: 10_000 }, { units: 100, bonusCents: 25_000 }] },
      lines: [line({ quantity: 30 })],
    });
    expect(result.target).toBe(100);
    expect(result.targetIsImplicit).toBe(true);
    expect(result.ratio).toBeCloseTo(0.3);
  });
});

describe("rémunération", () => {
  it("prime par unité : potentiel = objectif × prime, réalisé = unités × prime", () => {
    const result = progress({ lines: [line({ quantity: 40 })] });
    expect(result.rewardMode).toBe("PER_UNIT");
    expect(result.potentialCents).toBe(15_000);
    expect(result.earnedCents).toBe(6_000);
  });

  it("prime par unité sans objectif : pas de potentiel, mais le réalisé est connu", () => {
    const result = progress({ terms: { targetUnits: null }, lines: [line({ quantity: 10 })] });
    expect(result.potentialCents).toBeNull();
    expect(result.earnedCents).toBe(1_500);
  });

  it("paliers : seul le palier atteint est acquis, pas un prorata", () => {
    const tiers = [
      { units: 100, bonusCents: 25_000 },
      { units: 50, bonusCents: 10_000 },
      { units: 150, bonusCents: 40_000 },
    ];
    const below = progress({ terms: { tiers, bonusPerUnitCents: null }, lines: [line({ quantity: 49 })] });
    expect(below.rewardMode).toBe("TIERS");
    expect(below.earnedCents).toBe(0);
    expect(below.reachedTier).toBeNull();
    expect(below.nextTier).toEqual({ units: 50, bonusCents: 10_000 });
    expect(below.unitsToNextTier).toBe(1);

    const exactly = progress({ terms: { tiers, bonusPerUnitCents: null }, lines: [line({ quantity: 50 })] });
    expect(exactly.earnedCents).toBe(10_000);
    expect(exactly.reachedTier).toEqual({ units: 50, bonusCents: 10_000 });

    const top = progress({ terms: { tiers, bonusPerUnitCents: null }, lines: [line({ quantity: 180 })] });
    expect(top.earnedCents).toBe(40_000);
    expect(top.nextTier).toBeNull();
    expect(top.unitsToNextTier).toBeNull();
  });

  it("paliers : le potentiel est le palier que donne l'objectif atteint", () => {
    const tiers = [{ units: 50, bonusCents: 10_000 }, { units: 100, bonusCents: 25_000 }, { units: 150, bonusCents: 40_000 }];
    expect(progress({ terms: { tiers, targetUnits: 100 } }).potentialCents).toBe(25_000);
    expect(progress({ terms: { tiers, targetUnits: 120 } }).potentialCents).toBe(25_000);
    expect(progress({ terms: { tiers, targetUnits: 30 } }).potentialCents).toBe(0);
    expect(progress({ terms: { tiers, targetUnits: null } }).potentialCents).toBe(40_000);
  });

  it("les paliers priment sur une prime par unité restée en base", () => {
    const result = progress({ terms: { tiers: [{ units: 10, bonusCents: 5_000 }], bonusPerUnitCents: 150 }, lines: [line({ quantity: 12 })] });
    expect(result.rewardMode).toBe("TIERS");
    expect(result.earnedCents).toBe(5_000);
  });

  it("sans prime : aucun montant, ni potentiel ni réalisé", () => {
    for (const bonus of [null, 0]) {
      const result = progress({ terms: { bonusPerUnitCents: bonus, tiers: [] }, lines: [line({ quantity: 12 })] });
      expect(result.rewardMode).toBe("NONE");
      expect(result.potentialCents).toBeNull();
      expect(result.earnedCents).toBeNull();
      expect(result.ratio).toBeCloseTo(0.12);
    }
  });
});

describe("statut effectif et jours restants", () => {
  it("est « à venir » avant le premier jour, avec le compte à rebours", () => {
    const result = progress({ today: "2026-09-28" });
    expect(result.effectiveStatus).toBe("UPCOMING");
    expect(result.daysUntilStart).toBe(3);
    expect(result.daysRemaining).toBe(31);
    expect(result.daysElapsed).toBe(0);
  });

  it("est « en cours » du premier au dernier jour inclus", () => {
    const first = progress({ today: "2026-10-01" });
    expect(first.effectiveStatus).toBe("RUNNING");
    expect(first.daysRemaining).toBe(31);
    expect(first.daysElapsed).toBe(1);

    const last = progress({ today: "2026-10-31" });
    expect(last.effectiveStatus).toBe("RUNNING");
    expect(last.daysRemaining).toBe(1);
    expect(last.daysElapsed).toBe(31);
  });

  it("est « terminé » le lendemain du dernier jour", () => {
    const result = progress({ today: "2026-11-01" });
    expect(result.effectiveStatus).toBe("ENDED");
    expect(result.daysRemaining).toBe(0);
    expect(result.daysElapsed).toBe(31);
  });

  it("suit le statut enregistré : terminé ou archivé avant l'heure", () => {
    expect(progress({ terms: { status: "ENDED" }, today: "2026-10-15" }).effectiveStatus).toBe("ENDED");
    expect(progress({ terms: { status: "ARCHIVED" }, today: "2026-10-15" }).effectiveStatus).toBe("ARCHIVED");
    expect(progress({ terms: { status: "ARCHIVED" }, today: "2026-09-01" }).effectiveStatus).toBe("ARCHIVED");
    expect(progress({ terms: { status: "ENDED" }, today: "2026-10-15" }).daysRemaining).toBe(0);
  });

  it("accepte des dates venues de la base (minuit UTC)", () => {
    expect(effectiveStatusOf({ startsOn: new Date("2026-10-01T00:00:00Z"), endsOn: new Date("2026-10-31T00:00:00Z"), status: "ACTIVE" }, "2026-10-31")).toBe("RUNNING");
  });

  it("ne projette la fin qu'en cours de challenge, après quelques jours", () => {
    expect(progress({ today: "2026-10-02", lines: [line({ createdAt: new Date("2026-10-01T10:00:00Z") })] }).projectedUnits).toBeNull();
    // 10 unités en 10 jours sur 31 : 31 au rythme actuel.
    expect(progress({ today: "2026-10-10", lines: [line({ quantity: 10, createdAt: new Date("2026-10-05T10:00:00Z") })] }).projectedUnits).toBe(31);
    expect(progress({ today: "2026-11-05" }).projectedUnits).toBeNull();
  });
});

describe("répartition par produit et par collaborateur", () => {
  it("détaille les ventes par produit, comptées selon le mode", () => {
    const result = progress({
      terms: { countMode: "ATTRIBUTED" },
      lines: [
        line({ productId: "a", quantity: 2 }),
        line({ productId: "b", quantity: 1, attributed: true }),
        line({ productId: "a", quantity: 1, attributed: true }),
      ],
    });
    expect(result.byProduct).toEqual([
      { key: "a", units: 3, attributedUnits: 1, counted: 1 },
      { key: "b", units: 1, attributedUnits: 1, counted: 1 },
    ]);
  });

  it("rattache les ventes à qui les a enregistrées, sans inventer d'auteur", () => {
    const result = progress({
      lines: [line({ userId: "u1", quantity: 2 }), line({ userId: "u2", quantity: 5 }), line({ userId: null, quantity: 1 })],
    });
    expect(result.byUser.map((row) => [row.key, row.counted])).toEqual([
      ["u2", 5],
      ["u1", 2],
      ["", 1],
    ]);
  });
});

describe("montants additionnés de plusieurs challenges", () => {
  it("additionne réalisé et potentiel des challenges rémunérés, sans compter ceux sans prime", () => {
    expect(
      sumRewards([
        { rewardMode: "PER_UNIT", earnedCents: 3_000, potentialCents: 15_000 },
        { rewardMode: "TIERS", earnedCents: 10_000, potentialCents: 25_000 },
        { rewardMode: "NONE", earnedCents: null, potentialCents: null },
      ]),
    ).toEqual({ rewarded: 2, earnedCents: 13_000, potentialCents: 40_000 });
  });

  it("ne donne pas de potentiel total dès qu'un challenge rémunéré n'en a pas", () => {
    // Prime par unité sans objectif : son potentiel est inconnu. L'omettre
    // afficherait « 45 € réalisés sur 30 € potentiels ».
    const totals = sumRewards([
      { rewardMode: "PER_UNIT", earnedCents: 4_500, potentialCents: null },
      { rewardMode: "TIERS", earnedCents: 0, potentialCents: 3_000 },
    ]);
    expect(totals.earnedCents).toBe(4_500);
    expect(totals.potentialCents).toBeNull();
  });

  it("ne fabrique aucun montant sans challenge rémunéré", () => {
    expect(sumRewards([])).toEqual({ rewarded: 0, earnedCents: 0, potentialCents: null });
    expect(sumRewards([{ rewardMode: "NONE", earnedCents: null, potentialCents: null }]).rewarded).toBe(0);
  });
});
