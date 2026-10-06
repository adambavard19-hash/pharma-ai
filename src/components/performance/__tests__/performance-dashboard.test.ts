import { createElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TIME_ZONE } from "@/config/constants";
import { METHOD_SECTIONS } from "@/core/performance/definitions";
import { computePerformance } from "@/core/performance/compute";
import { resolvePerformancePeriod } from "@/core/performance/periods";
import type { AdviceRow, AdviceStatus, ConfirmedLineRow, FunnelStats, Metric, PerformanceReport, RateMetric, SubscriptionReturn } from "@/core/performance/types";

/**
 * Le tableau de bord, composé avec les vrais composants et un vrai rapport
 * (le cœur de calcul, pas des chiffres écrits à la main) : on lit le texte
 * rendu. Les composants client sont rendus côté serveur, comme à l'ouverture
 * de la page.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { PerformanceDashboard, qualityNotes, rateDeltaText } = await import("../performance-dashboard");
const { PeriodBar } = await import("../period-bar");
const { EvolutionChart } = await import("../evolution-chart");
const { UniverseBars } = await import("../universe-bars");
const { MethodPanel } = await import("../method-panel");
const { PerformanceEmptyState } = await import("../empty-state");

// Mardi 6 octobre 2026, 14 h à Paris.
const NOW = new Date("2026-10-06T12:00:00Z");
const period = (key: "today" | "7d" | "month" = "7d") => resolvePerformancePeriod({ key, now: NOW, timeZone: TIME_ZONE });

const advice = (id: string, status: AdviceStatus, createdAt: string, seed: Partial<AdviceRow> = {}): AdviceRow => ({
  id,
  createdAt: new Date(createdAt),
  origin: "AI",
  status,
  productId: `prod-${id}`,
  presentationId: null,
  label: `Produit ${id}`,
  category: "DERMO",
  unitPriceCents: 1_500,
  prescriptionDeleted: false,
  ...seed,
});

const line = (id: string, saleId: string, saleCreatedAt: string, seed: Partial<ConfirmedLineRow> = {}): ConfirmedLineRow => ({
  saleId,
  saleCreatedAt: new Date(saleCreatedAt),
  lineId: `line-${id}`,
  recommendationId: `rec-${id}`,
  origin: "AI",
  productId: `prod-${id}`,
  presentationId: null,
  label: `Produit ${id}`,
  category: "DERMO",
  quantity: 1,
  unitPriceCents: 2_000,
  totalCents: 2_000,
  vatRate: 20,
  ...seed,
});

/** Douze conseils comptés dont un en attente, deux ventes au prix connu (20,00 € et 19,50 €), une ligne sans prix. */
function busyReport(): PerformanceReport {
  const days = ["2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"];
  const statuses: AdviceStatus[] = ["ACCEPTED", "ACCEPTED", "ACCEPTED", "ACCEPTED", "ACCEPTED", "ACCEPTED", "PURCHASED", "PURCHASED", "DECLINED", "REMOVED", "IGNORED"];
  const counted = statuses.map((status, index) => advice(`a${index}`, status, `${days[index % days.length]}T09:${String(10 + index)}:00Z`));
  const pending = advice("pending", "PROPOSED", "2026-10-06T10:00:00Z");
  return computePerformance({
    period: period(),
    now: NOW,
    timeZone: TIME_ZONE,
    advice: [
      ...counted,
      pending,
      advice("manual", "ACCEPTED", "2026-10-02T09:00:00Z", { origin: "MANUAL" }),
      advice("deleted", "ACCEPTED", "2026-10-02T09:30:00Z", { prescriptionDeleted: true }),
    ],
    previousAdvice: [advice("p1", "ACCEPTED", "2026-09-24T09:00:00Z"), advice("p2", "REMOVED", "2026-09-25T09:00:00Z")],
    lines: [
      line("a6", "sale-1", "2026-10-02T10:00:00Z"),
      line("a7", "sale-2", "2026-10-03T10:00:00Z", { unitPriceCents: 1_950, totalCents: 1_950 }),
      line("a8", "sale-3", "2026-10-04T10:00:00Z", { unitPriceCents: 0, totalCents: 0 }),
    ],
    previousLines: [line("p1", "sale-0", "2026-09-24T10:00:00Z", { unitPriceCents: 1_000, totalCents: 1_000 })],
    rhythmAdvice: [],
  });
}

const emptyReport = (key: "today" | "7d" | "month" = "7d"): PerformanceReport =>
  computePerformance({ period: period(key), now: NOW, timeZone: TIME_ZONE, advice: [], previousAdvice: [], lines: [], previousLines: [], rhythmAdvice: [] });

const shownRoi: SubscriptionReturn = {
  status: "shown",
  monthLabel: "octobre 2026",
  monthlyPriceHtCents: 12_600,
  trialing: false,
  confirmedTtcCents: 63_504,
  confirmedHtCents: 52_920,
  confirmedLines: 14,
  pricedShare: 0.93,
  ratio: 4.2,
  ratioLabel: "4,2 fois",
  sentence: "PharmaBoost a généré 4,2 fois le montant de votre abonnement en ventes confirmées ce mois-ci (chiffre d'affaires HT, pas bénéfice).",
};

type Props = Partial<Parameters<typeof PerformanceDashboard>[0]>;
const dashboard = (report: PerformanceReport, props: Props = {}) =>
  createElement(PerformanceDashboard, { report, roi: null, basePath: "/resultats", audience: "owner", now: NOW, ...props });

/** Espaces insécables et fines (formats français) ramenés à des espaces simples. */
const plain = (value: string) => value.replace(/[\s\u00a0\u202f]+/g, " ");

/** Le texte rendu : sans balisage, espaces normalisés, apostrophes rétablies. */
const text = (element: ReactElement) =>
  plain(
    renderToStaticMarkup(element)
      .replace(/<[^>]+>/g, " ")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&"),
  );

const html = (element: ReactElement) => renderToStaticMarkup(element);

/** Les éléments de l'arbre rendu par la fonction du composant (sans développer les sous-composants). */
function elementsOf(node: ReactNode): ReactElement<{ children?: ReactNode; [key: string]: unknown }>[] {
  if (Array.isArray(node)) return node.flatMap(elementsOf);
  if (typeof node !== "object" || node === null || !("props" in node)) return [];
  const element = node as ReactElement<{ children?: ReactNode }>;
  return [element, ...elementsOf(element.props.children)];
}

describe("PerformanceDashboard : un rapport plein", () => {
  const report = busyReport();
  const out = text(dashboard(report, { roi: shownRoi }));

  it("part d'un vrai rapport : 12 conseils comptés, 9 acceptés, 1 en attente, 39,50 € attribués sur 2 ventes", () => {
    expect(report.empty).toBe(false);
    expect(report.funnel.proposed.value).toBe(12);
    expect(report.funnel.accepted.value).toBe(9);
    expect(report.funnel.pending).toBe(1);
    expect(report.revenue.confirmedTtcCents.value).toBe(3_950);
    expect(report.revenue.confirmedSales.value).toBe(2);
    expect(report.quality.unpricedConfirmedLines).toBe(1);
    expect(report.quality.manualExcluded).toBe(1);
    expect(report.quality.deletedPrescriptionAdvice).toBe(1);
  });

  it("ouvre sur la phrase du rapport, la ligne de ventes et le grand chiffre du chiffre d'affaires", () => {
    expect(out).toContain(plain(report.narrative.headline));
    expect(report.narrative.revenueLine).not.toBeNull();
    expect(out).toContain(plain(report.narrative.revenueLine as string));
    expect(out).toContain("Les ventes confirmées issues de conseils PharmaBoost représentent 39,50 € TTC sur la période.");
    expect(out).toContain("Chiffre d'affaires attribué 39,50 €");
  });

  it("montre les quatre chiffres clés avec leurs libellés", () => {
    for (const label of ["Conseils proposés", "Conseils acceptés", "Ventes confirmées", "Panier moyen", "Chiffre d'affaires attribué"]) expect(out).toContain(label);
    expect(out).toContain("Taux d'acceptation 82 %");
  });

  it("compare à la période précédente, en toutes lettres, sur la carte du chiffre d'affaires", () => {
    expect(out).toContain("vs les 7 jours d'avant");
    // 39,50 € contre 10,00 € : +295 %.
    expect(out).toContain("+295 %");
  });

  it("dit ce qui n'est pas compté, en clair", () => {
    expect(out).toContain("À savoir sur ces chiffres");
    expect(out).toContain("1 conseil proposé depuis moins de 24 h attend encore une décision");
    expect(out).toContain("1 ligne de vente issue d'un conseil n'a pas de prix : aucun chiffre d'affaires n'est compté pour elle.");
    expect(out).not.toMatch(/comptées? comme ventes?/);
    expect(out).toContain("1 produit ajouté à la main par l'équipe n'est pas compté");
    expect(out).toContain("1 conseil d'une ordonnance supprimée est ignoré.");
    expect(out).toContain("Seules les ventes enregistrées dans PharmaBoost sont comptées, pas la caisse de votre logiciel de gestion.");
  });

  it("compose tous les blocs : évolution, retour sur abonnement, entonnoir, produits, rythme, méthode", () => {
    for (const heading of ["Évolution", "Retour sur abonnement", "Du conseil à la vente", "Ce qui marche", "Quand le conseil fonctionne le mieux", "Comment c'est calculé"]) {
      expect(out).toContain(heading);
    }
    expect(out).toContain("4,2 fois");
  });

  it("garde la barre de période au-dessus de tout", () => {
    expect(out.indexOf("7 derniers jours")).toBeGreaterThanOrEqual(0);
    expect(out.indexOf("Aujourd'hui")).toBeLessThan(out.indexOf(plain(report.narrative.headline)));
  });

  it("dit quand les chiffres ont été calculés, à l'heure de Paris", () => {
    expect(out).toContain("Chiffres calculés le 06/10/2026 14:00 (heure de Paris).");
  });
});

describe("PerformanceDashboard : peu de données", () => {
  // Trois conseils, aucune vente : on le dit tel quel, sans chiffre d'affaires inventé.
  const few = computePerformance({
    period: period(),
    now: NOW,
    timeZone: TIME_ZONE,
    advice: [advice("f1", "ACCEPTED", "2026-10-01T09:00:00Z"), advice("f2", "ACCEPTED", "2026-10-02T09:00:00Z"), advice("f3", "REMOVED", "2026-10-03T09:00:00Z")],
    previousAdvice: [],
    lines: [],
    previousLines: [],
    rhythmAdvice: [],
  });
  const out = text(dashboard(few));

  it("affiche le rapport (il n'est pas vide) et prévient que les pourcentages bougent beaucoup", () => {
    expect(few.empty).toBe(false);
    expect(out).toContain("Peu de conseils sur cette période");
  });

  it("dit qu'un conseil accepté n'est pas une vente, et affiche 0,00 € plutôt qu'un chiffre plausible", () => {
    expect(out).toContain("Aucune vente confirmée n'est enregistrée pour l'instant : un conseil accepté n'est pas une vente.");
    expect(out).toContain("Chiffre d'affaires attribué 0,00 €");
  });

  it("n'invente aucune variation quand la période précédente est vide", () => {
    expect(out).not.toMatch(/\+\d+(,\d)? %/);
    expect(out).toContain("Nouveau");
  });
});

describe("PerformanceDashboard : mini-courbes", () => {
  it("les deux cartes de conseils ont leur courbe quand la période a plusieurs points ; « Ventes confirmées » (des tickets) et « Panier moyen » n'en ont pas", () => {
    const markup = html(dashboard(busyReport()));
    for (const label of ["Conseils proposés", "Conseils acceptés"]) {
      expect(markup).toContain(`aria-label="Évolution de « ${label} » sur la période"`);
    }
    // La seule courbe de ventes dont on dispose compte des conseils distincts : la tracer sous « Ventes confirmées » mélangerait deux unités.
    expect(markup).not.toContain("Évolution de « Ventes confirmées »");
    expect(markup).not.toContain("Évolution de « Panier moyen");
    expect(markup.match(/aria-label="Évolution de «/g)).toHaveLength(2);
  });

  it("une seule tranche de mesure ne dessine aucune mini-courbe", () => {
    // 0 h 30 à Paris : « aujourd'hui » ne compte qu'une heure.
    const midnight = new Date("2026-10-05T22:30:00Z");
    const early = computePerformance({
      period: resolvePerformancePeriod({ key: "today", now: midnight, timeZone: TIME_ZONE }),
      now: midnight,
      timeZone: TIME_ZONE,
      advice: [advice("e1", "ACCEPTED", "2026-10-05T22:10:00Z")],
      previousAdvice: [],
      lines: [],
      previousLines: [],
      rhythmAdvice: [],
    });
    expect(early.series.current).toHaveLength(1);
    expect(html(dashboard(early, { now: midnight }))).not.toContain("aria-label=\"Évolution de «");
  });
});

/**
 * Trois conseils achetés dans UN seul ticket de 60,00 € : 1 vente confirmée, 3 conseils achetés.
 * (Un mot, une unité : « ventes confirmées » compte des tickets, « conseils achetés » des conseils.)
 */
function oneTicketThreeAdvice(unitPriceCents = 2_000): PerformanceReport {
  const advices = ["a0", "a1", "a2"].map((id, index) => advice(id, "PURCHASED", `2026-10-0${index + 1}T09:00:00Z`));
  return computePerformance({
    period: period(),
    now: NOW,
    timeZone: TIME_ZONE,
    advice: advices,
    previousAdvice: [],
    lines: ["a0", "a1", "a2"].map((id) => line(id, "sale-1", "2026-10-03T10:00:00Z", { unitPriceCents, totalCents: unitPriceCents })),
    previousLines: [],
    rhythmAdvice: [],
  });
}

describe("PerformanceDashboard : un mot, une unité", () => {
  it("3 conseils achetés dans un seul ticket : la carte et « Côté caisse » disent 1 vente confirmée, l'entonnoir dit 3 conseils achetés", () => {
    const report = oneTicketThreeAdvice();
    expect(report.revenue.confirmedSales.value).toBe(1);
    expect(report.funnel.purchased.value).toBe(3);
    const out = text(dashboard(report));
    // La carte (« Ventes confirmées » 1) et la ligne « Côté caisse » (« Ventes confirmées » 1) : jamais 3.
    expect(out.match(/Ventes confirmées 1\b/g)).toHaveLength(2);
    expect(out).not.toContain("Ventes confirmées 3");
    // L'entonnoir : le segment de l'étage « acceptés » et l'étage 3.
    expect(out.match(/Conseils achetés 3\b/g)).toHaveLength(2);
    expect(out).not.toContain("Tickets de vente");
  });

  it("la carte « Ventes confirmées » n'a plus de mini-courbe (les conseils achetés par jour ne sont pas des tickets) et ne répète pas le panier moyen", () => {
    const report = oneTicketThreeAdvice();
    const markup = html(dashboard(report));
    expect(markup).not.toContain("Évolution de « Ventes confirmées »");
    expect(text(dashboard(report))).not.toContain("panier moyen");
  });

  it("3 lignes de vente sans prix dans un seul ticket : 0 vente confirmée, et la page dit « 3 lignes de vente », jamais « 3 ventes »", () => {
    const report = oneTicketThreeAdvice(0);
    expect(report.revenue.confirmedSales.value).toBe(0);
    expect(report.quality.unpricedConfirmedLines).toBe(3);
    const out = text(dashboard(report));
    expect(out).toContain("Ventes confirmées 0");
    expect(out).toContain("3 lignes de vente n'ont pas de prix saisi : aucun chiffre d'affaires n'est compté pour elles."); // Côté caisse
    expect(out).toContain("3 lignes de vente issues d'un conseil n'ont pas de prix : aucun chiffre d'affaires n'est compté pour elles."); // À savoir
    expect(out).not.toMatch(/3 ventes/);
    expect(out).not.toMatch(/comptées? comme ventes?/);
    expect(out).toContain("Conseils achetés 3");
  });
});

describe("PerformanceDashboard : la carte « Panier moyen »", () => {
  it("s'appelle « Panier moyen » (pas « par conseil ») : 60,00 € dans un seul ticket, 20,00 € par conseil n'est PAS ce qu'elle dit", () => {
    const report = oneTicketThreeAdvice();
    expect(report.revenue.averageBasketCents).toBe(6_000);
    const out = text(dashboard(report));
    expect(out).toContain("Panier moyen 60,00 € TTC, par vente confirmée");
    expect(out).not.toContain("Panier moyen par conseil");
    expect(out).not.toContain("20,00 € TTC, par");
  });
});

/** Un taux : seule la variation en points compte ici. */
const rateOf = (deltaPoints: number | null, trend: RateMetric["trend"]): RateMetric => ({ value: 1, previous: null, deltaPoints, trend });
const countOfMetric = (value: number, previous: number): Metric => ({ value, previous, deltaPct: null, trend: "none" });
const funnelOf = (proposed: number, pending: number, previousProposed: number, rate: RateMetric): FunnelStats => ({
  proposed: countOfMetric(proposed, previousProposed),
  pending,
  accepted: countOfMetric(1, 5),
  declinedByPatient: 0,
  removedByTeam: 0,
  unanswered: 0,
  purchased: countOfMetric(0, 0),
  acceptedNotConfirmed: 1,
  acceptanceRate: rate,
  conversionRate: { value: 0, previous: null, deltaPoints: null, trend: "none" },
});

describe("rateDeltaText : jamais de points sous 3 conseils tranchés", () => {
  const up = rateOf(50, "up");

  it("3 proposés dont 2 en attente = 1 conseil tranché : aucun point, même avec 10 conseils tranchés la période d'avant", () => {
    expect(rateDeltaText(funnelOf(3, 2, 10, up))).toBeNull();
  });

  it("2 conseils tranchés (4 proposés, 2 en attente) : aucun point ; 3 conseils tranchés : « +50 pts »", () => {
    expect(rateDeltaText(funnelOf(4, 2, 10, up))).toBeNull();
    expect(rateDeltaText(funnelOf(5, 2, 10, up))).toBe("+50 pts");
  });

  it("côté période précédente aussi : 2 conseils avant = aucun point, 3 conseils avant = « +50 pts »", () => {
    expect(rateDeltaText(funnelOf(10, 0, 2, up))).toBeNull();
    expect(rateDeltaText(funnelOf(10, 0, 3, up))).toBe("+50 pts");
  });

  it("une baisse s'écrit avec le vrai signe moins ; stable ou inconnu : rien", () => {
    expect(rateDeltaText(funnelOf(10, 0, 10, rateOf(-12.5, "down")))).toBe("−12,5 pts");
    expect(rateDeltaText(funnelOf(10, 0, 10, rateOf(0.2, "flat")))).toBeNull();
    expect(rateDeltaText(funnelOf(10, 0, 10, rateOf(null, "none")))).toBeNull();
  });

  it("sur la carte « Conseils acceptés » : pas de « (+x pts) » à 1 conseil tranché, le taux lui-même reste écrit", () => {
    // Aujourd'hui : 1 accepté, 2 en attente ; hier à la même heure : 10 conseils dont 5 acceptés.
    const today = resolvePerformancePeriod({ key: "today", now: NOW, timeZone: TIME_ZONE });
    const report = computePerformance({
      period: today,
      now: NOW,
      timeZone: TIME_ZONE,
      advice: [advice("t1", "ACCEPTED", "2026-10-06T06:00:00Z"), advice("t2", "PROPOSED", "2026-10-06T08:00:00Z"), advice("t3", "PROPOSED", "2026-10-06T09:00:00Z")],
      previousAdvice: Array.from({ length: 10 }, (_, index) => advice(`y${index}`, index < 5 ? "ACCEPTED" : "REMOVED", `2026-10-05T0${index % 9}:30:00Z`)),
      lines: [],
      previousLines: [],
      rhythmAdvice: [],
    });
    expect(report.funnel.proposed.value - report.funnel.pending).toBe(1);
    expect(report.funnel.acceptanceRate.deltaPoints).toBe(50);
    const out = text(dashboard(report));
    expect(out).toContain("Taux d'acceptation 100 %");
    expect(out).not.toContain("+50 pts");
    expect(out).not.toMatch(/pts\)/);
  });

  it("sur la carte « Conseils acceptés » : avec assez de conseils tranchés, les points s'écrivent", () => {
    const today = resolvePerformancePeriod({ key: "today", now: NOW, timeZone: TIME_ZONE });
    const report = computePerformance({
      period: today,
      now: NOW,
      timeZone: TIME_ZONE,
      advice: [advice("t1", "ACCEPTED", "2026-10-06T00:30:00Z"), advice("t2", "ACCEPTED", "2026-10-06T01:30:00Z"), advice("t3", "ACCEPTED", "2026-10-06T02:30:00Z"), advice("t4", "REMOVED", "2026-10-06T03:30:00Z")],
      previousAdvice: Array.from({ length: 10 }, (_, index) => advice(`y${index}`, index < 5 ? "ACCEPTED" : "REMOVED", `2026-10-05T0${index % 9}:30:00Z`)),
      lines: [],
      previousLines: [],
      rhythmAdvice: [],
    });
    expect(report.funnel.proposed.value - report.funnel.pending).toBe(4);
    expect(report.funnel.acceptanceRate.deltaPoints).toBe(25);
    expect(text(dashboard(report))).toContain("Taux d'acceptation 75 % (+25 pts)");
  });
});

describe("PerformanceDashboard : une autre période repart de zéro (clé de remontage)", () => {
  const keyed = (report: PerformanceReport) => {
    const tree = elementsOf(PerformanceDashboard({ report, roi: null, basePath: "/resultats", audience: "owner", now: NOW }));
    const keyOf = (type: unknown) => tree.find((element) => element.type === type)?.key;
    return { bar: keyOf(PeriodBar), chart: keyOf(EvolutionChart), universes: keyOf(UniverseBars) };
  };
  const customReport = (from: string, to: string) => {
    const customPeriod = resolvePerformancePeriod({ key: "custom", from, to, now: NOW, timeZone: TIME_ZONE });
    return computePerformance({ period: customPeriod, now: NOW, timeZone: TIME_ZONE, advice: [advice("k1", "ACCEPTED", `${from}T09:00:00Z`)], previousAdvice: [], lines: [], previousLines: [], rhythmAdvice: [] });
  };

  it("le graphique, les univers et la barre de période ont la même clé, faite de la période et de ses dates", () => {
    const seven = keyed(busyReport());
    expect(seven.chart).toBeTruthy();
    expect(seven.universes).toBe(seven.chart);
    expect(seven.bar).toBe(seven.chart);
    expect(seven.chart).toBe("7d::");
    expect(keyed(customReport("2026-09-01", "2026-09-30")).chart).toBe("custom:2026-09-01:2026-09-30");
  });

  it("changer de période (7 jours → personnalisée, ou d'autres dates) change la clé : l'état de la précédente ne survit pas", () => {
    const a = keyed(busyReport());
    const b = keyed(customReport("2026-09-01", "2026-09-30"));
    const c = keyed(customReport("2026-09-01", "2026-10-01"));
    expect(new Set([a.chart, b.chart, c.chart]).size).toBe(3);
    expect(new Set([a.universes, b.universes, c.universes]).size).toBe(3);
    expect(new Set([a.bar, b.bar, c.bar]).size).toBe(3);
  });

  it("une même période garde la même clé d'un rechargement à l'autre : l'état (mesure choisie) survit à un simple rafraîchissement", () => {
    expect(keyed(busyReport()).chart).toBe(keyed(busyReport()).chart);
    expect(keyed(customReport("2026-09-01", "2026-09-30")).bar).toBe(keyed(customReport("2026-09-01", "2026-09-30")).bar);
  });

  it("la barre de période et le graphique gardent leur clé même quand le rapport est vide (la barre reste visible)", () => {
    const empty = emptyReport("month");
    const tree = elementsOf(PerformanceDashboard({ report: empty, roi: null, basePath: "/resultats", audience: "owner", now: NOW }));
    expect(tree.find((element) => element.type === PeriodBar)?.key).toBe("month::");
  });
});

describe("PerformanceDashboard : composition", () => {
  const report = busyReport();
  const tree = elementsOf(PerformanceDashboard({ report, roi: null, basePath: "/admin/pharmacies/ph_1", preserveParams: { onglet: "performance" }, audience: "platform", now: NOW }));

  it("passe la période, le chemin et les paramètres à garder à la barre de période", () => {
    const bar = tree.find((element) => element.type === PeriodBar);
    expect(bar?.props.period).toBe(report.period);
    expect(bar?.props.basePath).toBe("/admin/pharmacies/ph_1");
    expect(bar?.props.preserveParams).toEqual({ onglet: "performance" });
  });

  it("passe au graphique les deux séries, le pas, le libellé de comparaison, et pas de taux quand aucun créneau n'en a", () => {
    const chart = tree.find((element) => element.type === EvolutionChart);
    expect(chart?.props.series).toBe(report.series);
    expect(chart?.props.granularity).toBe("day");
    expect(chart?.props.comparisonLabel).toBe("vs les 7 jours d'avant");
    expect(chart?.props.showAcceptanceRate).toBe(report.series.current.some((bucket) => bucket.acceptanceRate !== null));
  });

  it("la barre reçoit la période du rapport : aujourd'hui se compare à hier", () => {
    const today = emptyReport("today");
    const result = elementsOf(PerformanceDashboard({ report: today, roi: null, basePath: "/resultats", audience: "owner", now: NOW }));
    expect(result.find((element) => element.type === PeriodBar)?.props.period).toBe(today.period);
    expect(text(dashboard(today))).toContain("variations vs hier");
  });
});

describe("PerformanceDashboard : rien à montrer", () => {
  const report = emptyReport();

  it("le dit honnêtement, sans chiffre ni exemple, et garde la barre de période", () => {
    expect(report.empty).toBe(true);
    const out = text(dashboard(report));
    const markup = html(dashboard(report));
    expect(out).toContain("PharmaBoost n'a encore rien mesuré sur cette période.");
    expect(out).toContain("Aujourd'hui");
    expect(out).toContain("Personnalisée");
    // Ni grand chiffre, ni cartes, ni courbe, ni entonnoir : rien de ce qui ressemblerait à une mesure.
    for (const absent of ['data-figure="revenue"', "data-emphasis", "data-measure"]) expect(markup).not.toContain(absent);
    for (const absent of ["Du conseil à la vente", "Ce qui marche", "Quand le conseil fonctionne le mieux", "À retenir", "Évolution"]) expect(out).not.toContain(absent);
    expect(out).not.toMatch(/\d+,\d\d €/);
  });

  it("côté titulaire comme côté console, avec les mots qui conviennent", () => {
    expect(text(dashboard(report, { audience: "owner" }))).toContain("dès que PharmaBoost propose un conseil à votre équipe ou qu'une vente issue d'un conseil est enregistrée");
    expect(text(dashboard(report, { audience: "owner" }))).not.toContain("dès que votre équipe retient un conseil");
    expect(text(dashboard(report, { audience: "platform" }))).toContain("pour cette officine sur la période");
  });

  it("garde la méthode, et le retour sur abonnement du mois quand il existe", () => {
    expect(text(dashboard(report, { roi: shownRoi }))).toContain("4,2 fois");
    expect(html(dashboard(report, { roi: shownRoi }))).toContain('data-state="roi-shown"');
    expect(text(dashboard(report))).toContain("Comment c'est calculé");
  });

  it("signale quand même ce qui a été écarté (produits ajoutés à la main)", () => {
    const onlyManual = computePerformance({ period: period(), now: NOW, timeZone: TIME_ZONE, advice: [advice("m", "ACCEPTED", "2026-10-02T09:00:00Z", { origin: "MANUAL" })], previousAdvice: [], lines: [], previousLines: [], rhythmAdvice: [] });
    expect(onlyManual.empty).toBe(true);
    expect(text(dashboard(onlyManual))).toContain("1 produit ajouté à la main par l'équipe n'est pas compté");
  });
});

describe("PerformanceDashboard : retour sur abonnement", () => {
  const report = busyReport();

  it("sans retour (null), la carte n'existe pas", () => {
    expect(html(dashboard(report, { roi: null }))).not.toContain('data-state="roi-');
  });

  it("masqué côté titulaire : une ligne discrète, jamais un ratio", () => {
    const out = text(dashboard(report, { roi: { status: "hidden", reason: "not_enough_sales", detail: "3 lignes" } }));
    expect(out).toContain("Retour sur abonnement : il s'affichera dès que");
    // Aucun ratio (« 4,2 fois ») : le mot « fois » peut figurer ailleurs (« un conseil compte une fois »).
    expect(out).not.toMatch(/\d(,\d)? fois/);
  });

  it("abonnement partagé : aucun ratio, et la raison est dite côté titulaire comme côté console", () => {
    const detail = "Cet abonnement couvre plusieurs officines : le chiffre d'affaires d'une seule ne se compare pas au prix du groupe.";
    const owner = text(dashboard(report, { roi: { status: "hidden", reason: "shared_subscription", detail } }));
    expect(owner).toContain("Retour sur abonnement : il n'est pas calculé, car votre abonnement couvre plusieurs officines");
    expect(owner).not.toMatch(/\d(,\d)? fois/);
    const platform = text(dashboard(report, { audience: "platform", roi: { status: "hidden", reason: "shared_subscription", detail } }));
    expect(platform).toContain("Retour sur abonnement non mesurable");
    expect(platform).toContain(detail);
  });

  it("masqué côté console : la raison est écrite", () => {
    const out = text(dashboard(report, { audience: "platform", roi: { status: "hidden", reason: "no_price", detail: "Aucun prix de contrat." } }));
    expect(out).toContain("Retour sur abonnement non mesurable");
    expect(out).toContain("Aucun prix de contrat.");
  });
});

describe("qualityNotes : les remarques en clair, avec les accords", () => {
  const none = { manualExcluded: 0, unpricedConfirmedLines: 0, deletedPrescriptionAdvice: 0, pendingAdvice: 0 };

  it("rien à signaler : aucune remarque", () => {
    expect(qualityNotes(none)).toEqual([]);
  });

  it("au singulier pour 1", () => {
    expect(qualityNotes({ manualExcluded: 1, unpricedConfirmedLines: 1, deletedPrescriptionAdvice: 1, pendingAdvice: 1 })).toEqual([
      "1 conseil proposé depuis moins de 24 h attend encore une décision : il ne compte pas encore dans le taux d'acceptation.",
      "1 ligne de vente issue d'un conseil n'a pas de prix : aucun chiffre d'affaires n'est compté pour elle.",
      "1 produit ajouté à la main par l'équipe n'est pas compté : ce n'est pas un conseil PharmaBoost.",
      "1 conseil d'une ordonnance supprimée est ignoré.",
    ]);
  });

  it("au pluriel dès 2", () => {
    expect(qualityNotes({ manualExcluded: 2, unpricedConfirmedLines: 3, deletedPrescriptionAdvice: 4, pendingAdvice: 5 })).toEqual([
      "5 conseils proposés depuis moins de 24 h attendent encore une décision : ils ne comptent pas encore dans le taux d'acceptation.",
      "3 lignes de vente issues d'un conseil n'ont pas de prix : aucun chiffre d'affaires n'est compté pour elles.",
      "2 produits ajoutés à la main par l'équipe ne sont pas comptés : ce ne sont pas des conseils PharmaBoost.",
      "4 conseils d'ordonnances supprimées sont ignorés.",
    ]);
  });

  it("ne dit rien d'un sujet à 0", () => {
    expect(qualityNotes({ ...none, unpricedConfirmedLines: 2 })).toHaveLength(1);
  });

  it("les lignes sans prix sont des lignes de vente qui ne font aucun chiffre d'affaires : jamais « comptées comme ventes »", () => {
    for (const unpriced of [1, 2, 3]) {
      const [note] = qualityNotes({ ...none, unpricedConfirmedLines: unpriced });
      expect(note).toContain("de vente");
      expect(note).toContain("aucun chiffre d'affaires n'est compté");
      expect(note).not.toMatch(/comptées? comme ventes?/);
    }
  });
});

describe("MethodPanel et état vide", () => {
  it("reprend tel quel chaque section de METHOD_SECTIONS, replié par défaut", () => {
    const html = renderToStaticMarkup(createElement(MethodPanel));
    const out = text(createElement(MethodPanel));
    expect(html).toContain("<details");
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(out).toContain("Comment c'est calculé");
    expect(METHOD_SECTIONS.length).toBeGreaterThanOrEqual(8);
    for (const section of METHOD_SECTIONS) {
      expect(out).toContain(section.title);
      expect(out).toContain(section.body);
    }
  });

  it("dit que la caisse du logiciel de gestion n'est pas lue", () => {
    expect(text(createElement(MethodPanel))).toContain("PharmaBoost ne lit pas la caisse de votre logiciel de gestion");
  });

  it("l'état vide ne montre ni chiffre ni courbe", () => {
    const out = text(createElement(PerformanceEmptyState, { audience: "owner" }));
    expect(out).toContain("PharmaBoost n'a encore rien mesuré sur cette période.");
    expect(out).not.toMatch(/\d/);
  });
});
