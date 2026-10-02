import { daysBetween, isCalendarDay, toDayKey, type DayKey } from "./dates";

/**
 * Les conditions d'un challenge laboratoire : période, objectif, rémunération.
 *
 * Un challenge est un engagement COMMERCIAL entre l'officine et un laboratoire.
 * Il ne touche jamais au moteur de conseil (rien ici n'est importé par
 * src/core/ai) et ne s'affiche jamais au comptoir. Ce module ne fait que dire
 * si des conditions saisies sont cohérentes, et les relire depuis la base.
 */

export type ChallengeTier = { units: number; bonusCents: number };

/** Comment le challenge rémunère l'officine : rien, une prime par unité, ou des paliers. */
export type RewardMode = "NONE" | "PER_UNIT" | "TIERS";

export const REWARD_MODE_LABELS: Record<RewardMode, string> = {
  NONE: "Sans prime",
  PER_UNIT: "Prime par unité",
  TIERS: "Paliers",
};

/** Au-delà de deux ans, ce n'est plus un challenge mais un accord annuel. */
export const MAX_CHALLENGE_DAYS = 731;
export const MAX_TIERS = 10;
export const MAX_UNITS = 1_000_000;
/** 100 000 € : garde-fou contre une saisie en centimes prise pour des euros. */
export const MAX_BONUS_CENTS = 10_000_000;

function isWholeNumber(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Les paliers tels qu'on les relit depuis la colonne JSON : seulement les
 * paliers lisibles, triés par seuil croissant, un seul par seuil (le mieux
 * payé). Une valeur illisible donne une liste vide, jamais une exception.
 */
export function parseTiers(value: unknown): ChallengeTier[] {
  if (!Array.isArray(value)) return [];
  const byThreshold = new Map<number, number>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const { units, bonusCents } = raw as { units?: unknown; bonusCents?: unknown };
    if (!isWholeNumber(units, 1, MAX_UNITS) || !isWholeNumber(bonusCents, 0, MAX_BONUS_CENTS)) continue;
    byThreshold.set(units, Math.max(byThreshold.get(units) ?? 0, bonusCents));
  }
  return [...byThreshold.entries()].map(([units, bonusCents]) => ({ units, bonusCents })).sort((a, b) => a.units - b.units);
}

/** Le mode de rémunération d'un challenge enregistré : les paliers priment, puis la prime par unité. */
export function rewardModeOf(terms: { bonusPerUnitCents: number | null; tiers: ChallengeTier[] | null }): RewardMode {
  if (terms.tiers && terms.tiers.length > 0) return "TIERS";
  if (terms.bonusPerUnitCents !== null && terms.bonusPerUnitCents > 0) return "PER_UNIT";
  return "NONE";
}

/** Le palier le plus haut atteint avec ce nombre d'unités (paliers triés ou non). */
export function tierReached(tiers: ChallengeTier[], units: number): ChallengeTier | null {
  let best: ChallengeTier | null = null;
  for (const tier of tiers) {
    if (tier.units <= units && (!best || tier.units > best.units)) best = tier;
  }
  return best;
}

/** Le prochain palier à atteindre, s'il en reste un. */
export function nextTier(tiers: ChallengeTier[], units: number): ChallengeTier | null {
  let best: ChallengeTier | null = null;
  for (const tier of tiers) {
    if (tier.units > units && (!best || tier.units < best.units)) best = tier;
  }
  return best;
}

export type ChallengeTermsInput = {
  startsOn: string;
  endsOn: string;
  targetUnits: number | null;
  rewardMode: RewardMode;
  bonusPerUnitCents: number | null;
  tiers: ChallengeTier[];
};

/**
 * Les erreurs, champ par champ, des conditions saisies. Objet vide : tout est
 * cohérent. Les messages sont ceux qu'on affiche sous le champ.
 */
export function validateChallengeTerms(input: ChallengeTermsInput): Record<string, string> {
  const errors: Record<string, string> = {};

  const startsValid = isCalendarDay(input.startsOn);
  const endsValid = isCalendarDay(input.endsOn);
  if (!startsValid) errors.startsOn = "Date de début invalide.";
  if (!endsValid) errors.endsOn = "Date de fin invalide.";
  if (startsValid && endsValid) {
    const span = daysBetween(input.startsOn, input.endsOn);
    if (span < 0) errors.endsOn = "La fin doit suivre le début.";
    else if (span + 1 > MAX_CHALLENGE_DAYS) errors.endsOn = "Un challenge dure au plus deux ans.";
  }

  if (input.targetUnits !== null && !isWholeNumber(input.targetUnits, 1, MAX_UNITS)) {
    errors.targetUnits = "Un objectif est un nombre entier d'unités, au moins 1.";
  }

  if (input.rewardMode === "PER_UNIT") {
    if (input.bonusPerUnitCents === null || !isWholeNumber(input.bonusPerUnitCents, 1, MAX_BONUS_CENTS)) {
      errors.bonusPerUnitCents = "Indiquez la prime par unité.";
    }
  }

  if (input.rewardMode === "TIERS") {
    if (input.tiers.length === 0) errors.tiers = "Ajoutez au moins un palier.";
    else if (input.tiers.length > MAX_TIERS) errors.tiers = `${MAX_TIERS} paliers au plus.`;
    else {
      const sorted = [...input.tiers].sort((a, b) => a.units - b.units);
      for (const tier of sorted) {
        if (!isWholeNumber(tier.units, 1, MAX_UNITS)) {
          errors.tiers = "Chaque palier a un seuil d'au moins 1 unité.";
          break;
        }
        if (!isWholeNumber(tier.bonusCents, 1, MAX_BONUS_CENTS)) {
          errors.tiers = "Chaque palier a un montant.";
          break;
        }
      }
      if (!errors.tiers) {
        for (let index = 1; index < sorted.length; index += 1) {
          if (sorted[index].units === sorted[index - 1].units) {
            errors.tiers = "Deux paliers ont le même seuil.";
            break;
          }
          if (sorted[index].bonusCents < sorted[index - 1].bonusCents) {
            errors.tiers = "Un palier plus haut ne peut pas rapporter moins.";
            break;
          }
        }
      }
    }
  }

  return errors;
}

/**
 * Une saisie manuelle (unités vendues hors PharmaBoost, relevé du laboratoire) :
 * dans la période du challenge, jamais dans le futur, jamais nulle. Une saisie
 * négative corrige un relevé.
 */
export function validateManualEntry(
  entry: { units: number; occurredOn: string },
  period: { startsOn: Date | string; endsOn: Date | string },
  today: DayKey,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!Number.isInteger(entry.units) || entry.units === 0 || Math.abs(entry.units) > MAX_UNITS) {
    errors.units = "Un nombre entier d'unités, différent de zéro.";
  }
  if (!isCalendarDay(entry.occurredOn)) {
    errors.occurredOn = "Date invalide.";
    return errors;
  }
  const start = toDayKey(period.startsOn);
  const end = toDayKey(period.endsOn);
  if (daysBetween(start, entry.occurredOn) < 0 || daysBetween(entry.occurredOn, end) < 0) {
    errors.occurredOn = "La date doit être comprise dans la période du challenge.";
  } else if (daysBetween(entry.occurredOn, today) < 0) {
    errors.occurredOn = "La date ne peut pas être dans le futur.";
  }
  return errors;
}
