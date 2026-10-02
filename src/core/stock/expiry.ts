/**
 * Dates courtes : combien de jours avant la péremption, et quel niveau.
 *
 * Pur et sans horloge : la date du jour est toujours passée par l'appelant
 * (le moteur de conseil ne lit jamais l'heure). Les dates sont des jours
 * calendaires (UTC minuit), comme la colonne `expiresOn` (@db.Date).
 */

export type ExpiryLevel = "EXPIRED" | "URGENT" | "SOON" | "OK";

export type ShortDateThresholds = {
  /** À moins de N jours : « bientôt ». */
  soonDays: number;
  /** À moins de M jours : « urgent ». M ≤ N. */
  urgentDays: number;
};

export const DEFAULT_SHORT_DATE_THRESHOLDS: ShortDateThresholds = { soonDays: 90, urgentDays: 30 };

export const EXPIRY_LEVEL_LABELS: Record<ExpiryLevel, string> = {
  EXPIRED: "Expiré",
  URGENT: "Urgent",
  SOON: "Bientôt",
  OK: "Date lointaine",
};

const DAY = 24 * 60 * 60 * 1000;

function dayIndex(date: Date): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY);
}

/** Jours restants avant la péremption : 0 le jour même, négatif une fois passée. */
export function daysUntil(expiresOn: Date, today: Date): number {
  return dayIndex(expiresOn) - dayIndex(today);
}

export function expiryLevel(daysLeft: number, thresholds: ShortDateThresholds = DEFAULT_SHORT_DATE_THRESHOLDS): ExpiryLevel {
  if (daysLeft < 0) return "EXPIRED";
  if (daysLeft <= thresholds.urgentDays) return "URGENT";
  if (daysLeft <= thresholds.soonDays) return "SOON";
  return "OK";
}

/** Seuils lisibles et cohérents : bornés, et « urgent » jamais au-delà de « bientôt ». */
export function normalizeThresholds(soonDays: number, urgentDays: number): ShortDateThresholds {
  const soonInput = Number.isFinite(soonDays) ? soonDays : DEFAULT_SHORT_DATE_THRESHOLDS.soonDays;
  const urgentInput = Number.isFinite(urgentDays) ? urgentDays : DEFAULT_SHORT_DATE_THRESHOLDS.urgentDays;
  const soon = Math.min(730, Math.max(1, Math.round(soonInput)));
  const urgent = Math.min(soon, Math.max(0, Math.round(urgentInput)));
  return { soonDays: soon, urgentDays: urgent };
}

/**
 * La date courte d'une référence telle que le moteur et la carte la lisent :
 * le lot non périmé le plus proche. Une boîte périmée n'est jamais « une date
 * courte à écouler » : elle sort du conseil, elle ne le départage pas.
 */
export type ShortDate = { expiresOn: string; daysLeft: number; level: ExpiryLevel };

export function nearestShortDate(lots: { expiresOn: Date }[], today: Date, thresholds: ShortDateThresholds = DEFAULT_SHORT_DATE_THRESHOLDS): ShortDate | null {
  let best: ShortDate | null = null;
  for (const lot of lots) {
    const daysLeft = daysUntil(lot.expiresOn, today);
    if (daysLeft < 0) continue;
    if (!best || daysLeft < best.daysLeft) best = { expiresOn: lot.expiresOn.toISOString().slice(0, 10), daysLeft, level: expiryLevel(daysLeft, thresholds) };
  }
  return best;
}
