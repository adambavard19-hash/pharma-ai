import { describe, expect, it } from "vitest";
import {
  MAX_TIERS,
  nextTier,
  parseTiers,
  rewardModeOf,
  tierReached,
  validateChallengeTerms,
  validateManualEntry,
  type ChallengeTermsInput,
} from "../terms";

/**
 * Les conditions d'un challenge : une période cohérente, un objectif entier,
 * une prime par unité OU des paliers croissants. Et les saisies manuelles :
 * dans la période, jamais dans le futur, jamais nulles.
 */

const input = (overrides: Partial<ChallengeTermsInput> = {}): ChallengeTermsInput => ({
  startsOn: "2026-10-01",
  endsOn: "2026-12-31",
  targetUnits: 120,
  rewardMode: "PER_UNIT",
  bonusPerUnitCents: 150,
  tiers: [],
  ...overrides,
});

describe("validation des conditions", () => {
  it("accepte des conditions cohérentes", () => {
    expect(validateChallengeTerms(input())).toEqual({});
    expect(validateChallengeTerms(input({ rewardMode: "NONE", bonusPerUnitCents: null, targetUnits: null }))).toEqual({});
    expect(validateChallengeTerms(input({ startsOn: "2026-10-01", endsOn: "2026-10-01" }))).toEqual({});
  });

  it("refuse une fin avant le début, une date inexistante, une durée de plus de deux ans", () => {
    expect(validateChallengeTerms(input({ endsOn: "2026-09-30" })).endsOn).toBe("La fin doit suivre le début.");
    expect(validateChallengeTerms(input({ startsOn: "2026-02-30" })).startsOn).toBeDefined();
    expect(validateChallengeTerms(input({ endsOn: "2028-12-31" })).endsOn).toBe("Un challenge dure au plus deux ans.");
  });

  it("refuse un objectif qui n'est pas un entier positif", () => {
    expect(validateChallengeTerms(input({ targetUnits: 0 })).targetUnits).toBeDefined();
    expect(validateChallengeTerms(input({ targetUnits: 12.5 })).targetUnits).toBeDefined();
  });

  it("exige le montant d'une prime par unité", () => {
    expect(validateChallengeTerms(input({ bonusPerUnitCents: null })).bonusPerUnitCents).toBe("Indiquez la prime par unité.");
    expect(validateChallengeTerms(input({ bonusPerUnitCents: 0 })).bonusPerUnitCents).toBeDefined();
  });

  it("exige des paliers distincts, payés, et qui ne rapportent pas moins en montant", () => {
    const tiers = (list: [number, number][]) => input({ rewardMode: "TIERS", bonusPerUnitCents: null, tiers: list.map(([units, bonusCents]) => ({ units, bonusCents })) });
    expect(validateChallengeTerms(tiers([[50, 10_000], [100, 25_000]]))).toEqual({});
    expect(validateChallengeTerms(tiers([[100, 25_000], [50, 10_000]]))).toEqual({});
    expect(validateChallengeTerms(tiers([])).tiers).toBe("Ajoutez au moins un palier.");
    expect(validateChallengeTerms(tiers([[50, 10_000], [50, 20_000]])).tiers).toBe("Deux paliers ont le même seuil.");
    expect(validateChallengeTerms(tiers([[50, 20_000], [100, 10_000]])).tiers).toBe("Un palier plus haut ne peut pas rapporter moins.");
    expect(validateChallengeTerms(tiers([[50, 0]])).tiers).toBe("Chaque palier a un montant.");
    expect(validateChallengeTerms(tiers([[0, 1_000]])).tiers).toBeDefined();
    expect(validateChallengeTerms(tiers(Array.from({ length: MAX_TIERS + 1 }, (_, i) => [i + 1, (i + 1) * 100] as [number, number]))).tiers).toBeDefined();
  });
});

describe("relecture des paliers enregistrés", () => {
  it("trie, déduplique et ignore ce qui est illisible, sans jamais lever d'erreur", () => {
    expect(parseTiers(null)).toEqual([]);
    expect(parseTiers("n'importe quoi")).toEqual([]);
    expect(
      parseTiers([
        { units: 100, bonusCents: 25_000 },
        { units: 50, bonusCents: 10_000 },
        { units: 50, bonusCents: 12_000 },
        { units: "x", bonusCents: 1 },
        { units: 10 },
        null,
      ]),
    ).toEqual([
      { units: 50, bonusCents: 12_000 },
      { units: 100, bonusCents: 25_000 },
    ]);
  });

  it("donne le palier atteint et le suivant", () => {
    const tiers = [{ units: 50, bonusCents: 10_000 }, { units: 100, bonusCents: 25_000 }];
    expect(tierReached(tiers, 49)).toBeNull();
    expect(tierReached(tiers, 100)).toEqual({ units: 100, bonusCents: 25_000 });
    expect(nextTier(tiers, 49)).toEqual({ units: 50, bonusCents: 10_000 });
    expect(nextTier(tiers, 100)).toBeNull();
  });

  it("déduit le mode de rémunération", () => {
    expect(rewardModeOf({ bonusPerUnitCents: null, tiers: [] })).toBe("NONE");
    expect(rewardModeOf({ bonusPerUnitCents: 0, tiers: null })).toBe("NONE");
    expect(rewardModeOf({ bonusPerUnitCents: 150, tiers: [] })).toBe("PER_UNIT");
    expect(rewardModeOf({ bonusPerUnitCents: 150, tiers: [{ units: 1, bonusCents: 1 }] })).toBe("TIERS");
  });
});

describe("saisies manuelles", () => {
  const period = { startsOn: new Date("2026-10-01T00:00:00Z"), endsOn: new Date("2026-10-31T00:00:00Z") };

  it("accepte une saisie datée dans la période, bornes comprises, jusqu'à aujourd'hui", () => {
    expect(validateManualEntry({ units: 5, occurredOn: "2026-10-01" }, period, "2026-10-15")).toEqual({});
    expect(validateManualEntry({ units: -2, occurredOn: "2026-10-15" }, period, "2026-10-15")).toEqual({});
    expect(validateManualEntry({ units: 5, occurredOn: "2026-10-31" }, period, "2026-11-10")).toEqual({});
  });

  it("refuse zéro, un nombre décimal, une date hors période ou dans le futur", () => {
    expect(validateManualEntry({ units: 0, occurredOn: "2026-10-05" }, period, "2026-10-15").units).toBeDefined();
    expect(validateManualEntry({ units: 1.5, occurredOn: "2026-10-05" }, period, "2026-10-15").units).toBeDefined();
    expect(validateManualEntry({ units: 3, occurredOn: "2026-09-30" }, period, "2026-10-15").occurredOn).toBe("La date doit être comprise dans la période du challenge.");
    expect(validateManualEntry({ units: 3, occurredOn: "2026-11-01" }, period, "2026-11-10").occurredOn).toBe("La date doit être comprise dans la période du challenge.");
    expect(validateManualEntry({ units: 3, occurredOn: "2026-10-20" }, period, "2026-10-15").occurredOn).toBe("La date ne peut pas être dans le futur.");
    expect(validateManualEntry({ units: 3, occurredOn: "20/10/2026" }, period, "2026-10-15").occurredOn).toBe("Date invalide.");
  });
});
