import { challengeWindow, daysBetween, isInWindow, toDayKey, DEFAULT_TIME_ZONE, type DayKey } from "./dates";
import { nextTier, rewardModeOf, tierReached, type ChallengeTier, type RewardMode } from "./terms";

/**
 * La progression d'un challenge laboratoire.
 *
 * Tout part de faits enregistrés : les lignes de vente de PharmaBoost (déjà
 * restreintes par le service aux produits concernés et à la période) et les
 * unités saisies à la main par le titulaire. Rien n'est estimé ni complété :
 * un challenge sans vente affiche zéro, pas une tendance inventée.
 *
 * Ce calcul est commercial. Il n'est jamais lu par le moteur de conseil ni
 * affiché au comptoir : il vit dans Paramètres et dans le Pilotage du titulaire.
 */

export type ChallengeCountMode = "ALL_SALES" | "ATTRIBUTED";
export type ChallengeStatusCode = "ACTIVE" | "ENDED" | "ARCHIVED";
/** Ce que l'écran affiche : le statut enregistré croisé avec les dates. */
export type EffectiveStatus = "UPCOMING" | "RUNNING" | "ENDED" | "ARCHIVED";

export const EFFECTIVE_STATUS_LABELS: Record<EffectiveStatus, string> = {
  UPCOMING: "À venir",
  RUNNING: "En cours",
  ENDED: "Terminé",
  ARCHIVED: "Archivé",
};

export const COUNT_MODE_LABELS: Record<ChallengeCountMode, string> = {
  ALL_SALES: "Toutes les ventes enregistrées",
  ATTRIBUTED: "Seulement les ventes issues d'un conseil PharmaBoost",
};

/** En deçà, le rythme observé ne dit rien de la fin du challenge : pas de projection. */
export const MIN_DAYS_FOR_PROJECTION = 3;

export type ChallengeTerms = {
  startsOn: Date | string;
  endsOn: Date | string;
  status: ChallengeStatusCode;
  countMode: ChallengeCountMode;
  targetUnits: number | null;
  bonusPerUnitCents: number | null;
  tiers: ChallengeTier[] | null;
  /** Fuseau de l'officine, pour les bornes de la période. */
  timeZone?: string;
};

/** Une ligne de vente d'un produit concerné. `attributed` : issue d'un conseil PharmaBoost. */
export type ChallengeSaleLine = {
  productId: string | null;
  presentationId: string | null;
  quantity: number;
  userId: string | null;
  createdAt: Date;
  attributed: boolean;
};

export type ChallengeManualEntry = { units: number; occurredOn: Date | string };

/** Unités vendues pour une clé (produit ou collaborateur). `counted` suit le mode de comptage. */
export type UnitsBreakdown = { key: string; units: number; attributedUnits: number; counted: number };

export type ChallengeProgress = {
  effectiveStatus: EffectiveStatus;
  /** Unités retenues : ventes comptées + saisies manuelles de la période. Jamais négatif. */
  units: number;
  /** Ventes comptées selon le mode (toutes, ou seulement celles issues d'un conseil). */
  salesUnits: number;
  /** Saisies manuelles datées dans la période. */
  manualUnits: number;
  /** Saisies datées hors de la période (dates du challenge modifiées depuis) : ignorées. */
  ignoredManualUnits: number;
  /** Toutes les ventes enregistrées, et celles issues d'un conseil — pour information. */
  allSalesUnits: number;
  attributedSalesUnits: number;
  /** Part des ventes enregistrées dans les unités retenues (0 à 1). Null sans unité. */
  salesShare: number | null;
  /** L'objectif retenu : celui saisi, sinon le dernier palier. */
  target: number | null;
  targetIsImplicit: boolean;
  /** Unités / objectif (peut dépasser 1). Null sans objectif. */
  ratio: number | null;
  rewardMode: RewardMode;
  /** Ce que rapporterait l'objectif atteint. Null sans prime, ou sans objectif pour une prime par unité. */
  potentialCents: number | null;
  /** Ce qui est acquis aujourd'hui. Null sans prime. */
  earnedCents: number | null;
  reachedTier: ChallengeTier | null;
  nextTier: ChallengeTier | null;
  unitsToNextTier: number | null;
  daysTotal: number;
  daysElapsed: number;
  /** Jours restants, aujourd'hui compris (1 le dernier jour). */
  daysRemaining: number;
  daysUntilStart: number;
  /** Unités en fin de challenge au rythme observé. Seulement en cours, après quelques jours. */
  projectedUnits: number | null;
  byProduct: UnitsBreakdown[];
  byUser: UnitsBreakdown[];
};

/** Le statut à afficher : un challenge actif est « à venir » avant son début et « terminé » après sa fin. */
export function effectiveStatusOf(terms: Pick<ChallengeTerms, "startsOn" | "endsOn" | "status">, today: DayKey): EffectiveStatus {
  if (terms.status === "ARCHIVED") return "ARCHIVED";
  if (terms.status === "ENDED") return "ENDED";
  if (daysBetween(today, terms.startsOn) > 0) return "UPCOMING";
  if (daysBetween(terms.endsOn, today) > 0) return "ENDED";
  return "RUNNING";
}

function breakdown(lines: ChallengeSaleLine[], keyOf: (line: ChallengeSaleLine) => string, countMode: ChallengeCountMode): UnitsBreakdown[] {
  const map = new Map<string, UnitsBreakdown>();
  for (const line of lines) {
    const key = keyOf(line);
    const entry = map.get(key) ?? { key, units: 0, attributedUnits: 0, counted: 0 };
    entry.units += line.quantity;
    if (line.attributed) entry.attributedUnits += line.quantity;
    if (countMode === "ALL_SALES" || line.attributed) entry.counted += line.quantity;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.counted - a.counted || b.units - a.units || a.key.localeCompare(b.key));
}

export function computeChallengeProgress(input: {
  terms: ChallengeTerms;
  lines: ChallengeSaleLine[];
  entries: ChallengeManualEntry[];
  today: DayKey;
}): ChallengeProgress {
  const { terms, entries } = input;
  const today = toDayKey(input.today);
  const startsOn = toDayKey(terms.startsOn);
  const endsOn = toDayKey(terms.endsOn);
  const window = challengeWindow(startsOn, endsOn, terms.timeZone ?? DEFAULT_TIME_ZONE);

  // Les lignes arrivent filtrées ; on revérifie la période pour qu'une
  // requête trop large ne gonfle jamais un challenge.
  const lines = input.lines.filter((line) => isInWindow(line.createdAt, window));

  let allSalesUnits = 0;
  let attributedSalesUnits = 0;
  for (const line of lines) {
    allSalesUnits += line.quantity;
    if (line.attributed) attributedSalesUnits += line.quantity;
  }
  const salesUnits = terms.countMode === "ATTRIBUTED" ? attributedSalesUnits : allSalesUnits;

  let manualUnits = 0;
  let ignoredManualUnits = 0;
  for (const entry of entries) {
    const day = toDayKey(entry.occurredOn);
    const inside = daysBetween(startsOn, day) >= 0 && daysBetween(day, endsOn) >= 0;
    if (inside) manualUnits += entry.units;
    else ignoredManualUnits += entry.units;
  }

  const units = Math.max(0, salesUnits + manualUnits);
  const salesShare = units > 0 ? Math.min(1, Math.max(0, salesUnits / units)) : null;

  const tiers = [...(terms.tiers ?? [])].sort((a, b) => a.units - b.units);
  const rewardMode = rewardModeOf({ bonusPerUnitCents: terms.bonusPerUnitCents, tiers });
  const explicitTarget = terms.targetUnits !== null && terms.targetUnits > 0 ? terms.targetUnits : null;
  const target = explicitTarget ?? (rewardMode === "TIERS" ? tiers[tiers.length - 1].units : null);
  const ratio = target ? units / target : null;

  let potentialCents: number | null = null;
  let earnedCents: number | null = null;
  let reached: ChallengeTier | null = null;
  let next: ChallengeTier | null = null;
  if (rewardMode === "PER_UNIT") {
    const bonus = terms.bonusPerUnitCents ?? 0;
    potentialCents = explicitTarget !== null ? explicitTarget * bonus : null;
    earnedCents = units * bonus;
  } else if (rewardMode === "TIERS") {
    reached = tierReached(tiers, units);
    next = nextTier(tiers, units);
    potentialCents = explicitTarget !== null ? (tierReached(tiers, explicitTarget)?.bonusCents ?? 0) : tiers[tiers.length - 1].bonusCents;
    earnedCents = reached?.bonusCents ?? 0;
  }

  const effectiveStatus = effectiveStatusOf({ startsOn, endsOn, status: terms.status }, today);
  const daysTotal = Math.max(0, daysBetween(startsOn, endsOn) + 1);
  const daysElapsed = Math.min(daysTotal, Math.max(0, daysBetween(startsOn, today) + 1));
  const daysRemaining = effectiveStatus === "RUNNING" ? daysBetween(today, endsOn) + 1 : effectiveStatus === "UPCOMING" ? daysTotal : 0;
  const daysUntilStart = effectiveStatus === "UPCOMING" ? daysBetween(today, startsOn) : 0;
  const projectedUnits =
    effectiveStatus === "RUNNING" && daysElapsed >= MIN_DAYS_FOR_PROJECTION && daysTotal > 0
      ? Math.round((units / daysElapsed) * daysTotal)
      : null;

  return {
    effectiveStatus,
    units,
    salesUnits,
    manualUnits,
    ignoredManualUnits,
    allSalesUnits,
    attributedSalesUnits,
    salesShare,
    target,
    targetIsImplicit: explicitTarget === null && target !== null,
    ratio,
    rewardMode,
    potentialCents,
    earnedCents,
    reachedTier: reached,
    nextTier: next,
    unitsToNextTier: next ? next.units - units : null,
    daysTotal,
    daysElapsed,
    daysRemaining,
    daysUntilStart,
    projectedUnits,
    byProduct: breakdown(lines, (line) => line.productId ?? (line.presentationId ? `cip:${line.presentationId}` : "inconnu"), terms.countMode),
    byUser: breakdown(lines, (line) => line.userId ?? "", terms.countMode),
  };
}

/** Le pourcentage affiché, arrondi à l'unité, sans plafond (un challenge peut être dépassé). */
export function progressPercent(progress: Pick<ChallengeProgress, "ratio">): number | null {
  return progress.ratio === null ? null : Math.round(progress.ratio * 100);
}

export type RewardTotals = {
  /** Challenges rémunérés (prime par unité ou paliers) pris dans le total. */
  rewarded: number;
  earnedCents: number;
  /**
   * Somme des potentiels, ou null dès qu'un challenge rémunéré n'a pas de
   * potentiel connu (prime par unité sans objectif) : un total qui en
   * omettrait un serait faux, et pourrait même passer sous le réalisé.
   */
  potentialCents: number | null;
};

/** Les montants de plusieurs challenges additionnés, sans jamais compléter un potentiel inconnu. */
export function sumRewards(items: readonly Pick<ChallengeProgress, "rewardMode" | "earnedCents" | "potentialCents">[]): RewardTotals {
  let rewarded = 0;
  let earnedCents = 0;
  let potential = 0;
  let potentialKnown = true;
  for (const item of items) {
    if (item.rewardMode === "NONE") continue;
    rewarded += 1;
    earnedCents += item.earnedCents ?? 0;
    if (item.potentialCents === null) potentialKnown = false;
    else potential += item.potentialCents;
  }
  return { rewarded, earnedCents, potentialCents: rewarded > 0 && potentialKnown ? potential : null };
}

/** Ordre d'affichage : en cours, à venir, terminés, archivés. */
export const EFFECTIVE_STATUS_ORDER: EffectiveStatus[] = ["RUNNING", "UPCOMING", "ENDED", "ARCHIVED"];
