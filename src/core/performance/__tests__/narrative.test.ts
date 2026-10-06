import { describe, expect, it } from "vitest";
import { metric, rateMetric } from "../metrics";
import { buildNarrative, pctText, type NarrativeInput } from "../narrative";
import type { DataQuality, FunnelStats, PerformancePeriod, ProductRow, RhythmStats, UniverseRow } from "../types";

/** Les espaces insécables des formats français (U+00A0, U+202F) deviennent des espaces simples. */
const plain = (text: string | null | undefined) => (text ?? "").replace(/[  ]/g, " ");

const NOW = new Date("2026-10-06T12:00:00Z");

function period(key: PerformancePeriod["key"] = "7d", label = "7 derniers jours"): PerformancePeriod {
  return {
    key,
    label,
    start: new Date("2026-09-29T12:00:00Z"),
    end: NOW,
    previousStart: new Date("2026-09-22T12:00:00Z"),
    previousEnd: new Date("2026-09-29T12:00:00Z"),
    granularity: "day",
    dayCount: 7,
    inProgress: true,
  };
}

type FunnelSeed = {
  proposed?: number;
  previousProposed?: number;
  pending?: number;
  accepted?: number;
  previousAccepted?: number;
  purchased?: number;
  rate?: number | null;
  previousRate?: number | null;
};

/** Un entonnoir complet : le taux suit la définition (accepté ÷ (proposé − en attente)) sauf si `rate` est imposé. */
function funnel(seed: FunnelSeed = {}): FunnelStats {
  const proposed = seed.proposed ?? 0;
  const pending = seed.pending ?? 0;
  const accepted = seed.accepted ?? 0;
  const decided = proposed - pending;
  const rate = seed.rate !== undefined ? seed.rate : decided > 0 ? accepted / decided : null;
  return {
    proposed: metric(proposed, seed.previousProposed ?? 0),
    pending,
    accepted: metric(accepted, seed.previousAccepted ?? 0),
    declinedByPatient: 0,
    removedByTeam: 0,
    unanswered: 0,
    purchased: metric(seed.purchased ?? 0, 0),
    acceptedNotConfirmed: accepted,
    acceptanceRate: rateMetric(rate, seed.previousRate ?? null),
    conversionRate: rateMetric(null, null),
  };
}

function revenue(cents = 0, previousCents = 0): NarrativeInput["revenue"] {
  return {
    confirmedTtcCents: metric(cents, previousCents),
    confirmedSales: metric(cents > 0 ? 1 : 0, previousCents > 0 ? 1 : 0),
    pricedLines: cents > 0 ? 1 : 0,
    unpricedLines: 0,
    unitsSold: cents > 0 ? 1 : 0,
    averageBasketCents: cents > 0 ? cents : null,
    previousAverageBasketCents: previousCents > 0 ? previousCents : null,
  };
}

const NO_RHYTHM: RhythmStats = { windowDays: 90, cells: [], enoughData: false, bestWeekday: null, bestWindow: null };
const RHYTHM: RhythmStats = {
  windowDays: 90,
  cells: [],
  enoughData: true,
  bestWeekday: { weekday: 1, label: "Mardi", acceptanceRate: 0.742, decided: 40 },
  bestWindow: { fromHour: 14, toHour: 16, acceptanceRate: 0.71, decided: 22 },
};

function quality(seed: Partial<DataQuality> = {}): DataQuality {
  return { manualExcluded: 0, unpricedConfirmedLines: 0, deletedPrescriptionAdvice: 0, pendingAdvice: 0, ...seed };
}

function product(seed: Partial<ProductRow> & { key: string; label: string }): ProductRow {
  return { category: "DERMO", proposed: 0, accepted: 0, purchased: 0, unitsSold: 0, revenueTtcCents: 0, acceptanceRate: null, ...seed };
}

function universe(seed: Partial<UniverseRow> & { category: string; label: string }): UniverseRow {
  return { proposed: 0, accepted: 0, purchased: 0, revenueTtcCents: 0, acceptanceRate: null, ...seed };
}

function build(seed: Partial<NarrativeInput> = {}) {
  return buildNarrative({
    period: period(),
    funnel: funnel(),
    revenue: revenue(),
    products: [],
    universes: [],
    rhythm: NO_RHYTHM,
    quality: quality(),
    now: NOW,
    ...seed,
  });
}

describe("phrase d'ouverture", () => {
  it("reprend l'exemple du cahier des charges : 34 proposés, 21 acceptés, 62 %", () => {
    const n = build({ period: period("today", "Aujourd'hui"), funnel: funnel({ proposed: 34, accepted: 21 }), revenue: revenue(28_700) });
    expect(n.headline).toBe("Aujourd'hui, PharmaBoost a proposé 34 conseils à votre équipe : 21 ont été acceptés (62 %).");
    expect(plain(n.revenueLine)).toBe("Les ventes confirmées issues de conseils PharmaBoost représentent 287,00 € TTC sur la période.");
  });

  it("s'adapte à la période choisie", () => {
    const f = funnel({ proposed: 10, accepted: 5 });
    expect(build({ period: period("7d"), funnel: f }).headline).toMatch(/^Sur les 7 derniers jours, PharmaBoost a proposé 10 conseils/);
    expect(build({ period: period("month", "Ce mois-ci"), funnel: f }).headline).toMatch(/^Ce mois-ci, PharmaBoost a proposé 10 conseils/);
    expect(build({ period: period("custom", "Du 1 au 15 septembre 2026"), funnel: f }).headline).toMatch(
      /^Du 1 au 15 septembre 2026, PharmaBoost a proposé 10 conseils/,
    );
  });

  it("accorde les pluriels français : 0 et 1 au singulier", () => {
    const today = period("today");
    expect(build({ period: today, funnel: funnel({ proposed: 1, accepted: 1 }) }).headline).toBe(
      "Aujourd'hui, PharmaBoost a proposé 1 conseil à votre équipe : il a été accepté (100 %).",
    );
    expect(build({ period: today, funnel: funnel({ proposed: 1, accepted: 0 }) }).headline).toBe(
      "Aujourd'hui, PharmaBoost a proposé 1 conseil à votre équipe : il n'a pas été accepté (0 %).",
    );
    expect(build({ period: today, funnel: funnel({ proposed: 5, accepted: 0 }) }).headline).toBe(
      "Aujourd'hui, PharmaBoost a proposé 5 conseils à votre équipe : aucun n'a été accepté (0 %).",
    );
    expect(build({ period: today, funnel: funnel({ proposed: 5, accepted: 1 }) }).headline).toBe(
      "Aujourd'hui, PharmaBoost a proposé 5 conseils à votre équipe : 1 a été accepté (20 %).",
    );
    expect(build({ period: today, funnel: funnel({ proposed: 2, accepted: 2 }) }).headline).toBe(
      "Aujourd'hui, PharmaBoost a proposé 2 conseils à votre équipe : 2 ont été acceptés (100 %).",
    );
  });

  it("sépare les milliers à la française", () => {
    const n = build({ funnel: funnel({ proposed: 1234, accepted: 617 }) });
    expect(plain(n.headline)).toContain("a proposé 1 234 conseils");
    expect(plain(n.headline)).toContain("617 ont été acceptés (50 %)");
  });

  it("dit combien de conseils attendent encore, pour que le taux ne contredise pas le total", () => {
    const n = build({ period: period("today"), funnel: funnel({ proposed: 34, pending: 4, accepted: 21 }) });
    expect(n.headline).toBe(
      "Aujourd'hui, PharmaBoost a proposé 34 conseils à votre équipe : 21 ont été acceptés (70 % des 30 conseils tranchés, 4 encore en attente).",
    );
  });

  it("gère un seul conseil tranché parmi des conseils en attente", () => {
    const n = build({ period: period("today"), funnel: funnel({ proposed: 4, pending: 3, accepted: 1 }) });
    expect(n.headline).toBe(
      "Aujourd'hui, PharmaBoost a proposé 4 conseils à votre équipe : 1 a été accepté (100 % sur 1 conseil tranché, 3 encore en attente).",
    );
  });

  it("n'invente pas de taux quand tout attend une réponse", () => {
    const today = period("today");
    expect(build({ period: today, funnel: funnel({ proposed: 3, pending: 3 }) }).headline).toBe(
      "Aujourd'hui, PharmaBoost a proposé 3 conseils à votre équipe : ils sont tous en attente de réponse.",
    );
    expect(build({ period: today, funnel: funnel({ proposed: 1, pending: 1 }) }).headline).toBe(
      "Aujourd'hui, PharmaBoost a proposé 1 conseil à votre équipe : il est en attente de réponse.",
    );
  });

  it("ne dépasse jamais 100 %", () => {
    const n = build({ funnel: funnel({ proposed: 4, accepted: 4, rate: 1.2 }) });
    expect(n.headline).toContain("(100 %)");
  });

  it("zéro conseil : le dit simplement, sans ligne de chiffre d'affaires", () => {
    const n = build();
    expect(n.headline).toBe("PharmaBoost n'a encore rien proposé à votre équipe sur cette période.");
    expect(n.revenueLine).toBeNull();
    expect(n.insights).toEqual([]);
  });

  it("n'emploie jamais « vendu » ni « confirmée » pour des conseils acceptés", () => {
    const n = build({ funnel: funnel({ proposed: 12, accepted: 9 }) });
    expect(n.headline).not.toMatch(/vendu|confirm|vente/i);
  });
});

describe("seconde phrase : les ventes confirmées", () => {
  it("montre le chiffre d'affaires, séparément des conseils", () => {
    const n = build({ funnel: funnel({ proposed: 10, accepted: 6 }), revenue: revenue(12_345) });
    expect(plain(n.revenueLine)).toBe("Les ventes confirmées issues de conseils PharmaBoost représentent 123,45 € TTC sur la période.");
    expect(n.headline).not.toContain("123");
  });

  it("des acceptés mais aucune vente confirmée : dit qu'un conseil accepté n'est pas une vente", () => {
    const n = build({ funnel: funnel({ proposed: 10, accepted: 6 }) });
    expect(n.revenueLine).toBe("Aucune vente confirmée n'est enregistrée pour l'instant : un conseil accepté n'est pas une vente.");
  });

  it("aucun accepté et aucune vente : pas de ligne", () => {
    expect(build({ funnel: funnel({ proposed: 10, accepted: 0 }) }).revenueLine).toBeNull();
  });

  it("des lignes de vente sans prix seulement : le dit au singulier comme au pluriel, sans chiffre d'affaires", () => {
    const f = funnel({ proposed: 10, accepted: 6, purchased: 2 });
    expect(build({ funnel: f, quality: quality({ unpricedConfirmedLines: 1 }) }).revenueLine).toBe(
      "1 ligne de vente n'a pas de prix saisi : aucun chiffre d'affaires n'est compté.",
    );
    expect(build({ funnel: f, quality: quality({ unpricedConfirmedLines: 3 }) }).revenueLine).toBe(
      "3 lignes de vente n'ont pas de prix saisi : aucun chiffre d'affaires n'est compté.",
    );
  });

  it("des conseils achetés dont la vente est datée hors période : l'horloge de la vente est expliquée", () => {
    const n = build({ funnel: funnel({ proposed: 10, accepted: 6, purchased: 2 }) });
    expect(n.revenueLine).toContain("datées hors de la période");
    expect(n.revenueLine).not.toContain("Aucune vente confirmée n'est enregistrée");
  });

  it("zéro conseil sur la période mais des ventes issues de conseils plus anciens : ne les cache pas", () => {
    const n = build({ revenue: revenue(12_000) });
    expect(n.headline).toBe("PharmaBoost n'a encore rien proposé à votre équipe sur cette période.");
    expect(plain(n.revenueLine)).toBe("Des ventes confirmées issues de conseils proposés avant cette période représentent 120,00 € TTC.");
  });
});

describe("constats : tendances", () => {
  it("n'affiche aucune tendance quand la période précédente est vide", () => {
    const n = build({
      funnel: funnel({ proposed: 10, accepted: 6, previousProposed: 0, previousRate: null }),
      revenue: revenue(10_000, 0),
    });
    expect(n.insights.filter((i) => i.kind === "revenue" || i.kind === "acceptance")).toEqual([]);
  });

  it("chiffre d'affaires en hausse, situé par rapport à la bonne période", () => {
    const base = { funnel: funnel({ proposed: 10, accepted: 5 }), revenue: revenue(15_000, 10_000) };
    expect(build({ ...base, period: period("today") }).insights[0]).toEqual({
      kind: "revenue",
      tone: "positive",
      text: "Le chiffre d'affaires attribué est en hausse de 50 % par rapport à hier à la même heure.",
    });
    expect(build({ ...base, period: period("7d") }).insights[0].text).toBe("Le chiffre d'affaires attribué est en hausse de 50 % par rapport aux 7 jours d'avant.");
    expect(build({ ...base, period: period("month") }).insights[0].text).toBe(
      "Le chiffre d'affaires attribué est en hausse de 50 % par rapport au mois dernier à la même date.",
    );
    expect(build({ ...base, period: period("custom", "Du 1 au 15 septembre 2026") }).insights[0].text).toBe(
      "Le chiffre d'affaires attribué est en hausse de 50 % par rapport à la période précédente.",
    );
  });

  it("chiffre d'affaires en baisse : ton d'attention", () => {
    const n = build({ funnel: funnel({ proposed: 10, accepted: 5 }), revenue: revenue(7_500, 10_000) });
    expect(n.insights[0]).toEqual({
      kind: "revenue",
      tone: "attention",
      text: "Le chiffre d'affaires attribué est en baisse de 25 % par rapport aux 7 jours d'avant.",
    });
  });

  it("arrondit la variation du chiffre d'affaires de façon symétrique : ±12,5 % s'écrit 13 % dans les deux sens, jamais 12 % à la baisse", () => {
    const f = funnel({ proposed: 10, accepted: 5 });
    expect(build({ funnel: f, revenue: revenue(9_000, 8_000) }).insights[0].text).toBe(
      "Le chiffre d'affaires attribué est en hausse de 13 % par rapport aux 7 jours d'avant.",
    );
    expect(build({ funnel: f, revenue: revenue(7_000, 8_000) }).insights[0].text).toBe(
      "Le chiffre d'affaires attribué est en baisse de 13 % par rapport aux 7 jours d'avant.",
    );
    // La dérive des flottants (14,5 % s'écrit 14,499… en machine) ne coûte pas un point.
    expect(build({ funnel: f, revenue: revenue(114_500, 100_000) }).insights[0].text).toContain("hausse de 15 %");
  });

  it("plus aucun chiffre d'affaires alors qu'il y en avait : le dit en euros, pas en -100 %", () => {
    const n = build({ funnel: funnel({ proposed: 10, accepted: 5 }), revenue: revenue(0, 15_000) });
    expect(plain(n.insights[0].text)).toBe("Aucun chiffre d'affaires attribué sur la période, contre 150,00 € TTC sur les 7 jours d'avant.");
    expect(n.insights[0].tone).toBe("attention");
  });

  it("ignore une variation du chiffre d'affaires qui s'arrondit à 0 %", () => {
    const n = build({ funnel: funnel({ proposed: 10, accepted: 5 }), revenue: revenue(100_100, 100_000) });
    expect(n.insights.some((i) => i.kind === "revenue")).toBe(false);
  });

  it("taux d'acceptation en hausse et en baisse", () => {
    const up = build({ funnel: funnel({ proposed: 20, accepted: 13, previousProposed: 20, previousRate: 0.55 }) });
    expect(up.insights).toContainEqual({
      kind: "acceptance",
      tone: "positive",
      text: "Le taux d'acceptation est en hausse : 65 % contre 55 % sur les 7 jours d'avant.",
    });
    const down = build({ funnel: funnel({ proposed: 20, accepted: 8, previousProposed: 20, previousRate: 0.55 }) });
    expect(down.insights).toContainEqual({
      kind: "acceptance",
      tone: "attention",
      text: "Le taux d'acceptation est en baisse : 40 % contre 55 % sur les 7 jours d'avant.",
    });
  });

  it("ne commente pas un taux stable, ni un taux calculé sur trop peu de conseils", () => {
    const stable = build({ funnel: funnel({ proposed: 20, accepted: 11, previousProposed: 20, previousRate: 0.548 }) });
    expect(stable.insights.some((i) => i.kind === "acceptance")).toBe(false);
    const tiny = build({ funnel: funnel({ proposed: 2, accepted: 2, previousProposed: 2, previousRate: 0.5 }) });
    expect(tiny.insights.some((i) => i.kind === "acceptance")).toBe(false);
  });

  describe("la tendance du taux repose sur au moins 3 conseils TRANCHÉS, des deux côtés", () => {
    const acceptance = (n: ReturnType<typeof build>) => n.insights.find((i) => i.kind === "acceptance");

    it("3 conseils proposés dont 2 en attente (1 seul tranché, accepté) : aucun « en hausse », aucun taux de 100 %", () => {
      // Hier à la même heure : 5 acceptés sur 10 (taux 50 %). Aujourd'hui : 1 tranché sur 3 proposés.
      const n = build({
        period: period("today", "Aujourd'hui"),
        funnel: funnel({ proposed: 3, pending: 2, accepted: 1, previousProposed: 10, previousRate: 0.5 }),
      });
      expect(acceptance(n)).toBeUndefined();
      expect(n.insights.map((i) => i.text).join(" ")).not.toMatch(/taux d'acceptation/);
      // Le titre, lui, reste honnête sur ce qu'il compte.
      expect(n.headline).toContain("100 % sur 1 conseil tranché");
    });

    it("côté courant : 2 tranchés (5 proposés, 3 en attente) ne suffisent pas, 3 tranchés (5 proposés, 2 en attente) suffisent", () => {
      const two = build({ funnel: funnel({ proposed: 5, pending: 3, accepted: 2, previousProposed: 20, previousRate: 0.5 }) });
      expect(acceptance(two)).toBeUndefined();
      const three = build({ funnel: funnel({ proposed: 5, pending: 2, accepted: 3, previousProposed: 20, previousRate: 0.5 }) });
      expect(acceptance(three)).toEqual({
        kind: "acceptance",
        tone: "positive",
        text: "Le taux d'acceptation est en hausse : 100 % contre 50 % sur les 7 jours d'avant.",
      });
    });

    it("côté précédent : 2 conseils proposés avant ne suffisent pas, 3 suffisent", () => {
      const two = build({ funnel: funnel({ proposed: 20, accepted: 13, previousProposed: 2, previousRate: 0.5 }) });
      expect(acceptance(two)).toBeUndefined();
      const three = build({ funnel: funnel({ proposed: 20, accepted: 13, previousProposed: 3, previousRate: 0.5 }) });
      expect(acceptance(three)?.text).toBe("Le taux d'acceptation est en hausse : 65 % contre 50 % sur les 7 jours d'avant.");
    });

    it("beaucoup de conseils proposés mais presque tous en attente : pas de tendance non plus (proposé ≥ 3 ne suffit pas)", () => {
      const n = build({ funnel: funnel({ proposed: 40, pending: 39, accepted: 1, previousProposed: 20, previousRate: 0.5 }) });
      expect(acceptance(n)).toBeUndefined();
    });
  });
});

describe("un seul arrondi au pourcent entier (pctText), le même que l'interface", () => {
  it("arrondit le demi-point vers le haut, sans la dérive des flottants (le titre disait 57 % là où les cartes disent 58 %)", () => {
    // Math.round(rate * 100) sans correctif donne 57 pour tous ces cas : 57,4999… en machine, 57,5 en vrai.
    expect(pctText(23 / 40)).toBe("58 %");
    expect(pctText(69 / 120)).toBe("58 %");
    expect(pctText(115 / 200)).toBe("58 %");
    expect(pctText(29 / 200)).toBe("15 %");
    expect(pctText(57 / 200)).toBe("29 %");
    expect(pctText(20 / 32)).toBe("63 %"); // 62,5 → 63, comme la console doit l'écrire
  });

  it("garde 0 % et 100 % aux extrémités, jamais au-delà, jamais de NaN", () => {
    expect(pctText(0)).toBe("0 %");
    expect(pctText(1)).toBe("100 %");
    expect(pctText(1.2)).toBe("100 %");
    expect(pctText(-0.2)).toBe("0 %");
    expect(pctText(Number.NaN)).toBe("—");
    expect(pctText(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("donne exactement le pourcentage entier de Intl (fr-FR, demi vers le haut) pour tout rapport n/d jusqu'à d = 400", () => {
    const intl = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
    const mismatches: string[] = [];
    for (let d = 1; d <= 400; d += 1) {
      for (let n = 0; n <= d; n += 1) {
        if (plain(intl.format(n / d)) !== pctText(n / d)) mismatches.push(`${n}/${d}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("le titre et les constats écrivent le même pourcentage : 23 conseils acceptés sur 40 tranchés = 58 %", () => {
    const n = build({ period: period("today", "Aujourd'hui"), funnel: funnel({ proposed: 40, accepted: 23 }) });
    expect(n.headline).toBe("Aujourd'hui, PharmaBoost a proposé 40 conseils à votre équipe : 23 ont été acceptés (58 %).");
    const trend = build({ funnel: funnel({ proposed: 40, accepted: 23, previousProposed: 40, previousRate: 0.4 }) });
    expect(trend.insights).toContainEqual({
      kind: "acceptance",
      tone: "positive",
      text: "Le taux d'acceptation est en hausse : 58 % contre 40 % sur les 7 jours d'avant.",
    });
  });

  it("le meilleur jour et la meilleure fenêtre arrondissent de la même façon (57,5 % → 58 %)", () => {
    const n = build({
      rhythm: {
        ...RHYTHM,
        bestWeekday: { weekday: 1, label: "Mardi", acceptanceRate: 23 / 40, decided: 40 },
        bestWindow: { fromHour: 14, toHour: 16, acceptanceRate: 69 / 120, decided: 120 },
      },
    });
    expect(n.insights.map((i) => i.text)).toEqual([
      "C'est le mardi que vos conseils sont le plus souvent acceptés (58 % sur les 90 derniers jours).",
      "Entre 14 h et 16 h, vos conseils sont acceptés dans 58 % des cas (90 derniers jours).",
    ]);
  });
});

describe("constats : produits, univers, rythme", () => {
  const products = [
    product({ key: "p:a", label: "Crème réparatrice", category: "DERMO", proposed: 8, accepted: 6, purchased: 4, unitsSold: 4, revenueTtcCents: 5_600 }),
    product({ key: "p:b", label: "Spray nasal", category: "ORL", proposed: 9, accepted: 7, purchased: 2, unitsSold: 2, revenueTtcCents: 2_400 }),
  ];
  const universes = [
    universe({ category: "DERMO", label: "Dermo-cosmétique", accepted: 6, revenueTtcCents: 5_600 }),
    universe({ category: "ORL", label: "ORL", accepted: 7, revenueTtcCents: 2_400 }),
  ];

  it("cite le produit qui rapporte le plus, d'après le chiffre d'affaires et non l'ordre reçu", () => {
    const n = build({ funnel: funnel({ proposed: 20, accepted: 13 }), products: [...products].reverse() });
    const insight = n.insights.find((i) => i.kind === "product");
    expect(insight?.tone).toBe("positive");
    expect(plain(insight?.text)).toBe("Crème réparatrice est le produit en tête : 56,00 € TTC de ventes confirmées.");
  });

  it("sans chiffre d'affaires : cite le produit le plus accepté, sans parler de vente", () => {
    const noSales = products.map((p) => ({ ...p, revenueTtcCents: 0, purchased: 0, unitsSold: 0 }));
    const n = build({ funnel: funnel({ proposed: 20, accepted: 13 }), products: noSales });
    const insight = n.insights.find((i) => i.kind === "product");
    expect(insight?.text).toBe("Spray nasal est le produit le plus accepté par votre équipe (7 fois).");
    expect(insight?.text).not.toMatch(/vendu|vente|confirm/i);
  });

  it("ne met jamais « Produit retiré du catalogue » en tête", () => {
    const removed = product({ key: "p:gone", label: "Produit retiré du catalogue", proposed: 3, accepted: 3, purchased: 3, unitsSold: 3, revenueTtcCents: 99_900 });
    const n = build({ funnel: funnel({ proposed: 20, accepted: 13 }), products: [removed, ...products] });
    expect(n.insights.find((i) => i.kind === "product")?.text).toContain("Crème réparatrice");
    const onlyRemoved = build({ funnel: funnel({ proposed: 20, accepted: 13 }), products: [removed] });
    expect(onlyRemoved.insights.some((i) => i.kind === "product")).toBe(false);
  });

  it("cite l'univers en tête quand il y en a plusieurs", () => {
    const n = build({ funnel: funnel({ proposed: 20, accepted: 13 }), universes });
    expect(plain(n.insights.find((i) => i.kind === "universe")?.text)).toBe("Dermo-cosmétique est l'univers en tête : 56,00 € TTC de ventes confirmées.");
  });

  it("ne dit pas deux fois la même chose : le produit en tête est tout l'univers en tête", () => {
    const solo = [product({ key: "p:a", label: "Crème réparatrice", category: "DERMO", accepted: 6, revenueTtcCents: 5_600 })];
    const n = build({ funnel: funnel({ proposed: 20, accepted: 13 }), products: solo, universes });
    expect(n.insights.some((i) => i.kind === "product")).toBe(true);
    expect(n.insights.some((i) => i.kind === "universe")).toBe(false);
  });

  it("ne cite pas un univers unique", () => {
    const n = build({ funnel: funnel({ proposed: 20, accepted: 13 }), universes: [universes[0]] });
    expect(n.insights.some((i) => i.kind === "universe")).toBe(false);
  });

  it("meilleur jour et meilleure fenêtre seulement si le rythme a assez de données", () => {
    const f = funnel({ proposed: 20, accepted: 13 });
    expect(build({ funnel: f, rhythm: NO_RHYTHM }).insights).toEqual([]);
    const n = build({ funnel: f, rhythm: RHYTHM });
    expect(n.insights).toEqual([
      { kind: "weekday", tone: "neutral", text: "C'est le mardi que vos conseils sont le plus souvent acceptés (74 % sur les 90 derniers jours)." },
      { kind: "window", tone: "neutral", text: "Entre 14 h et 16 h, vos conseils sont acceptés dans 71 % des cas (90 derniers jours)." },
    ]);
  });

  it("une fenêtre qui finit à minuit le dit", () => {
    const rhythm: RhythmStats = { ...RHYTHM, bestWeekday: null, bestWindow: { fromHour: 22, toHour: 24, acceptanceRate: 0.5, decided: 12 } };
    const n = build({ funnel: funnel({ proposed: 20, accepted: 13 }), rhythm });
    expect(n.insights[0].text).toBe("Entre 22 h et minuit, vos conseils sont acceptés dans 50 % des cas (90 derniers jours).");
  });
});

describe("constats : alerte, ordre et plafond", () => {
  it("alerte sur les lignes de vente sans prix quand le chiffre d'affaires existe", () => {
    const f = funnel({ proposed: 10, accepted: 5 });
    const many = build({ funnel: f, revenue: revenue(10_000), quality: quality({ unpricedConfirmedLines: 3 }) });
    expect(many.insights).toEqual([
      { kind: "data", tone: "attention", text: "3 lignes de vente sans prix ne sont pas comptées dans le chiffre d'affaires." },
    ]);
    const one = build({ funnel: f, revenue: revenue(10_000), quality: quality({ unpricedConfirmedLines: 1 }) });
    expect(one.insights[0].text).toBe("1 ligne de vente sans prix n'est pas comptée dans le chiffre d'affaires.");
  });

  it("sans chiffre d'affaires, la seconde phrase porte déjà l'alerte : pas de doublon", () => {
    const n = build({ funnel: funnel({ proposed: 10, accepted: 5 }), quality: quality({ unpricedConfirmedLines: 3 }) });
    expect(n.revenueLine).toContain("3 lignes de vente n'ont pas de prix saisi");
    expect(n.insights.some((i) => i.kind === "data")).toBe(false);
  });

  const everything: Partial<NarrativeInput> = {
    funnel: funnel({ proposed: 20, accepted: 13, previousProposed: 20, previousRate: 0.55 }),
    revenue: revenue(15_000, 10_000),
    // Le produit en tête ne fait pas tout l'univers en tête : les deux constats se justifient.
    products: [product({ key: "p:a", label: "Crème réparatrice", category: "DERMO", accepted: 6, revenueTtcCents: 5_000 })],
    universes: [
      universe({ category: "DERMO", label: "Dermo-cosmétique", accepted: 6, revenueTtcCents: 9_000 }),
      universe({ category: "ORL", label: "ORL", accepted: 7, revenueTtcCents: 6_000 }),
    ],
    rhythm: RHYTHM,
    quality: quality({ unpricedConfirmedLines: 2 }),
  };

  it("au plus quatre constats, l'alerte de fiabilité garde sa place mais s'affiche en dernier", () => {
    const n = build(everything);
    expect(n.insights).toHaveLength(4);
    expect(n.insights.map((i) => i.kind)).toEqual(["revenue", "acceptance", "product", "data"]);
  });

  it("sans l'alerte, les quatre premiers constats par intérêt", () => {
    const n = build({ ...everything, quality: quality() });
    expect(n.insights.map((i) => i.kind)).toEqual(["revenue", "acceptance", "product", "universe"]);
  });

  it("aucun constat n'est répété", () => {
    const texts = build(everything).insights.map((i) => i.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("ne modifie pas ce qu'on lui donne", () => {
    const products = [
      product({ key: "p:b", label: "B", accepted: 1, revenueTtcCents: 100 }),
      product({ key: "p:a", label: "A", accepted: 1, revenueTtcCents: 900 }),
    ];
    const before = JSON.stringify(products);
    build({ funnel: funnel({ proposed: 5, accepted: 2 }), products });
    expect(JSON.stringify(products)).toBe(before);
  });
});
