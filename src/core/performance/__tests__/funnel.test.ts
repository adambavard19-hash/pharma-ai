import { describe, expect, it } from "vitest";
import { ACCEPTED_STATUSES, PENDING_GRACE_HOURS } from "../definitions";
import { computeFunnel, isAcceptedStatus, isPendingAdvice, selectCountedAdvice } from "../funnel";
import type { AdviceOrigin, AdviceRow, AdviceStatus } from "../types";

const NOW = new Date("2026-10-06T12:00:00Z");
const HOUR = 3_600_000;
/** Créé il y a plus de 24 h : plus « en attente », même en PROPOSED. */
const OLD = new Date(NOW.getTime() - 48 * HOUR);

const ALL_STATUSES: AdviceStatus[] = ["PROPOSED", "ACCEPTED", "MODIFIED", "REPLACED", "REMOVED", "PRESENTED", "PURCHASED", "DECLINED", "IGNORED"];

let seq = 0;
function advice(status: AdviceStatus, overrides: Partial<AdviceRow> = {}): AdviceRow {
  seq += 1;
  return {
    id: `a${seq}`,
    createdAt: OLD,
    origin: "AI" as AdviceOrigin,
    status,
    productId: "prod-1",
    presentationId: null,
    label: "Produit",
    category: "VITAMINES",
    unitPriceCents: 0,
    prescriptionDeleted: false,
    ...overrides,
  };
}

function many(status: AdviceStatus, count: number, overrides: Partial<AdviceRow> = {}): AdviceRow[] {
  return Array.from({ length: count }, () => advice(status, overrides));
}

describe("isAcceptedStatus : chaque statut", () => {
  it.each([
    ["ACCEPTED", true],
    ["MODIFIED", true],
    ["REPLACED", true],
    ["PRESENTED", true],
    ["PURCHASED", true],
    ["DECLINED", true],
    ["REMOVED", false],
    ["IGNORED", false],
    ["PROPOSED", false],
  ] as const)("%s → %s", (status, expected) => {
    expect(isAcceptedStatus(status)).toBe(expected);
  });

  it("suit exactement la liste des définitions, et couvre les 9 statuts", () => {
    expect(ALL_STATUSES.filter(isAcceptedStatus).sort()).toEqual([...ACCEPTED_STATUSES].sort());
    expect(ALL_STATUSES).toHaveLength(9);
  });
});

describe("selectCountedAdvice", () => {
  it("garde les conseils IA et règle, écarte les ajouts manuels et les ordonnances supprimées", () => {
    const ai = advice("ACCEPTED", { origin: "AI" });
    const rule = advice("PROPOSED", { origin: "RULE" });
    const manual = advice("ACCEPTED", { origin: "MANUAL" });
    const deleted = advice("ACCEPTED", { origin: "AI", prescriptionDeleted: true });
    const manualDeleted = advice("ACCEPTED", { origin: "MANUAL", prescriptionDeleted: true });
    expect(selectCountedAdvice([ai, manual, rule, deleted, manualDeleted])).toEqual([ai, rule]);
  });

  it("ne modifie pas la liste reçue et accepte une liste vide", () => {
    const rows = [advice("ACCEPTED", { origin: "MANUAL" })];
    selectCountedAdvice(rows);
    expect(rows).toHaveLength(1);
    expect(selectCountedAdvice([])).toEqual([]);
  });
});

describe("isPendingAdvice : la fenêtre de 24 h", () => {
  const at = (ms: number) => new Date(NOW.getTime() - ms);

  it("la constante vaut 24 h", () => {
    expect(PENDING_GRACE_HOURS).toBe(24);
  });

  it("23 h 59 : en attente", () => {
    expect(isPendingAdvice(advice("PROPOSED", { createdAt: at(23 * HOUR + 59 * 60_000) }), NOW)).toBe(true);
  });

  it("24 h pile : déjà sans réponse (la fenêtre est « moins de 24 h »)", () => {
    expect(isPendingAdvice(advice("PROPOSED", { createdAt: at(24 * HOUR) }), NOW)).toBe(false);
  });

  it("24 h 01 : sans réponse", () => {
    expect(isPendingAdvice(advice("PROPOSED", { createdAt: at(24 * HOUR + 60_000) }), NOW)).toBe(false);
  });

  it("à la seconde : 23 h 59 min 59 s en attente, 24 h 00 min 01 s non", () => {
    expect(isPendingAdvice(advice("PROPOSED", { createdAt: at(24 * HOUR - 1000) }), NOW)).toBe(true);
    expect(isPendingAdvice(advice("PROPOSED", { createdAt: at(24 * HOUR + 1000) }), NOW)).toBe(false);
  });

  it("créé à l'instant : en attente", () => {
    expect(isPendingAdvice(advice("PROPOSED", { createdAt: NOW }), NOW)).toBe(true);
  });

  it("seul un conseil PROPOSED peut être en attente", () => {
    for (const status of ALL_STATUSES.filter((s) => s !== "PROPOSED")) {
      expect(isPendingAdvice(advice(status, { createdAt: NOW }), NOW)).toBe(false);
    }
  });
});

describe("computeFunnel : un conseil par statut", () => {
  it("range chaque statut dans la bonne case", () => {
    const rows = ALL_STATUSES.map((status) => advice(status));
    const { funnel } = computeFunnel({ advice: rows, previousAdvice: [], now: NOW });

    expect(funnel.proposed.value).toBe(9);
    // ACCEPTED, MODIFIED, REPLACED, PRESENTED, PURCHASED, DECLINED
    expect(funnel.accepted.value).toBe(6);
    expect(funnel.purchased.value).toBe(1);
    expect(funnel.declinedByPatient).toBe(1);
    // ACCEPTED, MODIFIED, REPLACED, PRESENTED : retenus mais sans vente confirmée
    expect(funnel.acceptedNotConfirmed).toBe(4);
    expect(funnel.removedByTeam).toBe(1);
    // IGNORED + PROPOSED de plus de 24 h
    expect(funnel.unanswered).toBe(2);
    expect(funnel.pending).toBe(0);
  });

  it("un PROPOSED récent est en attente, un ancien est sans réponse", () => {
    const recent = advice("PROPOSED", { createdAt: new Date(NOW.getTime() - 2 * HOUR) });
    const old = advice("PROPOSED", { createdAt: OLD });
    const { funnel } = computeFunnel({ advice: [recent, old], previousAdvice: [], now: NOW });
    expect(funnel.pending).toBe(1);
    expect(funnel.unanswered).toBe(1);
  });

  it("un statut IGNORED récent n'est pas en attente : il est sans réponse", () => {
    const ignored = advice("IGNORED", { createdAt: NOW });
    const { funnel } = computeFunnel({ advice: [ignored], previousAdvice: [], now: NOW });
    expect(funnel.pending).toBe(0);
    expect(funnel.unanswered).toBe(1);
  });
});

describe("computeFunnel : l'identité proposés = acceptés + retirés + sans réponse + en attente", () => {
  const identity = (f: ReturnType<typeof computeFunnel>["funnel"]) =>
    f.accepted.value + f.removedByTeam + f.unanswered + f.pending;

  it("tient sur un mélange de tous les statuts", () => {
    const rows = [
      ...many("ACCEPTED", 5),
      ...many("MODIFIED", 2),
      ...many("REPLACED", 1),
      ...many("PRESENTED", 3),
      ...many("PURCHASED", 4),
      ...many("DECLINED", 2),
      ...many("REMOVED", 6),
      ...many("IGNORED", 3),
      ...many("PROPOSED", 7), // anciens : sans réponse
      ...many("PROPOSED", 5, { createdAt: new Date(NOW.getTime() - HOUR) }), // récents : en attente
    ];
    const { funnel } = computeFunnel({ advice: rows, previousAdvice: [], now: NOW });
    expect(funnel.proposed.value).toBe(38);
    expect(identity(funnel)).toBe(funnel.proposed.value);
    expect(funnel.pending).toBe(5);
    expect(funnel.unanswered).toBe(10);
  });

  it("tient aussi quand des conseils sont écartés (manuels, ordonnance supprimée)", () => {
    const rows = [
      ...many("ACCEPTED", 3),
      ...many("REMOVED", 2),
      ...many("ACCEPTED", 4, { origin: "MANUAL" }),
      ...many("PURCHASED", 2, { prescriptionDeleted: true }),
      ...many("PROPOSED", 1, { createdAt: NOW }),
    ];
    const { funnel } = computeFunnel({ advice: rows, previousAdvice: [], now: NOW });
    expect(funnel.proposed.value).toBe(6);
    expect(identity(funnel)).toBe(6);
  });

  it("tient sur la période précédente, où plus rien n'est en attente", () => {
    const previous = [...many("ACCEPTED", 4), ...many("REMOVED", 1), ...many("PROPOSED", 3, { createdAt: NOW })];
    const { funnel } = computeFunnel({ advice: [], previousAdvice: previous, now: NOW });
    expect(funnel.proposed.previous).toBe(8);
    expect(funnel.accepted.previous).toBe(4);
    // les 3 PROPOSED de la période précédente (entièrement passée) comptent comme sans réponse :
    // taux précédent = 4 / 8, et non 4 / 5
    expect(funnel.acceptanceRate.previous).toBeCloseTo(0.5, 10);
  });

  it("tient pour un entonnoir vide", () => {
    const { funnel } = computeFunnel({ advice: [], previousAdvice: [], now: NOW });
    expect(identity(funnel)).toBe(0);
    expect(funnel.proposed.value).toBe(0);
  });
});

describe("computeFunnel : exclusions", () => {
  it("les ajouts manuels ne sont ni proposés, ni acceptés, ni achetés : ils sont comptés à part", () => {
    const rows = [...many("PURCHASED", 3, { origin: "MANUAL" }), ...many("ACCEPTED", 2)];
    const { funnel, manualExcluded, counted } = computeFunnel({ advice: rows, previousAdvice: [], now: NOW });
    expect(manualExcluded).toBe(3);
    expect(funnel.proposed.value).toBe(2);
    expect(funnel.accepted.value).toBe(2);
    expect(funnel.purchased.value).toBe(0);
    expect(counted).toHaveLength(2);
    expect(counted.every((row) => row.origin !== "MANUAL")).toBe(true);
  });

  it("les conseils d'une ordonnance supprimée sont ignorés et comptés à part", () => {
    const rows = [...many("ACCEPTED", 4, { prescriptionDeleted: true }), ...many("ACCEPTED", 1)];
    const { funnel, deletedPrescriptionAdvice, manualExcluded } = computeFunnel({ advice: rows, previousAdvice: [], now: NOW });
    expect(deletedPrescriptionAdvice).toBe(4);
    expect(manualExcluded).toBe(0);
    expect(funnel.proposed.value).toBe(1);
    expect(funnel.accepted.value).toBe(1);
  });

  it("un ajout manuel sur ordonnance supprimée n'est compté qu'une fois (manuel)", () => {
    const rows = [advice("ACCEPTED", { origin: "MANUAL", prescriptionDeleted: true }), advice("ACCEPTED")];
    const out = computeFunnel({ advice: rows, previousAdvice: [], now: NOW });
    expect(out.manualExcluded).toBe(1);
    expect(out.deletedPrescriptionAdvice).toBe(0);
    expect(out.counted.length + out.manualExcluded + out.deletedPrescriptionAdvice).toBe(rows.length);
  });

  it("les exclusions de la période précédente ne sont pas comptées dans les écarts de la période courante", () => {
    const previous = [...many("ACCEPTED", 5, { origin: "MANUAL" }), ...many("ACCEPTED", 2, { prescriptionDeleted: true }), ...many("ACCEPTED", 3)];
    const out = computeFunnel({ advice: [], previousAdvice: previous, now: NOW });
    expect(out.manualExcluded).toBe(0);
    expect(out.deletedPrescriptionAdvice).toBe(0);
    expect(out.funnel.proposed.previous).toBe(3);
  });

  it("`counted` est la liste des conseils retenus de la période courante, dans l'ordre d'entrée", () => {
    const a = advice("ACCEPTED");
    const m = advice("ACCEPTED", { origin: "MANUAL" });
    const r = advice("REMOVED", { origin: "RULE" });
    expect(computeFunnel({ advice: [a, m, r], previousAdvice: [], now: NOW }).counted).toEqual([a, r]);
  });
});

describe("computeFunnel : taux", () => {
  it("taux d'acceptation = acceptés ÷ (proposés − en attente) ; l'attente est exclue du dénominateur", () => {
    const rows = [
      ...many("ACCEPTED", 6),
      ...many("REMOVED", 2),
      ...many("IGNORED", 2),
      ...many("PROPOSED", 10, { createdAt: NOW }), // en attente : hors dénominateur
    ];
    const { funnel } = computeFunnel({ advice: rows, previousAdvice: [], now: NOW });
    expect(funnel.proposed.value).toBe(20);
    expect(funnel.pending).toBe(10);
    expect(funnel.acceptanceRate.value).toBeCloseTo(0.6, 10);
  });

  it("l'exemple de la spécification : 21 acceptés sur 34 proposés = 62 %", () => {
    const rows = [...many("ACCEPTED", 21), ...many("REMOVED", 8), ...many("IGNORED", 5)];
    const { funnel } = computeFunnel({ advice: rows, previousAdvice: [], now: NOW });
    expect(funnel.proposed.value).toBe(34);
    expect(Math.round((funnel.acceptanceRate.value as number) * 100)).toBe(62);
  });

  it("taux d'acceptation null quand tout est en attente (dénominateur 0), jamais 0 %", () => {
    const { funnel } = computeFunnel({ advice: many("PROPOSED", 4, { createdAt: NOW }), previousAdvice: [], now: NOW });
    expect(funnel.proposed.value).toBe(4);
    expect(funnel.pending).toBe(4);
    expect(funnel.acceptanceRate.value).toBeNull();
    expect(funnel.acceptanceRate.trend).toBe("none");
  });

  it("taux null sans aucun conseil", () => {
    const { funnel } = computeFunnel({ advice: [], previousAdvice: [], now: NOW });
    expect(funnel.acceptanceRate).toEqual({ value: null, previous: null, deltaPoints: null, trend: "none" });
    expect(funnel.conversionRate).toEqual({ value: null, previous: null, deltaPoints: null, trend: "none" });
  });

  it("taux de transformation = achetés ÷ acceptés ; null quand rien n'est accepté", () => {
    const some = computeFunnel({ advice: [...many("PURCHASED", 3), ...many("ACCEPTED", 9), ...many("REMOVED", 5)], previousAdvice: [], now: NOW });
    expect(some.funnel.conversionRate.value).toBeCloseTo(0.25, 10);

    const none = computeFunnel({ advice: many("REMOVED", 5), previousAdvice: [], now: NOW });
    expect(none.funnel.conversionRate.value).toBeNull();
  });

  it("un taux ne dépasse jamais 100 %, même quand tout est accepté et acheté", () => {
    const all = computeFunnel({ advice: many("PURCHASED", 12), previousAdvice: [], now: NOW });
    expect(all.funnel.acceptanceRate.value).toBe(1);
    expect(all.funnel.conversionRate.value).toBe(1);

    const mixed = computeFunnel({
      advice: ALL_STATUSES.flatMap((status) => many(status, 3)),
      previousAdvice: ALL_STATUSES.flatMap((status) => many(status, 2)),
      now: NOW,
    });
    for (const rate of [mixed.funnel.acceptanceRate, mixed.funnel.conversionRate]) {
      expect(rate.value as number).toBeGreaterThanOrEqual(0);
      expect(rate.value as number).toBeLessThanOrEqual(1);
      expect(rate.previous as number).toBeLessThanOrEqual(1);
    }
  });

  it("un refus du patient reste « accepté » (retenu par l'équipe) mais n'est pas un achat", () => {
    const { funnel } = computeFunnel({ advice: [...many("DECLINED", 2), ...many("PURCHASED", 1)], previousAdvice: [], now: NOW });
    expect(funnel.accepted.value).toBe(3);
    expect(funnel.declinedByPatient).toBe(2);
    expect(funnel.purchased.value).toBe(1);
    expect(funnel.acceptedNotConfirmed).toBe(0);
    expect(funnel.conversionRate.value).toBeCloseTo(1 / 3, 10);
  });

  it("acceptés non confirmés + achetés + refusés par le patient = acceptés", () => {
    const rows = [...many("ACCEPTED", 3), ...many("MODIFIED", 1), ...many("REPLACED", 2), ...many("PRESENTED", 4), ...many("PURCHASED", 5), ...many("DECLINED", 2)];
    const { funnel } = computeFunnel({ advice: rows, previousAdvice: [], now: NOW });
    expect(funnel.acceptedNotConfirmed + funnel.purchased.value + funnel.declinedByPatient).toBe(funnel.accepted.value);
    expect(funnel.acceptedNotConfirmed).toBe(10);
  });
});

describe("computeFunnel : comparaison avec la période précédente", () => {
  it("compare chaque nombre et chaque taux à la période précédente", () => {
    const current = [...many("ACCEPTED", 6), ...many("PURCHASED", 3), ...many("REMOVED", 1)]; // 10 proposés, 9 acceptés
    const previous = [...many("ACCEPTED", 2), ...many("PURCHASED", 1), ...many("REMOVED", 5), ...many("IGNORED", 2)]; // 10 proposés, 3 acceptés
    const { funnel } = computeFunnel({ advice: current, previousAdvice: previous, now: NOW });

    expect(funnel.proposed).toEqual({ value: 10, previous: 10, deltaPct: 0, trend: "flat" });
    expect(funnel.accepted).toEqual({ value: 9, previous: 3, deltaPct: 200, trend: "up" });
    expect(funnel.purchased).toEqual({ value: 3, previous: 1, deltaPct: 200, trend: "up" });
    expect(funnel.acceptanceRate.value).toBeCloseTo(0.9, 10);
    expect(funnel.acceptanceRate.previous).toBeCloseTo(0.3, 10);
    expect(funnel.acceptanceRate.deltaPoints).toBe(60);
    expect(funnel.acceptanceRate.trend).toBe("up");
  });

  it("période précédente vide : aucun pourcentage inventé", () => {
    const { funnel } = computeFunnel({ advice: many("ACCEPTED", 5), previousAdvice: [], now: NOW });
    expect(funnel.proposed).toEqual({ value: 5, previous: 0, deltaPct: null, trend: "up" });
    expect(funnel.accepted.deltaPct).toBeNull();
    expect(funnel.acceptanceRate.value).toBe(1);
    expect(funnel.acceptanceRate.previous).toBeNull();
    expect(funnel.acceptanceRate.deltaPoints).toBeNull();
    expect(funnel.acceptanceRate.trend).toBe("none");
  });

  it("période courante vide face à une précédente pleine : baisse de 100 %, taux inconnu", () => {
    const { funnel } = computeFunnel({ advice: [], previousAdvice: many("ACCEPTED", 4), now: NOW });
    expect(funnel.proposed).toEqual({ value: 0, previous: 4, deltaPct: -100, trend: "down" });
    expect(funnel.acceptanceRate.value).toBeNull();
    expect(funnel.acceptanceRate.previous).toBe(1);
    expect(funnel.acceptanceRate.trend).toBe("none");
  });
});
