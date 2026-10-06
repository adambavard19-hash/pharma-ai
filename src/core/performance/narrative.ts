import { formatCents, formatNumber } from "@/lib/format";
import { MIN_DECIDED_FOR_RATE } from "./definitions";
import type {
  DataQuality,
  FunnelStats,
  Insight,
  Narrative,
  PerformancePeriod,
  PerformancePeriodKey,
  ProductRow,
  RevenueStats,
  RhythmStats,
  UniverseRow,
} from "./types";

/**
 * La narration : deux phrases et au plus quatre constats, tous tirés des
 * chiffres du rapport, jamais inventés.
 *
 * Trois règles d'honnêteté structurent les textes :
 *  - un conseil ACCEPTÉ n'est pas une vente : le mot « confirmée » ne qualifie
 *    que des ventes, jamais des conseils ;
 *  - un mot, une unité : « ventes confirmées » = des tickets ; ce qui compte des
 *    lignes s'appelle « lignes de vente » ; ce qui compte des conseils, « conseils achetés » ;
 *  - les conseils et le chiffre d'affaires n'ont pas la même horloge (date de
 *    proposition / date de vente) : ils vivent dans deux phrases séparées, sans
 *    prétendre qu'ils se correspondent ligne à ligne.
 */

/** Le regroupement des lignes dont le produit a disparu du catalogue : jamais cité comme « produit en tête ». */
const REMOVED_PRODUCT_LABEL = "Produit retiré du catalogue";
const MAX_INSIGHTS = 4;

export type NarrativeInput = {
  period: PerformancePeriod;
  funnel: FunnelStats;
  revenue: RevenueStats;
  products: ProductRow[];
  universes: UniverseRow[];
  rhythm: RhythmStats;
  quality: DataQuality;
  now: Date;
};

// --- Petits outils de langue --------------------------------------------------

/** Accord français : 0 et 1 au singulier. */
function count(n: number, one: string, many: string = `${one}s`): string {
  return `${formatNumber(n)} ${Math.abs(n) < 2 ? one : many}`;
}

/**
 * Un taux (0 → 1) en pourcentage ENTIER, jamais au-delà de 100 % : la seule
 * règle d'arrondi du lot, reprise par l'interface et la console (un pourcentage
 * ne change pas d'un écran à l'autre). Le `1e-9` absorbe la dérive des flottants :
 * 23 sur 40 vaut 57,4999… en machine, 57,5 en vrai, donc « 58 % » (demi-point vers le haut).
 * `—` quand le taux n'est pas un nombre.
 */
export function pctText(rate: number): string {
  if (!Number.isFinite(rate)) return "—";
  return `${Math.min(100, Math.max(0, Math.round(rate * 100 + 1e-9)))} %`;
}

function periodPrefix(period: PerformancePeriod): string {
  switch (period.key) {
    case "today":
      return "Aujourd'hui";
    case "7d":
      return "Sur les 7 derniers jours";
    case "month":
      return "Ce mois-ci";
    default: {
      const label = period.label.trim();
      return label ? label[0].toUpperCase() + label.slice(1) : "Sur cette période";
    }
  }
}

/** « par rapport à hier à la même heure » : la comparaison, dite en toutes lettres. */
function comparedTo(key: PerformancePeriodKey): string {
  switch (key) {
    case "today":
      return "par rapport à hier à la même heure";
    case "7d":
      return "par rapport aux 7 jours d'avant";
    case "month":
      return "par rapport au mois dernier à la même date";
    default:
      return "par rapport à la période précédente";
  }
}

/** « contre 150 € hier à la même heure » : la valeur d'avant, située. */
function previousSpan(key: PerformancePeriodKey): string {
  switch (key) {
    case "today":
      return "hier à la même heure";
    case "7d":
      return "sur les 7 jours d'avant";
    case "month":
      return "le mois dernier à la même date";
    default:
      return "sur la période précédente";
  }
}

/** « 14 h » ; une fenêtre qui finit à 24 h (ou 0 h) finit à « minuit ». */
function hourText(hour: number, end = false): string {
  return end && hour % 24 === 0 ? "minuit" : `${hour} h`;
}

// --- Les deux phrases ---------------------------------------------------------

function buildHeadline(period: PerformancePeriod, funnel: FunnelStats): string {
  const proposed = funnel.proposed.value;
  if (proposed <= 0) return "PharmaBoost n'a encore rien proposé à votre équipe sur cette période.";

  const opening = `${periodPrefix(period)}, PharmaBoost a proposé ${count(proposed, "conseil")} à votre équipe`;
  const pending = Math.max(0, Math.min(funnel.pending, proposed));
  const decided = proposed - pending;
  if (decided === 0) {
    return `${opening} : ${proposed === 1 ? "il est en attente de réponse" : "ils sont tous en attente de réponse"}.`;
  }

  const accepted = funnel.accepted.value;
  let acceptedText: string;
  if (accepted === 0) acceptedText = proposed === 1 ? "il n'a pas été accepté" : "aucun n'a été accepté";
  else if (accepted === 1) acceptedText = proposed === 1 ? "il a été accepté" : "1 a été accepté";
  else acceptedText = `${formatNumber(accepted)} ont été acceptés`;

  // Le taux se calcule sur les conseils tranchés : quand certains attendent encore une réponse,
  // on le dit, pour que « 21 sur 34 » et « 70 % » ne se contredisent pas à l'œil.
  const rate = funnel.acceptanceRate.value;
  const parts: string[] = [];
  if (rate !== null) {
    parts.push(pending > 0 ? `${pctText(rate)} ${decided === 1 ? "sur 1 conseil tranché" : `des ${formatNumber(decided)} conseils tranchés`}` : pctText(rate));
  }
  if (pending > 0) parts.push(`${formatNumber(pending)} encore en attente`);
  return `${opening} : ${acceptedText}${parts.length ? ` (${parts.join(", ")})` : ""}.`;
}

function buildRevenueLine(funnel: FunnelStats, revenue: RevenueStats, quality: DataQuality): string | null {
  const revenueCents = revenue.confirmedTtcCents.value;
  const unpriced = quality.unpricedConfirmedLines;
  if (revenueCents > 0) {
    return funnel.proposed.value > 0
      ? `Les ventes confirmées issues de conseils PharmaBoost représentent ${formatCents(revenueCents)} TTC sur la période.`
      : `Des ventes confirmées issues de conseils proposés avant cette période représentent ${formatCents(revenueCents)} TTC.`;
  }
  if (unpriced > 0) {
    return `${count(unpriced, "ligne de vente", "lignes de vente")} ${unpriced === 1 ? "n'a" : "n'ont"} pas de prix saisi : aucun chiffre d'affaires n'est compté.`;
  }
  if (funnel.purchased.value > 0) {
    return "Les ventes confirmées liées à ces conseils sont datées hors de la période : le chiffre d'affaires est compté à la date de la vente.";
  }
  if (funnel.accepted.value > 0) {
    return "Aucune vente confirmée n'est enregistrée pour l'instant : un conseil accepté n'est pas une vente.";
  }
  return null;
}

// --- Les constats -------------------------------------------------------------

type Candidate = {
  /** Qui garde sa place quand il y a plus de quatre constats (petit = prioritaire). */
  priority: number;
  /** Où il s'affiche une fois la sélection faite (petit = en haut). */
  order: number;
  insight: Insight;
};

function revenueTrend(period: PerformancePeriod, revenue: RevenueStats): Candidate | null {
  const { value, previous } = revenue.confirmedTtcCents;
  if (previous <= 0) return null; // période précédente vide : pas de pourcentage, pas de tendance
  const key = period.key;
  if (value <= 0) {
    return {
      priority: 1,
      order: 1,
      insight: {
        kind: "revenue",
        tone: "attention",
        text: `Aucun chiffre d'affaires attribué sur la période, contre ${formatCents(previous)} TTC ${previousSpan(key)}.`,
      },
    };
  }
  // Arrondi symétrique autour de zéro, comme `Intl` et `metrics.ts` : −12,5 % s'écrit « baisse de 13 % » comme +12,5 % « hausse de 13 % ».
  const rawChange = ((value - previous) / previous) * 100;
  const change = Math.sign(rawChange) * Math.round(Math.abs(rawChange) + 1e-9) + 0;
  if (change === 0) return null;
  const up = change > 0;
  return {
    priority: 1,
    order: 1,
    insight: {
      kind: "revenue",
      tone: up ? "positive" : "attention",
      text: `Le chiffre d'affaires attribué est en ${up ? "hausse" : "baisse"} de ${formatNumber(Math.abs(change))} % ${comparedTo(key)}.`,
    },
  };
}

function acceptanceTrend(period: PerformancePeriod, funnel: FunnelStats): Candidate | null {
  const { value, previous } = funnel.acceptanceRate;
  if (value === null || previous === null) return null;
  // Un taux sur un ou deux conseils ne veut rien dire : même seuil que les séries, sur les conseils
  // TRANCHÉS (les conseils en attente, proposés depuis moins de 24 h, sont hors du taux), des deux côtés.
  // La période précédente est terminée : plus rien n'y est en attente, `proposed.previous` y est le tranché.
  const decided = funnel.proposed.value - funnel.pending;
  if (decided < MIN_DECIDED_FOR_RATE || funnel.proposed.previous < MIN_DECIDED_FOR_RATE) return null;
  const delta = (value - previous) * 100;
  if (Math.abs(delta) < 0.5 || pctText(value) === pctText(previous)) return null;
  const up = delta > 0;
  return {
    priority: 2,
    order: 2,
    insight: {
      kind: "acceptance",
      tone: up ? "positive" : "attention",
      text: `Le taux d'acceptation est en ${up ? "hausse" : "baisse"} : ${pctText(value)} contre ${pctText(previous)} ${previousSpan(period.key)}.`,
    },
  };
}

type Leader = { mode: "revenue" | "accepted"; category: string; value: number };

function productInsight(products: ProductRow[]): { candidate: Candidate; leader: Leader } | null {
  const usable = products.filter((p) => p.label !== REMOVED_PRODUCT_LABEL);
  const byRevenue = usable
    .filter((p) => p.revenueTtcCents > 0)
    .sort((a, b) => b.revenueTtcCents - a.revenueTtcCents || b.accepted - a.accepted || b.proposed - a.proposed);
  if (byRevenue.length > 0) {
    const top = byRevenue[0];
    return {
      leader: { mode: "revenue", category: top.category, value: top.revenueTtcCents },
      candidate: {
        priority: 3,
        order: 3,
        insight: {
          kind: "product",
          tone: "positive",
          text: `${top.label} est le produit en tête : ${formatCents(top.revenueTtcCents)} TTC de ventes confirmées.`,
        },
      },
    };
  }
  const byAccepted = usable.filter((p) => p.accepted > 0).sort((a, b) => b.accepted - a.accepted || b.proposed - a.proposed);
  if (byAccepted.length === 0) return null;
  const top = byAccepted[0];
  return {
    leader: { mode: "accepted", category: top.category, value: top.accepted },
    candidate: {
      priority: 3,
      order: 3,
      insight: {
        kind: "product",
        tone: "neutral",
        text: `${top.label} est le produit le plus accepté par votre équipe (${count(top.accepted, "fois", "fois")}).`,
      },
    },
  };
}

function universeInsight(universes: UniverseRow[], productLeader: Leader | null): Candidate | null {
  if (universes.length < 2) return null; // un seul univers : « en tête » ne dit rien
  const byRevenue = [...universes]
    .filter((u) => u.revenueTtcCents > 0)
    .sort((a, b) => b.revenueTtcCents - a.revenueTtcCents || b.accepted - a.accepted);
  const byAccepted = [...universes].filter((u) => u.accepted > 0).sort((a, b) => b.accepted - a.accepted || b.proposed - a.proposed);
  const top = byRevenue[0] ?? byAccepted[0];
  if (!top) return null;
  const mode = byRevenue.length > 0 ? "revenue" : "accepted";
  const value = mode === "revenue" ? top.revenueTtcCents : top.accepted;
  // Le produit en tête est tout l'univers : le dire deux fois serait redondant.
  if (productLeader && productLeader.mode === mode && productLeader.category === top.category && productLeader.value === value) return null;
  return {
    priority: 4,
    order: 4,
    insight: {
      kind: "universe",
      tone: mode === "revenue" ? "positive" : "neutral",
      text:
        mode === "revenue"
          ? `${top.label} est l'univers en tête : ${formatCents(top.revenueTtcCents)} TTC de ventes confirmées.`
          : `${top.label} est l'univers où vos conseils sont le plus acceptés (${count(top.accepted, "fois", "fois")}).`,
    },
  };
}

function rhythmInsights(rhythm: RhythmStats): Candidate[] {
  if (!rhythm.enoughData) return [];
  const found: Candidate[] = [];
  if (rhythm.bestWeekday) {
    found.push({
      priority: 5,
      order: 5,
      insight: {
        kind: "weekday",
        tone: "neutral",
        text: `C'est le ${rhythm.bestWeekday.label.toLowerCase()} que vos conseils sont le plus souvent acceptés (${pctText(rhythm.bestWeekday.acceptanceRate)} sur les ${rhythm.windowDays} derniers jours).`,
      },
    });
  }
  if (rhythm.bestWindow) {
    found.push({
      priority: 6,
      order: 6,
      insight: {
        kind: "window",
        tone: "neutral",
        text: `Entre ${hourText(rhythm.bestWindow.fromHour)} et ${hourText(rhythm.bestWindow.toHour, true)}, vos conseils sont acceptés dans ${pctText(rhythm.bestWindow.acceptanceRate)} des cas (${rhythm.windowDays} derniers jours).`,
      },
    });
  }
  return found;
}

function unpricedAlert(revenue: RevenueStats, quality: DataQuality): Candidate | null {
  const unpriced = quality.unpricedConfirmedLines;
  // Sans chiffre d'affaires, la seconde phrase le dit déjà : pas de doublon.
  if (unpriced <= 0 || revenue.confirmedTtcCents.value <= 0) return null;
  return {
    priority: 0, // une réserve sur la fiabilité du chiffre garde toujours sa place
    order: 7, // mais s'affiche en dernier, après les bonnes nouvelles
    insight: {
      kind: "data",
      tone: "attention",
      text:
        unpriced === 1
          ? "1 ligne de vente sans prix n'est pas comptée dans le chiffre d'affaires."
          : `${formatNumber(unpriced)} lignes de vente sans prix ne sont pas comptées dans le chiffre d'affaires.`,
    },
  };
}

function buildInsights(input: NarrativeInput): Insight[] {
  const product = productInsight(input.products);
  const candidates = [
    unpricedAlert(input.revenue, input.quality),
    revenueTrend(input.period, input.revenue),
    acceptanceTrend(input.period, input.funnel),
    product?.candidate ?? null,
    universeInsight(input.universes, product?.leader ?? null),
    ...rhythmInsights(input.rhythm),
  ].filter((c): c is Candidate => c !== null);

  return candidates
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_INSIGHTS)
    .sort((a, b) => a.order - b.order)
    .map((c) => c.insight);
}

export function buildNarrative(input: NarrativeInput): Narrative {
  return {
    headline: buildHeadline(input.period, input.funnel),
    revenueLine: buildRevenueLine(input.funnel, input.revenue, input.quality),
    insights: buildInsights(input),
  };
}
