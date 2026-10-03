import { describe, expect, it } from "vitest";
import {
  attentionHeadline,
  attentionTotal,
  bucketIndexOf,
  buckets,
  cancellationDates,
  connectorNeedsAttention,
  countsAsIncident,
  countSeries,
  firstCancellationByKey,
  formatDayShort,
  formatLongDate,
  formatRate,
  formatTime,
  granularityOf,
  isPaymentLate,
  mrrAt,
  mrrSeries,
  orderAttention,
  periodRange,
  priceAt,
  sortTodayItems,
  subscriptionEndAt,
  technicalErrors,
  todayRange,
  conversionRate,
  upcomingDaysRange,
  type MrrSubscriptionFact,
  type PaymentFact,
  type TodayItem,
} from "../metrics";

const DAY = 24 * 60 * 60 * 1000;
// Samedi 3 octobre 2026, 10 h à Paris (heure d'été, UTC+2).
const NOW = new Date("2026-10-03T08:00:00Z");
const P30 = { value: "30j", days: 30 };
const P3M = { value: "3m", days: 91 };
const P12M = { value: "12m", days: 365 };

function sub(overrides: Partial<MrrSubscriptionFact> = {}): MrrSubscriptionFact {
  return {
    id: "sub_1",
    status: "ACTIVE",
    createdAt: new Date("2026-08-01T10:00:00Z"),
    updatedAt: new Date("2026-08-01T10:00:00Z"),
    canceledAt: null,
    endedAt: null,
    contractPriceCents: 29_000,
    planMonthlyPriceCents: 34_900,
    ...overrides,
  };
}

const paid = (subscriptionId: string, at: string): PaymentFact => ({ subscriptionId, status: "PAID", paidAt: new Date(at) });

describe("jours et périodes, heure de Paris", () => {
  it("aujourd'hui va de minuit à minuit à Paris, même quand UTC est encore la veille", () => {
    const lateEvening = new Date("2026-10-03T23:30:00Z"); // 1 h 30 le 4 octobre à Paris
    const range = todayRange(lateEvening);
    expect(range.start.toISOString()).toBe("2026-10-03T22:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-04T22:00:00.000Z");
  });

  it("« aujourd'hui ou sous 7 jours » s'arrête au soir du 7ᵉ jour", () => {
    const range = upcomingDaysRange(NOW, 7);
    expect(range.start.toISOString()).toBe("2026-10-02T22:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-10T22:00:00.000Z");
  });

  it("une période de 30 jours compte aujourd'hui et les 29 jours précédents", () => {
    const range = periodRange(P30, NOW);
    expect(range.start.toISOString()).toBe("2026-09-03T22:00:00.000Z"); // 4 septembre, minuit à Paris
    expect(range.end).toBe(NOW);
  });

  it("par semaine jusqu'à 3 mois, par mois sur 12 mois", () => {
    expect(granularityOf(P30)).toBe("week");
    expect(granularityOf(P3M)).toBe("week");
    expect(granularityOf(P12M)).toBe("month");
  });
});

describe("tranches des graphiques", () => {
  it("30 jours : des semaines du lundi, la première partielle, la dernière jusqu'à maintenant", () => {
    const list = buckets(P30, NOW);
    expect(list.map((b) => b.label)).toEqual(["04/09", "07/09", "14/09", "21/09", "28/09"]);
    expect(list[0].start.toISOString()).toBe("2026-09-03T22:00:00.000Z");
    expect(list[1].start.toISOString()).toBe("2026-09-06T22:00:00.000Z"); // lundi 7 septembre, minuit à Paris
    expect(list[list.length - 1].end).toBe(NOW);
  });

  it("les tranches se touchent, sans trou ni chevauchement, et recouvrent la période", () => {
    for (const period of [P30, P3M, P12M]) {
      const list = buckets(period, NOW);
      for (let i = 1; i < list.length; i++) expect(list[i].start.getTime()).toBe(list[i - 1].end.getTime());
      expect(list[0].start.getTime()).toBe(periodRange(period, NOW).start.getTime());
    }
  });

  it("3 mois : 14 semaines (une partielle, puis 13 lundis)", () => {
    const list = buckets(P3M, NOW);
    expect(list).toHaveLength(14);
    expect(list[0].label).toBe("05/07");
    expect(list[1].label).toBe("06/07");
  });

  it("12 mois : des mois calendaires, changement d'heure compris", () => {
    const list = buckets(P12M, NOW);
    expect(list).toHaveLength(13);
    expect(list[0].label).toBe("oct. 25");
    expect(list[list.length - 1].label).toBe("oct. 26");
    // 1er novembre 2025 : heure d'hiver, minuit à Paris = 23 h UTC la veille.
    expect(list[1].start.toISOString()).toBe("2025-10-31T23:00:00.000Z");
    expect(list[1].label).toBe("nov. 25");
  });

  it("une semaine qui suit le passage à l'heure d'hiver commence bien à minuit à Paris", () => {
    const list = buckets(P30, new Date("2026-11-10T12:00:00Z"));
    const monday = list.find((b) => b.key === "2026-10-26");
    expect(monday?.start.toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });

  it("une date sur une frontière va dans la tranche qui commence ; maintenant compte dans la dernière", () => {
    const list = buckets(P30, NOW);
    expect(bucketIndexOf(list[1].start, list)).toBe(1);
    expect(bucketIndexOf(NOW, list)).toBe(list.length - 1);
    expect(bucketIndexOf(new Date(NOW.getTime() + 1), list)).toBe(-1);
    expect(bucketIndexOf(new Date(list[0].start.getTime() - 1), list)).toBe(-1);
  });
});

describe("séries de comptage", () => {
  it("sans donnée : une série de zéros, une valeur par tranche", () => {
    const list = buckets(P30, NOW);
    const series = countSeries([], list);
    expect(series).toHaveLength(list.length);
    expect(series.every((p) => p.value === 0)).toBe(true);
  });

  it("chaque date tombe dans sa tranche ; les dates absentes ou hors période sont ignorées", () => {
    const list = buckets(P30, NOW);
    const series = countSeries([new Date("2026-09-05T10:00:00Z"), new Date("2026-09-08T10:00:00Z"), new Date("2026-09-09T10:00:00Z"), null, undefined, new Date("2026-01-01T00:00:00Z")], list);
    expect(series.map((p) => p.value)).toEqual([1, 2, 0, 0, 0]);
  });

  it("la somme des barres égale le nombre d'évènements de la période", () => {
    const range = periodRange(P3M, NOW);
    const dates = Array.from({ length: 40 }, (_, i) => new Date(NOW.getTime() - i * 3 * DAY));
    const inPeriod = dates.filter((d) => d >= range.start && d <= range.end).length;
    const total = countSeries(dates, buckets(P3M, NOW)).reduce((s, p) => s + p.value, 0);
    expect(total).toBe(inPeriod);
  });
});

describe("MRR reconstitué", () => {
  it("sans abonnement : une courbe à zéro", () => {
    expect(mrrSeries([], [], buckets(P30, NOW)).every((p) => p.value === 0)).toBe(true);
  });

  it("un abonnement ne compte qu'à partir de son premier paiement encaissé", () => {
    const s = sub();
    expect(mrrAt([s], [], NOW)).toBe(0);
    expect(mrrAt([s], [{ subscriptionId: "sub_1", status: "FAILED", paidAt: null }], NOW)).toBe(0);
    const payments = [paid("sub_1", "2026-09-15T09:00:00Z")];
    expect(mrrAt([s], payments, new Date("2026-09-10T00:00:00Z"))).toBe(0);
    expect(mrrAt([s], payments, NOW)).toBe(29_000);
    const series = mrrSeries([s], payments, buckets(P30, NOW));
    expect(series.map((p) => p.value)).toEqual([0, 0, 29_000, 29_000, 29_000]);
  });

  it("un abonnement résilié sort du MRR à sa date de résiliation", () => {
    const s = sub({ canceledAt: new Date("2026-09-20T10:00:00Z"), status: "CANCELED" });
    const payments = [paid("sub_1", "2026-08-01T10:00:00Z")];
    const series = mrrSeries([s], payments, buckets(P30, NOW));
    // Fins de tranche : 7/09, 14/09, 21/09 (résilié le 20), 28/09, maintenant.
    expect(series.map((p) => p.value)).toEqual([29_000, 29_000, 0, 0, 0]);
  });

  it("la fin retenue est la première des deux dates ; un résilié sans date prend sa dernière mise à jour", () => {
    expect(subscriptionEndAt(sub({ canceledAt: new Date("2026-09-20T00:00:00Z"), endedAt: new Date("2026-09-30T00:00:00Z") }))?.toISOString()).toBe("2026-09-20T00:00:00.000Z");
    expect(subscriptionEndAt(sub({ status: "CANCELED", updatedAt: new Date("2026-09-12T00:00:00Z") }))?.toISOString()).toBe("2026-09-12T00:00:00.000Z");
    expect(subscriptionEndAt(sub())).toBeNull();
  });

  it("le tarif contractuel prime sur le catalogue ; à défaut, le catalogue", () => {
    const payments = [paid("sub_1", "2026-08-01T10:00:00Z"), paid("sub_2", "2026-08-01T10:00:00Z")];
    expect(mrrAt([sub(), sub({ id: "sub_2", contractPriceCents: null })], payments, NOW)).toBe(29_000 + 34_900);
  });

  it("une modification de tarif tracée ne réécrit pas le passé", () => {
    const s = sub({ contractPriceCents: 25_000 });
    const changes = [{ subscriptionId: "sub_1", previousCents: 29_000, effectiveAt: new Date("2026-09-16T10:00:00Z") }];
    expect(priceAt(s, changes, new Date("2026-09-10T00:00:00Z"))).toBe(29_000);
    expect(priceAt(s, changes, NOW)).toBe(25_000);
    const series = mrrSeries([s], [paid("sub_1", "2026-08-01T10:00:00Z")], buckets(P30, NOW), changes);
    expect(series.map((p) => p.value)).toEqual([29_000, 29_000, 25_000, 25_000, 25_000]);
  });

  it("un abonnement créé après la fin de tranche ne compte pas, même payé ensuite", () => {
    const s = sub({ createdAt: new Date("2026-09-25T10:00:00Z") });
    const series = mrrSeries([s], [paid("sub_1", "2026-09-25T11:00:00Z")], buckets(P30, NOW));
    expect(series.map((p) => p.value)).toEqual([0, 0, 0, 29_000, 29_000]);
  });
});

describe("conversion essai → abonnement", () => {
  const range = periodRange(P30, NOW);

  it("aucun essai terminé : pas de taux, affiché « — »", () => {
    const result = conversionRate([{ trialEndsAt: new Date(NOW.getTime() + 3 * DAY), status: "TRIALING" }], range, NOW);
    expect(result).toEqual({ ended: 0, converted: 0, rate: null });
    expect(formatRate(result.rate)).toBe("—");
  });

  it("parmi les essais terminés dans la période, la part devenue payante", () => {
    const result = conversionRate(
      [
        { trialEndsAt: new Date("2026-09-10T10:00:00Z"), status: "ACTIVE" },
        { trialEndsAt: new Date("2026-09-12T10:00:00Z"), status: "PAST_DUE" },
        { trialEndsAt: new Date("2026-09-20T10:00:00Z"), status: "CANCELED" },
        { trialEndsAt: new Date("2026-09-25T10:00:00Z"), status: "PAUSED" },
        { trialEndsAt: new Date("2026-06-01T10:00:00Z"), status: "ACTIVE" }, // avant la période
        { trialEndsAt: new Date(NOW.getTime() + DAY), status: "TRIALING" }, // pas encore terminé
        { trialEndsAt: null, status: "ACTIVE" },
      ],
      range,
      NOW,
    );
    expect(result).toEqual({ ended: 4, converted: 2, rate: 0.5 });
    expect(formatRate(result.rate)).toBe("50 %");
  });
});

describe("résiliations de la période", () => {
  const range = periodRange(P30, NOW);

  it("deux sources pour le même départ : comptée une fois, à la première date", () => {
    const dates = cancellationDates(
      [
        { key: "org_1", at: new Date("2026-09-10T10:00:00Z") }, // demande confirmée
        { key: "org_1", at: new Date("2026-09-30T10:00:00Z") }, // fin chez Stripe
        { key: "org_2", at: new Date("2026-09-15T10:00:00Z") },
        { key: "org_3", at: new Date("2026-05-01T10:00:00Z") }, // hors période
        { key: "org_4", at: null },
      ],
      range,
    );
    expect(dates.map((d) => d.toISOString())).toEqual(["2026-09-10T10:00:00.000Z", "2026-09-15T10:00:00.000Z"]);
  });

  it("la date de départ d'un client est la première des deux sources (lue aussi par la liste des abonnements)", () => {
    const first = firstCancellationByKey([
      { key: "org_1", at: new Date("2026-09-30T10:00:00Z") },
      { key: "org_1", at: new Date("2026-09-10T10:00:00Z") },
      { key: "org_2", at: null },
    ]);
    expect([...first.entries()].map(([key, at]) => [key, at.toISOString()])).toEqual([["org_1", "2026-09-10T10:00:00.000Z"]]);
  });

  it("un départ déjà compté avant la période ne revient pas dans la période", () => {
    const dates = cancellationDates(
      [
        { key: "org_1", at: new Date("2026-08-20T10:00:00Z") },
        { key: "org_1", at: new Date("2026-09-20T10:00:00Z") },
      ],
      range,
    );
    expect(dates).toEqual([]);
  });
});

describe("retards de paiement et état technique", () => {
  it("retard : statut Stripe en retard ou impayé, ou échec non suivi d'un paiement", () => {
    const base = { lastPaymentAt: null, lastPaymentFailedAt: null };
    expect(isPaymentLate({ ...base, status: "PAST_DUE" })).toBe(true);
    expect(isPaymentLate({ ...base, status: "UNPAID" })).toBe(true);
    expect(isPaymentLate({ status: "ACTIVE", lastPaymentAt: new Date("2026-09-01T00:00:00Z"), lastPaymentFailedAt: new Date("2026-09-02T00:00:00Z") })).toBe(true);
    expect(isPaymentLate({ status: "ACTIVE", lastPaymentAt: new Date("2026-09-03T00:00:00Z"), lastPaymentFailedAt: new Date("2026-09-02T00:00:00Z") })).toBe(false);
    expect(isPaymentLate({ status: "CANCELED", lastPaymentAt: null, lastPaymentFailedAt: new Date("2026-09-02T00:00:00Z") })).toBe(false);
    expect(isPaymentLate({ ...base, status: "ACTIVE" })).toBe(false);
  });

  it("connecteur : en erreur, déconnecté ou silencieux ; jamais « en attente d'appairage »", () => {
    const fresh = { lastSyncAt: new Date(NOW.getTime() - 60_000), lastSeenAt: new Date(NOW.getTime() - 60_000), intervalSeconds: 300 };
    expect(connectorNeedsAttention({ ...fresh, status: "PENDING", lastSyncAt: null, lastSeenAt: null }, NOW)).toBe(false);
    expect(connectorNeedsAttention({ ...fresh, status: "ERROR" }, NOW)).toBe(true);
    expect(connectorNeedsAttention({ ...fresh, status: "DISCONNECTED" }, NOW)).toBe(true);
    expect(connectorNeedsAttention({ ...fresh, status: "CONNECTED" }, NOW)).toBe(false);
    expect(connectorNeedsAttention({ ...fresh, status: "CONNECTED", lastSyncAt: new Date(NOW.getTime() - 2 * 3600_000) }, NOW)).toBe(true);
    expect(connectorNeedsAttention({ ...fresh, status: "CONNECTED", lastSeenAt: new Date(NOW.getTime() - 2 * 3600_000) }, NOW)).toBe(true);
    // Un statut inattendu se juge sur la fraîcheur réelle, jamais sur son seul libellé.
    expect(connectorNeedsAttention({ ...fresh, status: "STALE" }, NOW)).toBe(false);
  });

  it("incident : compté sauf sur une officine de démonstration ; sans officine, toujours compté", () => {
    const demo = new Set(["ph_demo"]);
    expect(countsAsIncident({ pharmacyId: "ph_demo" }, demo)).toBe(false);
    expect(countsAsIncident({ pharmacyId: "ph_real" }, demo)).toBe(true);
    expect(countsAsIncident({ pharmacyId: null }, demo)).toBe(true);
  });

  it("erreurs de l'état technique : les incidents des démonstrations n'entrent pas dans le total", () => {
    const errors = technicalErrors(
      {
        connectors: [{ id: "c1", needsAttention: true }, { id: "c2", needsAttention: false }],
        counterPosts: [{ id: "p1", inError: true }],
        incidents: [{ id: "i1", pharmacyId: "ph_real" }, { id: "i2", pharmacyId: null }, { id: "i3", pharmacyId: "ph_demo" }],
      },
      new Set(["ph_demo"]),
    );
    expect(errors.connectors.map((c) => c.id)).toEqual(["c1"]);
    expect(errors.posts.map((p) => p.id)).toEqual(["p1"]);
    expect(errors.incidents.map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(errors.total).toBe(4);
  });
});

describe("bloc « À traiter »", () => {
  it("rouge d'abord, puis orange, dans l'ordre de déclaration", () => {
    const cards = orderAttention([
      { key: "contrats", tone: "warning" as const },
      { key: "paiements", tone: "danger" as const },
      { key: "essais", tone: "warning" as const },
      { key: "resiliations", tone: "danger" as const },
    ]);
    expect(cards.map((c) => c.key)).toEqual(["paiements", "resiliations", "contrats", "essais"]);
  });

  it("le total additionne les cartes ; la phrase s'accorde", () => {
    expect(attentionTotal([{ count: 0 }, { count: 3 }, { count: 2 }])).toBe(5);
    expect(attentionHeadline(0)).toBe("Rien ne requiert votre attention");
    expect(attentionHeadline(1)).toBe("1 action nécessite votre attention");
    expect(attentionHeadline(5)).toBe("5 actions nécessitent votre attention");
  });
});

describe("bloc « Aujourd'hui »", () => {
  it("chronologique ; à heure égale, la démonstration d'abord", () => {
    const at = new Date("2026-10-03T12:00:00Z");
    const item = (id: string, kind: TodayItem["kind"], date: Date): TodayItem => ({ id, kind, at: date, precision: "time", title: id, href: "/admin" });
    const sorted = sortTodayItems([item("c", "contrat", new Date("2026-10-05T12:00:00Z")), item("r", "relance", at), item("d", "demo", at), item("e", "essai", new Date("2026-10-03T06:00:00Z"))]);
    expect(sorted.map((i) => i.id)).toEqual(["e", "d", "r", "c"]);
  });

  it("la date et l'heure se lisent à Paris", () => {
    expect(formatLongDate(NOW)).toBe("Samedi 3 octobre 2026");
    expect(formatLongDate(new Date("2026-10-03T22:30:00Z"))).toBe("Dimanche 4 octobre 2026");
    expect(formatTime(NOW)).toBe("10:00");
  });

  it("le jour se dit « Aujourd'hui », « Demain », puis en date courte", () => {
    expect(formatDayShort(new Date("2026-10-03T20:00:00Z"), NOW)).toBe("Aujourd'hui");
    expect(formatDayShort(new Date("2026-10-03T22:30:00Z"), NOW)).toBe("Demain"); // 0 h 30 le 4 à Paris
    expect(formatDayShort(new Date("2026-10-06T10:00:00Z"), NOW)).toMatch(/mar\.? 6 oct\.?/);
  });
});
