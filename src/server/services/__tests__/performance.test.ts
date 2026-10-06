/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PerformancePeriod } from "@/core/performance/types";
import {
  adviceRow,
  analysisRow,
  daysBefore,
  fakeDb,
  hoursBefore,
  lineRow,
  pharmacyRow,
  saleRow,
  subscriptionRow,
  valuesOfKey,
} from "./performance-fake-db";

/**
 * Le service de performance sur une base simulée à plusieurs officines.
 *
 * La base simulée APPLIQUE les `where` : un filtre oublié dans le service fait
 * apparaître la ligne d'une autre officine (ou de la démonstration) dans le
 * rapport. Les tests regardent donc à la fois ce qui est lu (les `where`
 * capturés) et ce qui ressort (les chiffres).
 */

const demo = vi.hoisted(() => ({ on: false }));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db/client", async () => ({ prisma: (await import("./performance-fake-db")).fakeDb }));
// Même contrat que le vrai `activityScope` : hors environnement démo, tout ce qui est marqué démo est exclu.
vi.mock("@/server/db/demo-scope", () => ({ activityScope: () => (demo.on ? {} : { isDemo: false }) }));

const { loadPerformanceForPlatform, loadPerformanceReport, loadPortfolioForPlatform, loadSubscriptionReturn } =
  await import("../performance");
const { resolvePerformancePeriod } = await import("@/core/performance");

const A = "pharmacy-a";
const B = "pharmacy-b";
const ZONE = "Europe/Paris";
/** Mardi 6 octobre 2026, 12 h à Paris (heure d'été). */
const NOW = new Date("2026-10-06T10:00:00Z");
const PERIOD = resolvePerformancePeriod({ key: "7d", now: NOW, timeZone: ZONE });

/** Une période écrite à la main, pour tester les bornes sans dépendre du calcul des périodes. */
function literalPeriod(start: string, end: string, previousStart: string, previousEnd: string): PerformancePeriod {
  return {
    key: "custom",
    label: "Essai",
    start: new Date(start),
    end: new Date(end),
    previousStart: new Date(previousStart),
    previousEnd: new Date(previousEnd),
    granularity: "day",
    dayCount: 2,
    inProgress: false,
  };
}

/** Les conseils et les ventes de deux officines, avec tout ce qui ne doit JAMAIS être compté pour A. */
function seedTwoPharmacies() {
  const b1 = adviceRow({ id: "rec-b1", pharmacyId: B, status: "ACCEPTED", productId: "prod-b-1", product: { name: "Produit B secret", category: "VITAMINES" } });
  const a1 = adviceRow({ id: "rec-a1", status: "ACCEPTED", createdAt: hoursBefore(NOW, 48) });
  const a2 = adviceRow({
    id: "rec-a2",
    origin: "RULE",
    status: "PURCHASED",
    createdAt: hoursBefore(NOW, 30),
    productId: "prod-a-2",
    product: { name: "Crème A", category: "DERMOCOSMETIQUE" },
  });
  const a3 = adviceRow({ id: "rec-a3", status: "REMOVED", createdAt: hoursBefore(NOW, 72) });
  const a4 = adviceRow({ id: "rec-a4", status: "PROPOSED", createdAt: hoursBefore(NOW, 1) });
  const a5 = adviceRow({ id: "rec-a5", status: "IGNORED", createdAt: hoursBefore(NOW, 96) });
  const manual = adviceRow({ id: "rec-a6", origin: "MANUAL", status: "ACCEPTED", createdAt: hoursBefore(NOW, 40) });
  const deleted = adviceRow({ id: "rec-a7", status: "ACCEPTED", createdAt: hoursBefore(NOW, 50), prescription: { deletedAt: new Date("2026-10-05T08:00:00Z") } });
  const demoAdvice = adviceRow({ id: "rec-a8", status: "ACCEPTED", createdAt: hoursBefore(NOW, 20), isDemo: true });
  const older = adviceRow({ id: "rec-a9", status: "ACCEPTED", createdAt: daysBefore(NOW, 20) });
  const previous = adviceRow({ id: "rec-p1", status: "ACCEPTED", createdAt: new Date("2026-09-25T10:00:00Z") });

  const sales = [
    // Un ticket : une ligne issue d'un conseil au prix connu, une ligne d'un produit ajouté à la main.
    saleRow({ id: "s1", createdAt: hoursBefore(NOW, 20) }, [
      lineRow({ id: "l1", recommendationId: "rec-a2", productId: "prod-a-2", label: "Crème A", unitPriceCents: 2490, totalCents: 2490 }),
      lineRow({ id: "l2", recommendationId: "rec-a6", unitPriceCents: 900, totalCents: 900 }),
    ]),
    // Une ligne sans prix : une vente confirmée, jamais du chiffre d'affaires.
    saleRow({ id: "s2", createdAt: hoursBefore(NOW, 10) }, [lineRow({ id: "l3", recommendationId: "rec-a1", unitPriceCents: 0, totalCents: 0 })]),
    // Vente de démonstration de A.
    saleRow({ id: "s3", createdAt: hoursBefore(NOW, 5), isDemo: true }, [lineRow({ id: "l4", recommendationId: "rec-a2", unitPriceCents: 7700, totalCents: 7700 })]),
    // Vente de A dont la ligne renvoie au conseil de B : jamais attribuée.
    saleRow({ id: "s4", createdAt: hoursBefore(NOW, 8) }, [lineRow({ id: "l5", recommendationId: "rec-b1", unitPriceCents: 9900, totalCents: 9900 })]),
    // Vente d'un conseil dont l'ordonnance a été supprimée : ne compte plus.
    saleRow({ id: "s5", createdAt: hoursBefore(NOW, 6) }, [lineRow({ id: "l6", recommendationId: "rec-a7", unitPriceCents: 12_000, totalCents: 12_000 })]),
    // Vente de B.
    saleRow({ id: "s6", pharmacyId: B, createdAt: hoursBefore(NOW, 3) }, [lineRow({ id: "l7", recommendationId: "rec-b1", productId: "prod-b-1", label: "Produit B secret", unitPriceCents: 5000, totalCents: 5000 })]),
    // Période précédente de A.
    saleRow({ id: "s7", createdAt: new Date("2026-09-26T10:00:00Z") }, [lineRow({ id: "l8", recommendationId: "rec-p1", unitPriceCents: 1000, totalCents: 1000 })]),
  ];

  fakeDb.reset({
    pharmacies: [pharmacyRow(A), pharmacyRow(B)],
    recommendations: [a1, a2, a3, a4, a5, manual, deleted, demoAdvice, older, previous, b1],
    sales,
  });
}

beforeEach(() => {
  demo.on = false;
  fakeDb.reset();
});

describe("isolation : le rapport d'une officine ne contient rien d'une autre", () => {
  it("compte les conseils et les ventes de A, et rien d'autre", async () => {
    seedTwoPharmacies();
    const report = await loadPerformanceReport({ pharmacyId: A, period: PERIOD, now: NOW });

    // a1 accepté, a2 acheté, a3 retiré, a4 en attente, a5 jamais tranché.
    expect(report.funnel.proposed.value).toBe(5);
    expect(report.funnel.accepted.value).toBe(2);
    expect(report.funnel.purchased.value).toBe(1);
    expect(report.funnel.acceptedNotConfirmed).toBe(1);
    expect(report.funnel.removedByTeam).toBe(1);
    expect(report.funnel.unanswered).toBe(1);
    expect(report.funnel.pending).toBe(1);
    expect(report.funnel.acceptanceRate.value).toBe(0.5);
    // La période précédente est lue elle aussi, avec la même isolation.
    expect(report.funnel.proposed.previous).toBe(1);

    // Chiffre d'affaires : seule la ligne au prix connu d'un conseil de A, hors ajout manuel,
    // hors démo, hors conseil de B, hors ordonnance supprimée.
    expect(report.revenue.confirmedTtcCents.value).toBe(2490);
    expect(report.revenue.confirmedTtcCents.previous).toBe(1000);
    expect(report.revenue.confirmedSales.value).toBe(1);
    expect(report.revenue.averageBasketCents).toBe(2490);
    expect(report.revenue.unpricedLines).toBe(1);

    expect(report.quality).toMatchObject({ manualExcluded: 1, deletedPrescriptionAdvice: 1, unpricedConfirmedLines: 1, pendingAdvice: 1 });
    expect(report.empty).toBe(false);
  });

  it("ne laisse filtrer aucun produit, aucune clé ni aucun montant de B dans le rapport de A", async () => {
    seedTwoPharmacies();
    const report = await loadPerformanceReport({ pharmacyId: A, period: PERIOD, now: NOW });
    const text = JSON.stringify(report);
    expect(text).not.toContain("prod-b");
    expect(text).not.toContain("Produit B secret");
    expect(text).not.toContain("9900");
    expect(text).not.toContain("5000");
    expect(report.products.map((product) => product.key)).toContain("p:prod-a-2");
    expect(report.products.find((product) => product.key === "p:prod-a-2")?.revenueTtcCents).toBe(2490);
  });

  it("et inversement : le rapport de B ne contient rien de A", async () => {
    seedTwoPharmacies();
    const report = await loadPerformanceReport({ pharmacyId: B, period: PERIOD, now: NOW });
    expect(report.funnel.proposed.value).toBe(1);
    expect(report.funnel.accepted.value).toBe(1);
    expect(report.revenue.confirmedTtcCents.value).toBe(5000);
    expect(report.revenue.confirmedSales.value).toBe(1);
    const text = JSON.stringify(report);
    expect(text).not.toContain("prod-a");
    expect(text).not.toContain("Crème A");
    expect(report.products.map((product) => product.key)).toEqual(["p:prod-b-1"]);
  });

  it("chaque lecture porte l'officine demandée et exclut la démonstration", async () => {
    seedTwoPharmacies();
    await loadPerformanceReport({ pharmacyId: A, period: PERIOD, now: NOW });

    const operations = fakeDb.operations();
    // 3 lectures de conseils (période, précédente, rythme) + 2 lectures de ventes (période, précédente).
    expect(operations.filter((op) => op.model === "recommendation")).toHaveLength(3);
    expect(operations.filter((op) => op.model === "sale")).toHaveLength(2);

    for (const op of operations) {
      expect(op.args.where.pharmacyId, `${op.model}.${op.op}`).toBe(A);
      expect(op.args.where.isDemo, `${op.model}.${op.op}`).toBe(false);
      expect(new Set(valuesOfKey(op.args.where, "pharmacyId"))).toEqual(new Set([A]));
    }

    for (const op of operations.filter((o) => o.model === "sale")) {
      const lineWhere = { recommendationId: { not: null }, recommendation: { is: { pharmacyId: A, isDemo: false, prescription: { deletedAt: null } } } };
      // Le filtre est posé deux fois : sur les ventes (some) et sur les lignes rendues.
      expect(op.args.where.lines.some).toEqual(lineWhere);
      expect(op.args.select.lines.where).toEqual(lineWhere);
    }
  });

  it("une base qui ignorerait tous les filtres n'attribue ni la ligne d'une autre officine ni la ligne croisée", async () => {
    // Le pire cas : la base renvoie tout. Les gardes de fond du service tiennent seules.
    fakeDb.reset({
      recommendations: [
        adviceRow({ id: "rec-a1", status: "PURCHASED" }),
        adviceRow({ id: "rec-b1", pharmacyId: B, status: "PURCHASED", productId: "prod-b-1" }),
        adviceRow({ id: "rec-a7", status: "PURCHASED", prescription: { deletedAt: new Date("2026-10-05T08:00:00Z") } }),
      ],
      sales: [
        saleRow({ id: "s1", createdAt: hoursBefore(NOW, 20) }, [lineRow({ recommendationId: "rec-a1", unitPriceCents: 2490, totalCents: 2490 })]),
        saleRow({ id: "s2", createdAt: hoursBefore(NOW, 18) }, [lineRow({ recommendationId: "rec-b1", unitPriceCents: 9900, totalCents: 9900 })]),
        saleRow({ id: "s3", pharmacyId: B, createdAt: hoursBefore(NOW, 16) }, [lineRow({ recommendationId: "rec-b1", unitPriceCents: 5000, totalCents: 5000 })]),
        saleRow({ id: "s4", createdAt: hoursBefore(NOW, 14) }, [lineRow({ recommendationId: "rec-a7", unitPriceCents: 12_000, totalCents: 12_000 })]),
        saleRow({ id: "s5", createdAt: hoursBefore(NOW, 12) }, [lineRow({ recommendationId: null, unitPriceCents: 777, totalCents: 777 })]),
      ],
    });
    fakeDb.state.ignoreFilters = true;

    const report = await loadPerformanceReport({ pharmacyId: A, period: PERIOD, now: NOW });
    expect(report.revenue.confirmedTtcCents.value).toBe(2490);
    expect(report.revenue.confirmedSales.value).toBe(1);
  });

  it("un identifiant d'officine vide ou absent est une erreur : jamais une lecture de toutes les officines", async () => {
    seedTwoPharmacies();
    fakeDb.reset({ ...fakeDb.data }); // base garnie, compteurs remis à zéro
    for (const bad of ["", undefined, null] as unknown as string[]) {
      await expect(loadPerformanceReport({ pharmacyId: bad, period: PERIOD, now: NOW })).rejects.toThrow("aucune officine désignée");
      await expect(loadSubscriptionReturn({ pharmacyId: bad, now: NOW })).rejects.toThrow("aucune officine désignée");
      await expect(loadPerformanceForPlatform({ pharmacyId: bad, period: PERIOD, now: NOW })).rejects.toThrow("aucune officine désignée");
    }
    // Aucune requête n'est partie : l'erreur est levée avant toute lecture.
    expect(fakeDb.queryCount()).toBe(0);
  });
});

describe("la démonstration reste hors du réel", () => {
  it("exclut les conseils et les ventes de démonstration, et les compte dans l'environnement démo", async () => {
    seedTwoPharmacies();
    const real = await loadPerformanceReport({ pharmacyId: A, period: PERIOD, now: NOW });
    expect(real.funnel.proposed.value).toBe(5);
    expect(real.revenue.confirmedTtcCents.value).toBe(2490);

    // Même base, environnement démo : le conseil et la vente marqués démo entrent dans les chiffres.
    demo.on = true;
    const inDemo = await loadPerformanceReport({ pharmacyId: A, period: PERIOD, now: NOW });
    expect(inDemo.funnel.proposed.value).toBe(6);
    expect(inDemo.revenue.confirmedTtcCents.value).toBe(2490 + 7700);
  });
});

describe("ordonnance supprimée : le conseil et sa vente ne comptent plus nulle part", () => {
  it("ni proposé, ni accepté, ni acheté, ni chiffre d'affaires, ni ticket", async () => {
    fakeDb.reset({
      recommendations: [
        adviceRow({ id: "rec-a1", status: "PURCHASED", prescription: { deletedAt: new Date("2026-10-05T08:00:00Z") } }),
        adviceRow({ id: "rec-a2", status: "PURCHASED", prescription: { deletedAt: new Date("2026-10-05T08:00:00Z") } }),
      ],
      sales: [saleRow({ id: "s1", createdAt: hoursBefore(NOW, 12) }, [lineRow({ recommendationId: "rec-a1", unitPriceCents: 12_000, totalCents: 12_000 })])],
    });
    const report = await loadPerformanceReport({ pharmacyId: A, period: PERIOD, now: NOW });

    expect(report.funnel.proposed.value).toBe(0);
    expect(report.funnel.accepted.value).toBe(0);
    expect(report.funnel.purchased.value).toBe(0);
    expect(report.funnel.conversionRate.value).toBeNull();
    expect(report.revenue.confirmedTtcCents.value).toBe(0);
    expect(report.revenue.confirmedSales.value).toBe(0);
    expect(report.revenue.averageBasketCents).toBeNull();
    expect(report.quality.deletedPrescriptionAdvice).toBe(2);
    expect(report.empty).toBe(true);
  });

  it("l'ordonnance supprimée après la vente retire aussi la vente du retour sur abonnement, comme de l'entonnoir", async () => {
    const deleted = { deletedAt: new Date("2026-10-05T08:00:00Z") };
    const recommendations = [adviceRow({ id: "rec-keep", status: "PURCHASED" }), adviceRow({ id: "rec-gone", status: "PURCHASED", prescription: deleted })];
    const lines = (recommendationId: string) => [lineRow({ recommendationId, unitPriceCents: 12_000, totalCents: 12_000 })];
    fakeDb.reset({
      subscriptions: [subscriptionRow([A])],
      recommendations,
      sales: [
        ...[1, 2, 3, 4].map((n) => saleRow({ id: `keep-${n}`, createdAt: hoursBefore(NOW, 10 + n) }, lines("rec-keep"))),
        // Cette cinquième vente appartient à l'ordonnance supprimée : sans elle, 4 lignes seulement.
        saleRow({ id: "gone", createdAt: hoursBefore(NOW, 9) }, lines("rec-gone")),
      ],
    });
    const roi = await loadSubscriptionReturn({ pharmacyId: A, now: NOW });
    expect(roi).toMatchObject({ status: "hidden", reason: "not_enough_sales" });
  });
});

describe("bornes [début, fin[", () => {
  const period = literalPeriod("2026-10-01T00:00:00.000Z", "2026-10-03T00:00:00.000Z", "2026-09-29T00:00:00.000Z", "2026-10-01T00:00:00.000Z");
  const at = (iso: string, ms = 0) => new Date(new Date(iso).getTime() + ms);

  it("lit les conseils créés dans [début, fin[ : le début est compris, la fin ne l'est pas", async () => {
    fakeDb.reset({
      recommendations: [
        adviceRow({ id: "before-previous", createdAt: at("2026-09-29T00:00:00.000Z", -1) }),
        adviceRow({ id: "previous-start", createdAt: at("2026-09-29T00:00:00.000Z") }),
        adviceRow({ id: "previous-last", createdAt: at("2026-10-01T00:00:00.000Z", -1) }),
        adviceRow({ id: "start", createdAt: at("2026-10-01T00:00:00.000Z") }),
        adviceRow({ id: "last", createdAt: at("2026-10-03T00:00:00.000Z", -1) }),
        adviceRow({ id: "end", createdAt: at("2026-10-03T00:00:00.000Z") }),
      ],
    });
    const report = await loadPerformanceReport({ pharmacyId: A, period, now: NOW });
    expect(report.funnel.proposed.value).toBe(2);
    expect(report.funnel.proposed.previous).toBe(2);

    const bounds = fakeDb.operations().filter((op) => op.model === "recommendation").map((op) => op.args.where.createdAt);
    expect(bounds).toContainEqual({ gte: period.start, lt: period.end });
    expect(bounds).toContainEqual({ gte: period.previousStart, lt: period.previousEnd });
  });

  it("date une vente par sa propre date : le début est compris, la fin ne l'est pas", async () => {
    const sale = (id: string, createdAt: Date, cents: number) =>
      saleRow({ id, createdAt }, [lineRow({ recommendationId: "rec-a1", unitPriceCents: cents, totalCents: cents })]);
    fakeDb.reset({
      recommendations: [adviceRow({ id: "rec-a1", status: "PURCHASED", createdAt: at("2026-09-01T10:00:00.000Z") })],
      sales: [
        sale("before-previous", at("2026-09-29T00:00:00.000Z", -1), 1),
        sale("previous-start", at("2026-09-29T00:00:00.000Z"), 10),
        sale("previous-last", at("2026-10-01T00:00:00.000Z", -1), 100),
        sale("start", at("2026-10-01T00:00:00.000Z"), 1000),
        sale("last", at("2026-10-03T00:00:00.000Z", -1), 10_000),
        sale("end", at("2026-10-03T00:00:00.000Z"), 100_000),
      ],
    });
    const report = await loadPerformanceReport({ pharmacyId: A, period, now: NOW });
    expect(report.revenue.confirmedTtcCents.value).toBe(11_000);
    expect(report.revenue.confirmedTtcCents.previous).toBe(110);
    expect(report.revenue.confirmedSales.value).toBe(2);
  });

  it("le rythme lit les 90 derniers jours jusqu'à maintenant, quelle que soit la période choisie", async () => {
    await loadPerformanceReport({ pharmacyId: A, period, now: NOW });
    const rhythm = fakeDb
      .operations()
      .filter((op) => op.model === "recommendation")
      .map((op) => op.args.where)
      .find((where) => where.origin !== undefined);
    expect(rhythm.createdAt).toEqual({ gte: daysBefore(NOW, 90), lt: NOW });
    // Les ajouts manuels et les ordonnances supprimées n'entrent pas dans le rythme.
    expect(rhythm.origin).toEqual({ in: ["AI", "RULE"] });
    expect(rhythm.prescription).toEqual({ deletedAt: null });
  });

  it("le rythme ne compte que les vrais conseils de A des 90 derniers jours", async () => {
    seedTwoPharmacies();
    fakeDb.data.recommendations.push(adviceRow({ id: "rec-old", status: "ACCEPTED", createdAt: daysBefore(NOW, 100) }));
    const report = await loadPerformanceReport({ pharmacyId: A, period: PERIOD, now: NOW });
    const total = report.rhythm.cells.reduce((sum, cell) => sum + cell.proposed, 0);
    // a1..a5, le conseil d'il y a 20 jours et celui de la période précédente ;
    // pas l'ajout manuel, l'ordonnance supprimée, la démo, le conseil de B, ni celui d'il y a 100 jours.
    expect(total).toBe(7);
  });
});

describe("retour sur abonnement : le mois civil, l'abonnement de CETTE officine", () => {
  /** Cinq lignes à 120 € TTC (100 € HT à 20 %) le mois courant : 500 € HT de ventes confirmées. */
  function seedMonth(over: { subscription?: Record<string, unknown> | null; pharmacies?: string[] } = {}) {
    const sales = [1, 2, 3, 4, 5].map((n) =>
      saleRow({ id: `m${n}`, createdAt: new Date(`2026-10-0${n}T09:00:00Z`) }, [
        lineRow({ recommendationId: "rec-a1", unitPriceCents: 12_000, totalCents: 12_000, vatRate: 20 }),
      ]),
    );
    const subscription = over.subscription === null ? [] : [subscriptionRow(over.pharmacies ?? [A], over.subscription ?? {})];
    fakeDb.reset({ recommendations: [adviceRow({ id: "rec-a1", status: "PURCHASED" })], sales, subscriptions: subscription });
  }

  it("affiche le ratio : 500 € HT de ventes confirmées pour un abonnement de 125 € HT", async () => {
    seedMonth();
    const roi = await loadSubscriptionReturn({ pharmacyId: A, now: NOW });
    expect(roi).toMatchObject({
      status: "shown",
      monthLabel: "octobre 2026",
      monthlyPriceHtCents: 12_500,
      trialing: false,
      confirmedTtcCents: 60_000,
      confirmedHtCents: 50_000,
      confirmedLines: 5,
      ratioLabel: "4,0 fois",
    });
  });

  it("lit l'abonnement de l'organisation de A seulement, et seulement les statuts ACTIVE, TRIALING, PAST_DUE", async () => {
    seedMonth({ pharmacies: [B] });
    expect(await loadSubscriptionReturn({ pharmacyId: A, now: NOW })).toMatchObject({ status: "hidden", reason: "no_subscription" });
    expect(fakeDb.subscription.findFirst.mock.calls[0][0].where).toEqual({ organization: { pharmacies: { some: { id: A } } } });

    seedMonth({ subscription: { status: "CANCELED" } });
    expect(await loadSubscriptionReturn({ pharmacyId: A, now: NOW })).toMatchObject({ status: "hidden", reason: "no_subscription" });

    seedMonth({ subscription: { status: "TRIALING" } });
    const trial = await loadSubscriptionReturn({ pharmacyId: A, now: NOW });
    expect(trial).toMatchObject({ status: "shown", trialing: true });
    expect(trial.status === "shown" && trial.sentence).toContain("après essai");
  });

  it("ne lit que le mois civil (fuseau de l'officine), début compris et fin exclue", async () => {
    // Octobre 2026 à Paris : du 1er 00 h (heure d'été) au 1er novembre 00 h (heure d'hiver).
    const monthStart = new Date("2026-09-30T22:00:00.000Z");
    const monthEnd = new Date("2026-10-31T23:00:00.000Z");
    const sale = (id: string, createdAt: Date) => saleRow({ id, createdAt }, [lineRow({ recommendationId: "rec-a1", unitPriceCents: 12_000, totalCents: 12_000 })]);
    fakeDb.reset({
      recommendations: [adviceRow({ id: "rec-a1", status: "PURCHASED" })],
      subscriptions: [subscriptionRow([A])],
      sales: [
        sale("before", new Date(monthStart.getTime() - 1)),
        sale("first", monthStart),
        sale("two", new Date("2026-10-15T09:00:00Z")),
        sale("three", new Date("2026-10-20T09:00:00Z")),
        sale("four", new Date("2026-10-25T09:00:00Z")),
        sale("last", new Date(monthEnd.getTime() - 1)),
        sale("after", monthEnd),
      ],
    });
    const roi = await loadSubscriptionReturn({ pharmacyId: A, now: new Date("2026-10-31T20:00:00Z") });
    expect(roi.status === "shown" && roi.confirmedLines).toBe(5);
    const saleRead = fakeDb.operations().find((op) => op.model === "sale")!;
    expect(saleRead.args.where.createdAt).toEqual({ gte: monthStart, lt: monthEnd });
  });

  it("n'y fait entrer ni un ajout manuel, ni une vente d'une autre officine, ni la démonstration", async () => {
    seedMonth();
    fakeDb.data.recommendations.push(adviceRow({ id: "rec-man", origin: "MANUAL", status: "ACCEPTED" }), adviceRow({ id: "rec-b1", pharmacyId: B, status: "PURCHASED" }));
    fakeDb.data.sales.push(
      saleRow({ id: "x1", createdAt: new Date("2026-10-03T09:00:00Z") }, [lineRow({ recommendationId: "rec-man", unitPriceCents: 99_999, totalCents: 99_999 })]),
      saleRow({ id: "x2", pharmacyId: B, createdAt: new Date("2026-10-03T09:00:00Z") }, [lineRow({ recommendationId: "rec-b1", unitPriceCents: 99_999, totalCents: 99_999 })]),
      saleRow({ id: "x3", isDemo: true, createdAt: new Date("2026-10-03T09:00:00Z") }, [lineRow({ recommendationId: "rec-a1", unitPriceCents: 99_999, totalCents: 99_999 })]),
    );
    const roi = await loadSubscriptionReturn({ pharmacyId: A, now: NOW });
    expect(roi).toMatchObject({ status: "shown", confirmedTtcCents: 60_000, confirmedLines: 5 });
    for (const op of fakeDb.operations().filter((o) => o.model === "sale")) {
      expect(op.args.where.pharmacyId).toBe(A);
      expect(op.args.where.isDemo).toBe(false);
      expect(op.args.where.lines.some.recommendation.is.origin).toEqual({ in: ["AI", "RULE"] });
    }
  });
});

describe("retour sur abonnement : l'abonnement d'un GROUPE n'est jamais comparé au chiffre d'affaires d'une seule officine", () => {
  const GROUP_PRICE = 49_900; // 499 € HT par mois pour le groupe
  /** 5 lignes de 72 € TTC = 360 € TTC = 300 € HT de ventes confirmées pour l'officine. */
  const salesOf = (pharmacyId: string, recommendationId: string) =>
    [1, 2, 3, 4, 5].map((n) =>
      saleRow({ id: `${pharmacyId}-m${n}`, pharmacyId, createdAt: new Date(`2026-10-0${n}T09:00:00Z`) }, [
        lineRow({ recommendationId, unitPriceCents: 7200, totalCents: 7200, vatRate: 20 }),
      ]),
    );

  /** Deux officines `A` et `B` ; `members` = celles de l'organisation de l'abonnement. */
  function seedGroup(members: string[], pharmacies = [pharmacyRow(A), pharmacyRow(B)]) {
    fakeDb.reset({
      pharmacies,
      subscriptions: [subscriptionRow(members, { contractPriceCents: GROUP_PRICE })],
      recommendations: [adviceRow({ id: "rec-a1", status: "PURCHASED" }), adviceRow({ id: "rec-b1", pharmacyId: B, status: "PURCHASED" })],
      sales: [...salesOf(A, "rec-a1"), ...salesOf(B, "rec-b1")],
    });
  }

  it("deux officines réelles pour un abonnement de 499 € HT : chacune à 300 € HT reste MASQUÉE, au lieu d'afficher « 0,6 fois »", async () => {
    seedGroup([A, B]);
    const detail = "Cet abonnement couvre plusieurs officines : le chiffre d'affaires d'une seule ne se compare pas au prix du groupe.";
    expect(await loadSubscriptionReturn({ pharmacyId: A, now: NOW })).toEqual({ status: "hidden", reason: "shared_subscription", detail });
    expect(await loadSubscriptionReturn({ pharmacyId: B, now: NOW })).toEqual({ status: "hidden", reason: "shared_subscription", detail });
  });

  it("la même officine, seule à son abonnement (même chiffre d'affaires, même prix) : « 0,6 fois » s'affiche", async () => {
    seedGroup([A], [pharmacyRow(A)]);
    expect(await loadSubscriptionReturn({ pharmacyId: A, now: NOW })).toMatchObject({
      status: "shown",
      confirmedHtCents: 30_000,
      monthlyPriceHtCents: GROUP_PRICE,
      ratioLabel: "0,6 fois",
    });
  });

  it("un groupe où l'autre officine est de démonstration : le retour reste affiché ; dans l'environnement démo, l'officine de démonstration compte et le retour est masqué", async () => {
    seedGroup([A, "pharmacy-demo"], [pharmacyRow(A), pharmacyRow("pharmacy-demo", { isDemo: true })]);
    expect(await loadSubscriptionReturn({ pharmacyId: A, now: NOW })).toMatchObject({ status: "shown", ratioLabel: "0,6 fois" });

    demo.on = true;
    expect(await loadSubscriptionReturn({ pharmacyId: A, now: NOW })).toMatchObject({ status: "hidden", reason: "shared_subscription" });
  });

  it("un groupe dont l'autre officine est désactivée n'est pas un groupe : le retour reste affiché", async () => {
    seedGroup([A, B], [pharmacyRow(A), pharmacyRow(B, { isActive: false })]);
    expect(await loadSubscriptionReturn({ pharmacyId: A, now: NOW })).toMatchObject({ status: "shown", ratioLabel: "0,6 fois" });
  });

  it("trois officines : toujours partagé ; une officine active seule parmi deux désactivées : pas partagé", async () => {
    const three = [pharmacyRow(A), pharmacyRow(B), pharmacyRow("pharmacy-c")];
    seedGroup([A, B, "pharmacy-c"], three);
    expect(await loadSubscriptionReturn({ pharmacyId: A, now: NOW })).toMatchObject({ reason: "shared_subscription" });
    seedGroup(
      [A, B, "pharmacy-c"],
      [pharmacyRow(A), pharmacyRow(B, { isActive: false }), pharmacyRow("pharmacy-c", { isActive: false })],
    );
    expect(await loadSubscriptionReturn({ pharmacyId: A, now: NOW })).toMatchObject({ status: "shown" });
  });

  it("lit les officines actives de l'organisation dans la même requête que l'abonnement, hors démonstration", async () => {
    seedGroup([A, B]);
    await loadSubscriptionReturn({ pharmacyId: A, now: NOW });
    const query = fakeDb.subscription.findFirst.mock.calls[0][0];
    expect(query.select.organization).toEqual({
      select: { pharmacies: { where: { isActive: true, isDemo: false }, select: { id: true } } },
    });
    // Une seule requête d'abonnement : jamais une lecture par officine du groupe.
    expect(fakeDb.subscription.findFirst).toHaveBeenCalledTimes(1);

    demo.on = true;
    fakeDb.subscription.findFirst.mockClear();
    await loadSubscriptionReturn({ pharmacyId: A, now: NOW });
    expect(fakeDb.subscription.findFirst.mock.calls[0][0].select.organization.select.pharmacies.where).toEqual({ isActive: true });
  });

  it("la fiche de la console reçoit le même retour masqué pour un abonnement de groupe", async () => {
    seedGroup([A, B]);
    const result = await loadPerformanceForPlatform({ pharmacyId: A, period: PERIOD, now: NOW });
    expect(result?.roi).toMatchObject({ status: "hidden", reason: "shared_subscription" });
  });
});

describe("console : la fiche d'une officine", () => {
  it("rend null quand l'officine n'existe pas, sans lire aucun conseil ni aucune vente", async () => {
    seedTwoPharmacies();
    expect(await loadPerformanceForPlatform({ pharmacyId: "inconnue", period: PERIOD, now: NOW })).toBeNull();
    expect(fakeDb.operations().map((op) => op.model)).toEqual(["pharmacy"]);
  });

  it("rend l'officine, son rapport et son retour sur abonnement, ceux de cette officine seulement", async () => {
    seedTwoPharmacies();
    fakeDb.data.subscriptions.push(subscriptionRow([A]));
    const result = await loadPerformanceForPlatform({ pharmacyId: A, period: PERIOD, now: NOW });
    // La base simulée ne tient pas compte de `select` : on vérifie la sélection demandée à part.
    expect(result?.pharmacy).toMatchObject({ id: A, name: `Officine ${A}`, city: "Lyon", createdAt: new Date("2026-01-15T09:00:00Z"), isDemo: false });
    expect(fakeDb.pharmacy.findUnique.mock.calls[0][0]).toEqual({
      where: { id: A },
      select: { id: true, name: true, city: true, createdAt: true, isDemo: true },
    });
    expect(result?.report.revenue.confirmedTtcCents.value).toBe(2490);
    expect(result?.report.funnel.proposed.value).toBe(5);
    expect(result?.roi).toMatchObject({ status: "hidden", reason: "not_enough_sales" });
    expect(JSON.stringify(result)).not.toContain("prod-b");
  });

  it("une officine de démonstration, hors environnement démo : rapport filtré (vide) mais le drapeau isDemo est rendu pour que l'onglet le dise", async () => {
    const demoRows = [
      adviceRow({ id: "rec-d1", pharmacyId: "pharmacy-demo", status: "ACCEPTED", isDemo: true }),
      adviceRow({ id: "rec-d2", pharmacyId: "pharmacy-demo", status: "PURCHASED", isDemo: true }),
    ];
    fakeDb.reset({
      pharmacies: [pharmacyRow("pharmacy-demo", { isDemo: true })],
      recommendations: demoRows,
      sales: [saleRow({ id: "sd", pharmacyId: "pharmacy-demo", isDemo: true, createdAt: hoursBefore(NOW, 5) }, [lineRow({ recommendationId: "rec-d2", unitPriceCents: 4000, totalCents: 4000 })])],
    });

    const result = await loadPerformanceForPlatform({ pharmacyId: "pharmacy-demo", period: PERIOD, now: NOW });
    expect(result?.pharmacy.isDemo).toBe(true);
    expect(result?.report.empty).toBe(true);
    expect(result?.report.funnel.proposed.value).toBe(0);
    expect(result?.report.revenue.confirmedTtcCents.value).toBe(0);

    // Dans l'environnement démo, les mêmes lignes sont lues.
    demo.on = true;
    const inDemo = await loadPerformanceForPlatform({ pharmacyId: "pharmacy-demo", period: PERIOD, now: NOW });
    expect(inDemo?.report.funnel.proposed.value).toBe(2);
    expect(inDemo?.report.revenue.confirmedTtcCents.value).toBe(4000);
  });
});

// ---------------------------------------------------------------- Portefeuille

const P1 = "pharmacy-1";
const P2 = "pharmacy-2";
const P5 = "pharmacy-5";
const DEMO_PHARMACY = "pharmacy-demo";
const iso = (value: string) => new Date(value);
const priced = (recommendationId: string, cents: number) => lineRow({ recommendationId, unitPriceCents: cents, totalCents: cents });

/** Trois officines réelles (Alpha, Bravo, Charlie), une officine de démonstration, une officine désactivée. */
function seedPortfolio() {
  const deleted = { deletedAt: iso("2026-10-05T08:00:00Z") };
  const alpha = (id: string, status: string, createdAt: string, over: Record<string, unknown> = {}) =>
    adviceRow({ id, pharmacyId: P1, status, createdAt: iso(createdAt), ...over });
  const charlie = (id: string, status: string, createdAt: string) => adviceRow({ id, pharmacyId: P5, status, createdAt: iso(createdAt) });

  fakeDb.reset({
    pharmacies: [
      pharmacyRow(P1, { name: "Alpha" }, { status: "ACTIVE", contractPriceCents: 12_500 }),
      pharmacyRow(P2, { name: "Bravo" }),
      pharmacyRow(P5, { name: "Charlie" }),
      pharmacyRow(DEMO_PHARMACY, { name: "Démo", isDemo: true }),
      pharmacyRow("pharmacy-off", { name: "Désactivée", isActive: false }),
    ],
    recommendations: [
      // Alpha, ce mois-ci : 5 proposés, 4 acceptés (dont 2 « achetés » : un seul a une ligne de vente), 1 en attente.
      alpha("r1", "ACCEPTED", "2026-10-01T08:00:00Z"),
      alpha("r2", "ACCEPTED", "2026-10-02T08:00:00Z"),
      alpha("r3", "PURCHASED", "2026-10-03T08:00:00Z"),
      alpha("r4", "PROPOSED", hoursBefore(NOW, 1).toISOString()),
      alpha("r7", "PURCHASED", "2026-10-02T09:00:00Z"), // statut « acheté » mais aucune ligne de vente
      // Alpha, le mois dernier : vendu ce mois-ci.
      alpha("r5", "PURCHASED", "2026-09-10T08:00:00Z"),
      // Ce qui ne compte pas.
      alpha("r-manual", "ACCEPTED", "2026-10-03T08:00:00Z", { origin: "MANUAL" }),
      alpha("r-deleted", "ACCEPTED", "2026-10-03T08:00:00Z", { prescription: deleted }),
      alpha("r-demo", "ACCEPTED", "2026-10-03T08:00:00Z", { isDemo: true }),
      // Charlie : 10 conseils acceptés ce mois-ci, ventes de conseils du mois dernier.
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => charlie(`c${n}`, "ACCEPTED", `2026-10-0${Math.min(n, 5)}T10:00:00Z`)),
      charlie("c-old-1", "PURCHASED", "2026-09-12T10:00:00Z"),
      charlie("c-old-2", "PURCHASED", "2026-09-13T10:00:00Z"),
      // Bravo n'a rien ; une officine de démonstration et une désactivée ont des conseils.
      adviceRow({ id: "d1", pharmacyId: DEMO_PHARMACY, status: "ACCEPTED", isDemo: true }),
      adviceRow({ id: "o1", pharmacyId: "pharmacy-off", status: "ACCEPTED" }),
    ],
    sales: [
      saleRow({ id: "sA", pharmacyId: P1, createdAt: iso("2026-10-03T09:00:00Z") }, [priced("r5", 24_000)]),
      saleRow({ id: "sB", pharmacyId: P1, createdAt: iso("2026-10-04T09:00:00Z") }, [priced("r3", 1200)]),
      saleRow({ id: "sC", pharmacyId: P1, createdAt: iso("2026-10-05T09:00:00Z") }, [priced("r2", 0)]),
      // Mois précédent, dans la fenêtre de comparaison (du 1er septembre au 6 septembre, 12 h) ; puis hors des deux fenêtres.
      saleRow({ id: "sPrev", pharmacyId: P1, createdAt: iso("2026-09-03T09:00:00Z") }, [priced("r5", 10_000)]),
      saleRow({ id: "sLate", pharmacyId: P1, createdAt: iso("2026-09-20T09:00:00Z") }, [priced("r5", 5000)]),
      // Plus récentes que sC, mais qui ne comptent pas : ajout manuel, ordonnance supprimée, conseil d'une autre officine, démo.
      saleRow({ id: "sManual", pharmacyId: P1, createdAt: iso("2026-10-06T08:00:00Z") }, [priced("r-manual", 3000)]),
      saleRow({ id: "sDeleted", pharmacyId: P1, createdAt: iso("2026-10-06T07:00:00Z") }, [priced("r-deleted", 40_000)]),
      saleRow({ id: "sCross", pharmacyId: P1, createdAt: iso("2026-10-06T06:00:00Z") }, [priced("c1", 50_000)]),
      saleRow({ id: "sDemo", pharmacyId: P1, createdAt: iso("2026-10-06T05:00:00Z"), isDemo: true }, [priced("r3", 60_000)]),
      // Charlie : deux lignes sans prix de conseils du mois dernier.
      saleRow({ id: "cS1", pharmacyId: P5, createdAt: iso("2026-10-02T09:00:00Z") }, [priced("c-old-1", 0)]),
      saleRow({ id: "cS2", pharmacyId: P5, createdAt: iso("2026-10-04T09:00:00Z") }, [priced("c-old-2", 0)]),
    ],
    analysisRuns: [
      analysisRow({ pharmacyId: P1, startedAt: iso("2026-10-01T09:00:00Z") }),
      analysisRow({ pharmacyId: P1, startedAt: iso("2026-10-02T09:00:00Z") }),
      analysisRow({ pharmacyId: P1, startedAt: iso("2026-09-20T09:00:00Z"), status: "PARTIAL" }),
      analysisRow({ pharmacyId: P1, status: "FAILED" }),
      analysisRow({ pharmacyId: P1, startedAt: iso("2026-08-20T09:00:00Z") }),
      analysisRow({ pharmacyId: P1, isDemo: true }),
    ],
  });
}

describe("portefeuille : toutes les officines réelles, en requêtes groupées", () => {
  it("classe Alpha, Bravo et Charlie, sans la démonstration ni l'officine désactivée", async () => {
    seedPortfolio();
    const { rows, totals, generatedAt } = await loadPortfolioForPlatform({ now: NOW });

    expect(generatedAt).toEqual(NOW);
    expect(rows.map((row) => row.pharmacyId).sort()).toEqual([P1, P2, P5]);
    // « À voir en premier » : Bravo (jamais démarré), puis Alpha et Charlie (dans la bonne voie), par nom.
    expect(rows.map((row) => row.name)).toEqual(["Bravo", "Alpha", "Charlie"]);
    expect(rows.find((row) => row.pharmacyId === P2)).toMatchObject({ health: "no_data", reasons: ["Aucun conseil proposé pour l'instant"] });
    expect(totals).toEqual({ pharmacies: 3, withConfirmedSales: 2, confirmedTtcCents: 25_200, highValue: 0, needsSupport: 0 });
  });

  it("ne compte pour Alpha que ses propres conseils, ventes et analyses", async () => {
    seedPortfolio();
    const { rows } = await loadPortfolioForPlatform({ now: NOW });
    const alpha = rows.find((row) => row.pharmacyId === P1)!;

    // 5 conseils proposés ce mois-ci par PharmaBoost, 4 acceptés, 1 en attente : 4 tranchés.
    expect(alpha).toMatchObject({ proposed: 5, accepted: 4, decided: 4, acceptanceRate: 1, recentAnalyses: 3 });
    expect(alpha.lastProposalAt).toEqual(hoursBefore(NOW, 1));
    // Chiffre d'affaires du mois et du mois d'avant (jusqu'au même quantième) : lignes datées de la vente.
    expect(alpha.confirmedTtcCents).toBe(25_200);
    expect(alpha.previousConfirmedTtcCents).toBe(10_000);
    expect(alpha.deltaPct).toBeCloseTo(152, 5);
    expect(alpha.unpricedConfirmedLines).toBe(1);
    // La dernière vente : ni l'ajout manuel, ni l'ordonnance supprimée, ni le conseil d'une autre officine, ni la démo.
    expect(alpha.lastSaleAt).toEqual(iso("2026-10-05T09:00:00Z"));
    expect(alpha.subscription).toEqual({ status: "ACTIVE", monthlyPriceHtCents: 12_500, shared: false });
    expect(alpha.roi).toMatchObject({ status: "hidden", reason: "not_enough_sales" });
  });

  it("conseils achetés = conseils DISTINCTS vendus ce mois-ci (horloge de la vente), pas le statut ni la date de proposition", async () => {
    seedPortfolio();
    const { rows } = await loadPortfolioForPlatform({ now: NOW });
    const alpha = rows.find((row) => row.pharmacyId === P1)!;

    // r5 : créé en septembre, vendu en octobre, compte ; r3 et r2 : créés et vendus ce mois-ci.
    // r7 est « PURCHASED » sans ligne de vente : il ne compte pas.
    expect(alpha.purchased).toBe(3);
    // Le conseil de septembre n'est pas « proposé » ce mois-ci : proposés et ventes ne sont pas la même horloge.
    expect(alpha.proposed).toBe(5);
  });

  it("deux unités différentes : 2 lignes de vente sans prix sur le MÊME conseil = 1 conseil acheté et 2 lignes sans prix (« dont » n'est pas un sous-ensemble)", async () => {
    fakeDb.reset({
      pharmacies: [pharmacyRow(P1, { name: "Alpha" })],
      recommendations: [adviceRow({ id: "same", pharmacyId: P1, status: "PURCHASED", createdAt: iso("2026-10-02T10:00:00Z") })],
      sales: [
        saleRow({ id: "u1", pharmacyId: P1, createdAt: iso("2026-10-03T09:00:00Z") }, [priced("same", 0)]),
        saleRow({ id: "u2", pharmacyId: P1, createdAt: iso("2026-10-04T09:00:00Z") }, [priced("same", 0)]),
      ],
    });
    const { rows } = await loadPortfolioForPlatform({ now: NOW });
    expect(rows[0]).toMatchObject({ purchased: 1, unpricedConfirmedLines: 2, confirmedTtcCents: 0 });
  });

  it("un conseil créé le mois précédent et vendu sans prix ce mois-ci : une vente confirmée, hors chiffre d'affaires", async () => {
    fakeDb.reset({
      pharmacies: [pharmacyRow(P1, { name: "Alpha" })],
      recommendations: [adviceRow({ id: "old", pharmacyId: P1, status: "PURCHASED", createdAt: iso("2026-09-30T21:50:00Z") })],
      sales: [saleRow({ id: "s", pharmacyId: P1, createdAt: iso("2026-10-01T00:10:00+02:00") }, [priced("old", 0)])],
    });
    const { rows } = await loadPortfolioForPlatform({ now: NOW });
    expect(rows[0]).toMatchObject({ proposed: 0, purchased: 1, unpricedConfirmedLines: 1, confirmedTtcCents: 0 });
  });

  it("deux ventes du même conseil ce mois-ci : un seul conseil acheté (distincts), deux lignes", async () => {
    fakeDb.reset({
      pharmacies: [pharmacyRow(P1, { name: "Alpha" })],
      recommendations: [adviceRow({ id: "twice", pharmacyId: P1, status: "PURCHASED", createdAt: iso("2026-10-02T10:00:00Z") })],
      sales: [
        saleRow({ id: "t1", pharmacyId: P1, createdAt: iso("2026-10-03T09:00:00Z") }, [priced("twice", 1000)]),
        saleRow({ id: "t2", pharmacyId: P1, createdAt: iso("2026-10-04T09:00:00Z") }, [priced("twice", 1000)]),
      ],
    });
    const { rows } = await loadPortfolioForPlatform({ now: NOW });
    expect(rows[0]).toMatchObject({ proposed: 1, purchased: 1, confirmedTtcCents: 2000 });
  });

  it("Charlie : 10 conseils acceptés et des ventes de conseils du mois dernier ne déclenchent pas « ventes pas enregistrées »", async () => {
    seedPortfolio();
    const { rows } = await loadPortfolioForPlatform({ now: NOW });
    const charlie = rows.find((row) => row.pharmacyId === P5)!;
    expect(charlie).toMatchObject({ proposed: 10, accepted: 10, purchased: 2, unpricedConfirmedLines: 2 });
    expect(charlie.health).not.toBe("needs_support");
    expect(charlie.reasons.join(" ")).not.toMatch(/ventes pas enregistrées/i);
  });

  it("le 1er du mois, les conseils en attente d'hier soir ne sont pas retranchés des conseils du mois", async () => {
    // 1er octobre, 8 h à Paris : « il y a moins de 24 h » remonte avant le début du mois.
    const firstDay = new Date("2026-10-01T06:00:00Z");
    fakeDb.reset({
      pharmacies: [pharmacyRow(P1, { name: "Alpha" })],
      recommendations: [
        adviceRow({ id: "yesterday", pharmacyId: P1, status: "PROPOSED", createdAt: iso("2026-09-30T20:00:00Z") }),
        adviceRow({ id: "this-morning", pharmacyId: P1, status: "PROPOSED", createdAt: iso("2026-10-01T04:00:00Z") }),
      ],
    });
    const { rows } = await loadPortfolioForPlatform({ now: firstDay });
    // Un seul conseil dans le mois, et il est en attente : aucun conseil tranché, jamais un nombre négatif.
    expect(rows[0]).toMatchObject({ proposed: 1, decided: 0, acceptanceRate: null });
  });

  it("chaque lecture est groupée sur les officines réelles et exclut la démonstration", async () => {
    seedPortfolio();
    await loadPortfolioForPlatform({ now: NOW });
    const operations = fakeDb.operations();

    const pharmacies = operations.find((op) => op.model === "pharmacy")!;
    expect(pharmacies.args.where).toEqual({ isActive: true, isDemo: false });

    // Alpha, Bravo, Charlie : la démonstration et l'officine désactivée n'y sont pas.
    const ids = [P1, P2, P5];
    for (const op of operations.filter((o) => o.model !== "pharmacy")) {
      const label = `${op.model}.${op.op}`;
      expect(op.args.where.pharmacyId, label).toEqual({ in: ids });
      // Plus bas dans le `where`, l'officine est soit la liste entière, soit une des officines lues.
      for (const value of valuesOfKey(op.args.where, "pharmacyId")) {
        if (typeof value === "string") expect(ids, label).toContain(value);
        else expect(value, label).toEqual({ in: ids });
      }
      const demoFlags = valuesOfKey(op.args.where, "isDemo");
      expect(demoFlags.length, label).toBeGreaterThan(0);
      for (const flag of demoFlags) expect(flag, label).toBe(false);
    }
    for (const op of operations.filter((o) => o.model === "recommendation")) {
      expect(op.args.where.origin).toEqual({ in: ["AI", "RULE"] });
      expect(op.args.where.prescription).toEqual({ deletedAt: null });
    }
  });

  it("la dernière vente de chaque officine ne vient que d'un conseil de la MÊME officine", async () => {
    seedPortfolio();
    await loadPortfolioForPlatform({ now: NOW });
    const lastSales = fakeDb.operations().find((op) => op.model === "sale" && op.op === "groupBy")!;
    const branches = lastSales.args.where.OR as { pharmacyId: string; lines: { some: any } }[];
    expect(branches.map((branch) => branch.pharmacyId).sort()).toEqual([P1, P2, P5]);
    for (const branch of branches) {
      // L'officine de la vente et celle du conseil sont la même, hors démonstration, hors ordonnance supprimée.
      expect(branch.lines.some.recommendation.is).toEqual({
        pharmacyId: branch.pharmacyId,
        isDemo: false,
        prescription: { deletedAt: null },
        origin: { in: ["AI", "RULE"] },
      });
    }
  });

  it("le nombre de requêtes ne dépend pas du nombre d'officines", async () => {
    const manyPharmacies = (count: number) => {
      const pharmacies = Array.from({ length: count }, (_, n) => pharmacyRow(`ph-${n}`, { name: `Officine ${String(n).padStart(2, "0")}` }, { status: "ACTIVE", contractPriceCents: 12_500 }));
      fakeDb.reset({
        pharmacies,
        recommendations: pharmacies.map((p, n) => adviceRow({ id: `adv-${n}`, pharmacyId: p.id, status: "PURCHASED", createdAt: iso("2026-10-02T10:00:00Z") })),
        sales: pharmacies.map((p, n) => saleRow({ id: `sale-${n}`, pharmacyId: p.id, createdAt: iso("2026-10-03T10:00:00Z") }, [priced(`adv-${n}`, 1000)])),
        analysisRuns: pharmacies.map((p) => analysisRow({ pharmacyId: p.id })),
      });
    };

    manyPharmacies(2);
    const two = await loadPortfolioForPlatform({ now: NOW });
    const queriesForTwo = fakeDb.queryCount();
    manyPharmacies(25);
    const many = await loadPortfolioForPlatform({ now: NOW });
    const queriesForMany = fakeDb.queryCount();

    expect(two.rows).toHaveLength(2);
    expect(many.rows).toHaveLength(25);
    expect(queriesForMany).toBe(queriesForTwo);
    // 1 liste des officines + 3 groupements de conseils + 1 de ventes + 1 d'analyses + 1 lecture des lignes de vente.
    expect(queriesForTwo).toBe(7);
    // Aucune lecture par officine : chaque officine n'a reçu que ses propres chiffres.
    expect(many.rows.every((row) => row.proposed === 1 && row.purchased === 1 && row.confirmedTtcCents === 1000)).toBe(true);
  });

  it("l'environnement démo inclut l'officine de démonstration, jamais l'officine désactivée", async () => {
    seedPortfolio();
    demo.on = true;
    const { rows } = await loadPortfolioForPlatform({ now: NOW });
    expect(rows.map((row) => row.pharmacyId).sort()).toEqual([P1, P2, P5, DEMO_PHARMACY].sort());
    expect(fakeDb.operations().find((op) => op.model === "pharmacy")!.args.where).toEqual({ isActive: true });
  });

  it("sans officine : des totaux à zéro et une seule requête", async () => {
    const result = await loadPortfolioForPlatform({ now: NOW });
    expect(result.rows).toEqual([]);
    expect(result.totals).toEqual({ pharmacies: 0, withConfirmedSales: 0, confirmedTtcCents: 0, highValue: 0, needsSupport: 0 });
    expect(fakeDb.queryCount()).toBe(1);
  });
});

describe("portefeuille : un conseil est « en attente » s'il a STRICTEMENT moins de 24 h (comme dans le rapport de l'officine)", () => {
  const MONTH = resolvePerformancePeriod({ key: "month", now: NOW, timeZone: ZONE });
  const proposedAt = (id: string, createdAt: Date, over: Record<string, unknown> = {}) =>
    adviceRow({ id, pharmacyId: P1, status: "PROPOSED", createdAt, ...over });

  function seedAges() {
    fakeDb.reset({
      pharmacies: [pharmacyRow(P1, { name: "Alpha" })],
      recommendations: [
        proposedAt("exact", hoursBefore(NOW, 24)), // 24 h pile : déjà « sans réponse »
        proposedAt("just-under", new Date(hoursBefore(NOW, 24).getTime() + 60_000)), // 23 h 59 : en attente
        proposedAt("just-over", new Date(hoursBefore(NOW, 24).getTime() - 60_000)), // 24 h 01 : sans réponse
        proposedAt("fresh", hoursBefore(NOW, 1)), // en attente
        proposedAt("half-day", hoursBefore(NOW, 12)), // en attente (une fenêtre de 12 h ne l'aurait pas vu... ni celui de 23 h 59)
      ],
    });
  }

  it("à 24 h pile le conseil n'est PAS en attente : 5 proposés, 3 en attente (1 h, 12 h, 23 h 59), donc 2 tranchés", async () => {
    seedAges();
    const { rows } = await loadPortfolioForPlatform({ now: NOW });
    expect(rows[0]).toMatchObject({ proposed: 5, decided: 2, accepted: 0, acceptanceRate: 0 });
  });

  it("le rapport de la même officine compte exactement les mêmes conseils en attente : le même nombre de conseils tranchés", async () => {
    seedAges();
    const { rows } = await loadPortfolioForPlatform({ now: NOW });
    const report = await loadPerformanceReport({ pharmacyId: P1, period: MONTH, now: NOW });
    expect(report.funnel.pending).toBe(3);
    expect(report.funnel.proposed.value - report.funnel.pending).toBe(rows[0].decided);
    expect(report.funnel.unanswered).toBe(2);
  });

  it("la lecture des conseils en attente : créés après `maintenant − 24 h` (strict) et dans le mois (inclus)", async () => {
    seedAges();
    await loadPortfolioForPlatform({ now: NOW });
    const pendingRead = fakeDb
      .operations()
      .find((op) => op.model === "recommendation" && op.op === "groupBy" && op.args.where.status === "PROPOSED")!;
    expect(pendingRead.args.where.createdAt).toEqual({ gte: MONTH.start, gt: hoursBefore(NOW, 24), lt: MONTH.end });
  });

  it("le 1er du mois à 8 h : la fenêtre d'attente remonte avant le mois, seul le début du mois (inclus) borne la lecture", async () => {
    const firstDay = new Date("2026-10-01T06:00:00Z");
    fakeDb.reset({
      pharmacies: [pharmacyRow(P1, { name: "Alpha" })],
      recommendations: [
        proposedAt("last-night", iso("2026-09-30T20:00:00Z")), // veille au soir : hors du mois
        proposedAt("midnight-sharp", iso("2026-09-30T22:00:00Z")), // minuit pile à Paris : dans le mois, en attente
        proposedAt("this-morning", iso("2026-10-01T04:00:00Z")), // dans le mois, en attente
      ],
    });
    const { rows } = await loadPortfolioForPlatform({ now: firstDay });
    expect(rows[0]).toMatchObject({ proposed: 2, decided: 0 });
  });
});

describe("portefeuille : la variation du chiffre d'affaires compare au mois dernier jusqu'à la même date et la même heure (bornes exactes)", () => {
  // Avec `ignoreFilters`, la base renvoie toutes les ventes : les gardes de fond du service tiennent seules.
  it.each([false, true])("la fenêtre de comparaison est [1er septembre 0 h, 6 septembre 12 h[ à Paris : début compris, fin exclue (base qui ignore ses filtres : %s)", async (ignoreFilters) => {
    const MONTH = resolvePerformancePeriod({ key: "month", now: NOW, timeZone: ZONE });
    const at = (date: Date, ms = 0) => new Date(date.getTime() + ms);
    const sale = (id: string, createdAt: Date, cents: number) => saleRow({ id, pharmacyId: P1, createdAt }, [priced("rec", cents)]);
    fakeDb.reset({
      pharmacies: [pharmacyRow(P1, { name: "Alpha" })],
      recommendations: [adviceRow({ id: "rec", pharmacyId: P1, status: "PURCHASED", createdAt: iso("2026-08-01T10:00:00Z") })],
      sales: [
        sale("before", at(MONTH.previousStart, -1), 1),
        sale("first", MONTH.previousStart, 10),
        sale("last", at(MONTH.previousEnd, -1), 100),
        sale("end", MONTH.previousEnd, 1000), // pile à la borne : dans le trou entre les deux fenêtres, compté nulle part
        sale("later", iso("2026-09-20T09:00:00Z"), 10_000),
        sale("current", iso("2026-10-03T09:00:00Z"), 100_000),
      ],
    });
    fakeDb.state.ignoreFilters = ignoreFilters;
    const { rows } = await loadPortfolioForPlatform({ now: NOW });
    expect(MONTH.previousEnd.toISOString()).toBe("2026-09-06T10:00:00.000Z");
    expect(rows[0]).toMatchObject({ confirmedTtcCents: 100_000, previousConfirmedTtcCents: 110 });
    // (100 000 − 110) ÷ 110 = 90 809,09… %, arrondi au dixième.
    expect(rows[0].deltaPct).toBe(90_809.1);
  });
});

describe("portefeuille : un abonnement partagé entre plusieurs officines n'est comparé à aucune d'elles", () => {
  const GROUP = { status: "ACTIVE", contractPriceCents: 49_900 };
  const G1 = "group-1";
  const G2 = "group-2";
  /** Cinq lignes à 72 € TTC dans le mois : 300 € HT, soit « 0,6 fois » un abonnement de 499 € HT. */
  const fiveSales = (pharmacyId: string, recommendationId: string) =>
    [1, 2, 3, 4, 5].map((n) => saleRow({ id: `${pharmacyId}-s${n}`, pharmacyId, createdAt: iso(`2026-10-0${n}T09:00:00Z`) }, [priced(recommendationId, 7200)]));

  function seedGroup(sameOrganization: boolean, extra: Record<string, unknown>[] = []) {
    fakeDb.reset({
      pharmacies: [
        pharmacyRow(G1, { name: "Groupe Nord", organizationId: "org-group" }, GROUP),
        pharmacyRow(G2, { name: "Groupe Sud", organizationId: sameOrganization ? "org-group" : "org-other" }, GROUP),
        ...extra,
      ],
      recommendations: [
        adviceRow({ id: "g1", pharmacyId: G1, status: "PURCHASED", createdAt: iso("2026-10-01T08:00:00Z") }),
        adviceRow({ id: "g2", pharmacyId: G2, status: "PURCHASED", createdAt: iso("2026-10-01T08:00:00Z") }),
      ],
      sales: [...fiveSales(G1, "g1"), ...fiveSales(G2, "g2")],
    });
  }

  it("deux officines d'une même organisation : abonnement marqué partagé, retour masqué, ni « à accompagner » ni « forte valeur »", async () => {
    seedGroup(true);
    const { rows, totals } = await loadPortfolioForPlatform({ now: NOW });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.subscription).toEqual({ status: "ACTIVE", monthlyPriceHtCents: 49_900, shared: true });
      expect(row.roi).toMatchObject({ status: "hidden", reason: "shared_subscription" });
      expect(row.confirmedTtcCents).toBe(36_000);
      // Avant : « La valeur mesurée reste sous le prix de l'abonnement (0,6 fois) », donc « à accompagner » à tort.
      expect(row.health).toBe("on_track");
      expect(row.reasons).toEqual(["Aucun signal d'alerte ce mois-ci"]);
    }
    expect(totals).toMatchObject({ needsSupport: 0, highValue: 0 });
  });

  it("les mêmes deux officines dans deux organisations distinctes (chacune son abonnement) : « 0,6 fois » et à accompagner, comme avant", async () => {
    seedGroup(false);
    const { rows } = await loadPortfolioForPlatform({ now: NOW });
    for (const row of rows) {
      expect(row.subscription).toEqual({ status: "ACTIVE", monthlyPriceHtCents: 49_900, shared: false });
      expect(row.roi).toMatchObject({ status: "shown", ratioLabel: "0,6 fois" });
      expect(row.health).toBe("needs_support");
      expect(row.reasons).toEqual(["La valeur mesurée reste sous le prix de l'abonnement (0,6 fois)"]);
    }
  });

  it("jamais « forte valeur » sur le seul chiffre d'affaires d'une officine d'un groupe, même très gros et à 10 conseils achetés", async () => {
    seedGroup(true);
    // 12 conseils achetés ce mois-ci par Groupe Nord, 12 × 400 € TTC = 4 800 € TTC, soit 9,6 fois 499 € HT… du groupe.
    const recommendations = Array.from({ length: 12 }, (_, n) => adviceRow({ id: `big-${n}`, pharmacyId: G1, status: "PURCHASED", createdAt: iso("2026-10-01T08:00:00Z") }));
    fakeDb.data.recommendations.push(...recommendations);
    fakeDb.data.sales.push(...recommendations.map((r, n) => saleRow({ id: `big-s${n}`, pharmacyId: G1, createdAt: iso("2026-10-04T09:00:00Z") }, [priced(r.id, 40_000)])));
    const { rows } = await loadPortfolioForPlatform({ now: NOW });
    const north = rows.find((row) => row.pharmacyId === G1)!;
    expect(north.purchased).toBe(13);
    expect(north.confirmedTtcCents).toBe(36_000 + 480_000);
    expect(north.health).not.toBe("high_value");
    expect(north.health).toBe("on_track");
  });

  it("une officine réelle + une officine de démonstration de la même organisation : pas partagé (la démonstration n'est pas dans la liste) ; dans l'environnement démo, partagé", async () => {
    fakeDb.reset({
      pharmacies: [
        pharmacyRow(G1, { name: "Groupe Nord", organizationId: "org-group" }, GROUP),
        pharmacyRow("group-demo", { name: "Groupe Démo", organizationId: "org-group", isDemo: true }, GROUP),
      ],
      recommendations: [adviceRow({ id: "g1", pharmacyId: G1, status: "PURCHASED", createdAt: iso("2026-10-01T08:00:00Z") })],
      sales: fiveSales(G1, "g1"),
    });
    const real = await loadPortfolioForPlatform({ now: NOW });
    expect(real.rows.map((row) => row.pharmacyId)).toEqual([G1]);
    expect(real.rows[0].subscription).toMatchObject({ shared: false });
    expect(real.rows[0].roi).toMatchObject({ status: "shown", ratioLabel: "0,6 fois" });

    demo.on = true;
    const inDemo = await loadPortfolioForPlatform({ now: NOW });
    expect(inDemo.rows).toHaveLength(2);
    for (const row of inDemo.rows) expect(row.roi).toMatchObject({ status: "hidden", reason: "shared_subscription" });
  });

  it("dans une même liste, chaque officine a SON compte d'officines : une officine seule n'est pas partagée, les deux autres du même groupe le sont", async () => {
    fakeDb.reset({
      pharmacies: [
        pharmacyRow("alone", { name: "Aaa seule" }, GROUP),
        pharmacyRow(G1, { name: "Groupe Nord", organizationId: "org-group" }, { status: "ACTIVE", contractPriceCents: 12_500 }),
        pharmacyRow(G2, { name: "Groupe Sud", organizationId: "org-group" }, { status: "ACTIVE", contractPriceCents: 12_500 }),
      ],
    });
    const { rows } = await loadPortfolioForPlatform({ now: NOW });
    expect(rows.map((row) => [row.name, row.subscription?.shared])).toEqual([
      ["Aaa seule", false],
      ["Groupe Nord", true],
      ["Groupe Sud", true],
    ]);
    // L'ordre inverse : le groupe en tête de liste, l'officine seule à la fin.
    fakeDb.reset({
      pharmacies: [
        pharmacyRow(G1, { name: "Aaa groupe 1", organizationId: "org-group" }, GROUP),
        pharmacyRow(G2, { name: "Aab groupe 2", organizationId: "org-group" }, GROUP),
        pharmacyRow("alone", { name: "Zzz seule" }, GROUP),
      ],
    });
    const reversed = await loadPortfolioForPlatform({ now: NOW });
    expect(reversed.rows.map((row) => [row.name, row.subscription?.shared])).toEqual([
      ["Aaa groupe 1", true],
      ["Aab groupe 2", true],
      ["Zzz seule", false],
    ]);
  });

  it("une officine désactivée de l'organisation ne fait pas un groupe", async () => {
    fakeDb.reset({
      pharmacies: [
        pharmacyRow(G1, { name: "Groupe Nord", organizationId: "org-group" }, GROUP),
        pharmacyRow(G2, { name: "Groupe Sud", organizationId: "org-group", isActive: false }, GROUP),
      ],
      recommendations: [adviceRow({ id: "g1", pharmacyId: G1, status: "PURCHASED", createdAt: iso("2026-10-01T08:00:00Z") })],
      sales: fiveSales(G1, "g1"),
    });
    const { rows } = await loadPortfolioForPlatform({ now: NOW });
    expect(rows).toHaveLength(1);
    expect(rows[0].roi).toMatchObject({ status: "shown", ratioLabel: "0,6 fois" });
  });

  it("le nombre d'officines actives de l'organisation est lu dans la requête des officines, hors démonstration (aucune requête de plus)", async () => {
    seedGroup(true);
    await loadPortfolioForPlatform({ now: NOW });
    const read = fakeDb.pharmacy.findMany.mock.calls[0][0];
    expect(read.select.organization.select.pharmacies).toEqual({ where: { isActive: true, isDemo: false }, select: { id: true } });
    expect(read.select.organization.select.subscription).toEqual({ select: { status: true, contractPriceCents: true } });
    // 1 liste des officines + 3 groupements de conseils + 1 de ventes + 1 d'analyses + 1 lecture des lignes de vente.
    expect(fakeDb.queryCount()).toBe(7);
  });
});

describe("portefeuille : aucune ligne ne reprend un chiffre d'une autre officine", () => {
  const rec = (id: string, pharmacyId: string, status: string, createdAt: string) => adviceRow({ id, pharmacyId, status, createdAt: iso(createdAt) });

  /** Trois officines aux valeurs toutes différentes : tout mélange entre lignes se verrait. */
  function seedDistinct() {
    fakeDb.reset({
      pharmacies: [
        pharmacyRow(P1, { name: "Alpha", city: "Lille", createdAt: iso("2026-02-01T09:00:00Z") }, { status: "ACTIVE", contractPriceCents: 12_500 }),
        pharmacyRow(P2, { name: "Bravo", city: "Brest", createdAt: iso("2026-03-10T09:00:00Z") }),
        pharmacyRow(P5, { name: "Charlie", city: "Nice", createdAt: iso("2026-04-20T09:00:00Z") }, { status: "TRIALING", contractPriceCents: 20_000 }),
      ],
      recommendations: [
        // Alpha : 3 proposés, 2 acceptés (dont 1 acheté), 1 retiré, aucun en attente.
        rec("a1", P1, "ACCEPTED", "2026-10-01T08:00:00Z"),
        rec("a2", P1, "PURCHASED", "2026-10-02T08:00:00Z"),
        rec("a3", P1, "REMOVED", "2026-10-03T08:00:00Z"),
        // Bravo : 2 proposés (un jamais tranché), 1 accepté.
        rec("b1", P2, "PROPOSED", "2026-10-02T07:00:00Z"),
        rec("b2", P2, "ACCEPTED", "2026-10-05T07:00:00Z"),
        // Charlie : 4 proposés, 3 acceptés, 1 en attente (créé il y a 2 h).
        rec("c1", P5, "ACCEPTED", "2026-10-01T10:00:00Z"),
        rec("c2", P5, "ACCEPTED", "2026-10-02T10:00:00Z"),
        rec("c3", P5, "ACCEPTED", "2026-10-03T10:00:00Z"),
        rec("c4", P5, "PROPOSED", "2026-10-06T08:00:00Z"),
      ],
      sales: [
        saleRow({ id: "sA1", pharmacyId: P1, createdAt: iso("2026-10-04T09:00:00Z") }, [priced("a2", 6000)]),
        saleRow({ id: "sA2", pharmacyId: P1, createdAt: iso("2026-10-05T09:00:00Z") }, [priced("a1", 0)]),
        saleRow({ id: "sAp", pharmacyId: P1, createdAt: iso("2026-09-03T09:00:00Z") }, [priced("a1", 1000)]),
        saleRow({ id: "sB1", pharmacyId: P2, createdAt: iso("2026-10-02T11:00:00Z") }, [priced("b2", 2500)]),
        // Une vente de Bravo qui pointe vers le conseil de Charlie : attribuée à personne, plus récente que tout chez Bravo.
        saleRow({ id: "sBx", pharmacyId: P2, createdAt: iso("2026-10-06T09:00:00Z") }, [priced("c3", 77_700)]),
        saleRow({ id: "sC1", pharmacyId: P5, createdAt: iso("2026-10-06T08:30:00Z") }, [priced("c1", 9000), priced("c2", 0)]),
        saleRow({ id: "sCp", pharmacyId: P5, createdAt: iso("2026-09-05T09:00:00Z") }, [priced("c3", 2500)]),
      ],
      analysisRuns: [
        analysisRow({ pharmacyId: P1, startedAt: iso("2026-10-01T09:00:00Z") }),
        analysisRow({ pharmacyId: P1, startedAt: iso("2026-10-02T09:00:00Z") }),
        ...[20, 25, 28, 30, 2].map((day) => analysisRow({ pharmacyId: P5, startedAt: iso(day > 10 ? `2026-09-${day}T09:00:00Z` : `2026-10-0${day}T09:00:00Z`) })),
      ],
    });
  }

  it("chaque ligne porte ses propres chiffres, champ par champ", async () => {
    seedDistinct();
    const { rows, totals } = await loadPortfolioForPlatform({ now: NOW });
    expect(rows.map((row) => row.name)).toEqual(["Alpha", "Bravo", "Charlie"]);

    const byName = Object.fromEntries(rows.map((row) => [row.name, row]));
    expect(byName.Alpha).toMatchObject({
      pharmacyId: P1,
      city: "Lille",
      createdAt: iso("2026-02-01T09:00:00Z"),
      subscription: { status: "ACTIVE", monthlyPriceHtCents: 12_500, shared: false },
      proposed: 3,
      accepted: 2,
      decided: 3,
      acceptanceRate: 2 / 3,
      purchased: 2,
      confirmedTtcCents: 6000,
      previousConfirmedTtcCents: 1000,
      unpricedConfirmedLines: 1,
      recentAnalyses: 2,
      lastProposalAt: iso("2026-10-03T08:00:00Z"),
      lastSaleAt: iso("2026-10-05T09:00:00Z"),
    });
    expect(byName.Bravo).toMatchObject({
      pharmacyId: P2,
      city: "Brest",
      createdAt: iso("2026-03-10T09:00:00Z"),
      subscription: null,
      proposed: 2,
      accepted: 1,
      decided: 2,
      acceptanceRate: 0.5,
      purchased: 1,
      confirmedTtcCents: 2500,
      previousConfirmedTtcCents: 0,
      unpricedConfirmedLines: 0,
      recentAnalyses: 0,
      lastProposalAt: iso("2026-10-05T07:00:00Z"),
      lastSaleAt: iso("2026-10-02T11:00:00Z"),
    });
    expect(byName.Charlie).toMatchObject({
      pharmacyId: P5,
      city: "Nice",
      createdAt: iso("2026-04-20T09:00:00Z"),
      subscription: { status: "TRIALING", monthlyPriceHtCents: 20_000, shared: false },
      proposed: 4,
      accepted: 3,
      decided: 3,
      acceptanceRate: 1,
      purchased: 2,
      confirmedTtcCents: 9000,
      previousConfirmedTtcCents: 2500,
      unpricedConfirmedLines: 1,
      recentAnalyses: 5,
      lastProposalAt: iso("2026-10-06T08:00:00Z"),
      lastSaleAt: iso("2026-10-06T08:30:00Z"),
    });
    expect(totals).toEqual({ pharmacies: 3, withConfirmedSales: 3, confirmedTtcCents: 17_500, highValue: 0, needsSupport: 0 });
  });

  it("aucune valeur de dernier conseil, de dernière vente ni de création n'est partagée entre deux lignes", async () => {
    seedDistinct();
    const { rows } = await loadPortfolioForPlatform({ now: NOW });
    for (const field of ["lastProposalAt", "lastSaleAt", "createdAt"] as const) {
      const values = rows.map((row) => row[field]?.getTime());
      expect(new Set(values).size, field).toBe(rows.length);
    }
    // La vente de Bravo rattachée au conseil de Charlie (77 700 c) n'apparaît chez personne.
    expect(JSON.stringify(rows)).not.toContain("77700");
    expect(rows.reduce((sum, row) => sum + row.confirmedTtcCents, 0)).toBe(17_500);
  });

  it("une base qui ignorerait tous ses filtres ne ferait pas passer les chiffres d'une officine dans la ligne d'une autre", async () => {
    seedDistinct();
    const normal = await loadPortfolioForPlatform({ now: NOW });
    seedDistinct();
    fakeDb.state.ignoreFilters = true;
    const { rows } = await loadPortfolioForPlatform({ now: NOW });
    // Les gardes de fond du service gardent chaque conseil vendu à son officine : le chiffre d'affaires ne se mélange pas.
    for (const row of rows) {
      const expected = normal.rows.find((candidate) => candidate.pharmacyId === row.pharmacyId)!;
      expect(row.confirmedTtcCents, row.name).toBe(expected.confirmedTtcCents);
      expect(row.unpricedConfirmedLines, row.name).toBe(expected.unpricedConfirmedLines);
    }
  });
});

// ---------------------------------------------------------------- Confidentialité

/** Les clés qui désigneraient un patient, un collaborateur ou un texte d'ordonnance : jamais lues. */
const FORBIDDEN_KEYS = new Set([
  "patient", "patientId", "user", "userId", "decidedBy", "decidedByUserId", "email", "firstName", "lastName",
  "justification", "shortReason", "patientReason", "counterScript", "pharmacistNote", "scoreBreakdown",
  "companion", "alternatives", "precautions", "vigilances", "note", "reference", "ocrText", "text",
]);

function walk(node: unknown, visit: (key: string, value: unknown) => void) {
  if (Array.isArray(node)) return node.forEach((item) => walk(item, visit));
  if (node === null || typeof node !== "object" || node instanceof Date) return;
  for (const [key, value] of Object.entries(node)) {
    visit(key, value);
    walk(value, visit);
  }
}

describe("confidentialité et lecture seule", () => {
  async function runEverything() {
    seedPortfolio();
    await loadPerformanceReport({ pharmacyId: P1, period: PERIOD, now: NOW });
    await loadSubscriptionReturn({ pharmacyId: P1, now: NOW });
    await loadPerformanceForPlatform({ pharmacyId: P1, period: PERIOD, now: NOW });
    await loadPortfolioForPlatform({ now: NOW });
    return fakeDb.operations();
  }

  it("aucune requête ne lit ni patient, ni collaborateur, ni texte d'ordonnance : seule la date de suppression de l'ordonnance", async () => {
    const operations = await runEverything();
    expect(operations.length).toBeGreaterThan(10);
    for (const op of operations) {
      for (const part of [op.args.select, op.args.where, op.args.by, op.args.orderBy, op.args._max, op.args._count]) {
        walk(part, (key, value) => {
          expect(FORBIDDEN_KEYS.has(key), `${op.model}.${op.op} lit « ${key} »`).toBe(false);
          if (key === "prescription") {
            // `{ select: { deletedAt: true } }` (lecture) ou `{ deletedAt: null }` (filtre) : rien d'autre.
            const inner = value as Record<string, unknown>;
            const fields = "select" in inner ? inner.select : inner;
            expect(Object.keys(fields as object), `${op.model}.${op.op}`).toEqual(["deletedAt"]);
          }
        });
      }
    }
  });

  it("ne fait que lire : ni création, ni modification, ni suppression", async () => {
    const operations = await runEverything();
    for (const op of operations) expect(["findMany", "findFirst", "findUnique", "groupBy"], `${op.model}.${op.op}`).toContain(op.op);
  });

  it("le script de recoupement est en lecture seule : SELECT brut et lectures, aucune écriture", () => {
    const source = readFileSync(path.resolve(process.cwd(), "scripts/performance-recoupement.ts"), "utf8");
    expect(source).toContain("$queryRaw");
    expect(source).not.toMatch(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
    expect(source).not.toMatch(/\$executeRaw|\$queryRawUnsafe|\$executeRawUnsafe/);
    expect(source).not.toMatch(/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|DROP\s+|TRUNCATE|ALTER\s+TABLE|CREATE\s+TABLE)/i);
  });
});
