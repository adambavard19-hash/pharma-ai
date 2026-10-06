import { RHYTHM_MIN_DECIDED_SLOT, RHYTHM_MIN_DECIDED_TOTAL, RHYTHM_WINDOW_HOURS } from "./definitions";
import { isAcceptedStatus, isPendingAdvice } from "./funnel";
import { RHYTHM_WINDOW_DAYS, zonedDateParts } from "./periods";
import type { AdviceRow, RhythmCell, RhythmStats } from "./types";

/**
 * Le rythme : à quels jours et à quelles heures les conseils sont le plus
 * retenus par l'équipe. Calculé sur les 90 derniers jours (le service lit déjà
 * cette fenêtre), jamais sur la période choisie : le rythme d'une semaine ne dit rien.
 *
 * Les conseils arrivent DÉJÀ filtrés (`selectCountedAdvice`). Jour et heure
 * suivent le fuseau de l'officine (Intl, jamais `getHours()` : le serveur est en UTC).
 * « Tranché » = proposé et pas en attente : c'est le dénominateur du taux d'acceptation.
 */

const WEEKDAY_LABELS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"] as const;

type Slot = { accepted: number; decided: number };

/** Vrai quand le taux de `a` est strictement meilleur que celui de `b` ; à taux égal, le créneau le plus fourni gagne. Produit en croix : pas d'arrondi. */
function isBetter(a: Slot, b: Slot): boolean {
  const left = a.accepted * b.decided;
  const right = b.accepted * a.decided;
  if (left !== right) return left > right;
  return a.decided > b.decided;
}

export function buildRhythm(input: { rhythmAdvice: AdviceRow[]; timeZone: string; now: Date }): RhythmStats {
  const { rhythmAdvice, timeZone, now } = input;

  const cells: RhythmCell[] = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    for (let hour = 0; hour < 24; hour += 1) cells.push({ weekday, hour, proposed: 0, accepted: 0, decided: 0 });
  }

  let totalDecided = 0;
  for (const row of rhythmAdvice) {
    const parts = zonedDateParts(row.createdAt, timeZone);
    const hour = parts.hour % 24;
    if (!Number.isInteger(parts.weekday) || parts.weekday < 0 || parts.weekday > 6) continue;
    const cell = cells[parts.weekday * 24 + hour];
    if (!cell) continue;
    cell.proposed += 1;
    if (isAcceptedStatus(row.status)) cell.accepted += 1;
    if (!isPendingAdvice(row, now)) {
      cell.decided += 1;
      totalDecided += 1;
    }
  }

  const enoughData = totalDecided >= RHYTHM_MIN_DECIDED_TOTAL;
  const base = { windowDays: RHYTHM_WINDOW_DAYS, cells, enoughData };
  // Sous le seuil global, aucun « meilleur » : ce serait le hasard de quelques conseils.
  if (!enoughData) return { ...base, bestWeekday: null, bestWindow: null };

  // Meilleur jour : taux le plus haut parmi les jours qui comptent assez de conseils tranchés ; égalité → le plus de tranchés, puis le plus tôt dans la semaine.
  let bestWeekday: RhythmStats["bestWeekday"] = null;
  let bestWeekdaySlot: Slot | null = null;
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const slot: Slot = { accepted: 0, decided: 0 };
    for (let hour = 0; hour < 24; hour += 1) {
      const cell = cells[weekday * 24 + hour];
      slot.accepted += cell.accepted;
      slot.decided += cell.decided;
    }
    if (slot.decided < RHYTHM_MIN_DECIDED_SLOT) continue;
    if (bestWeekdaySlot === null || isBetter(slot, bestWeekdaySlot)) {
      bestWeekdaySlot = slot;
      bestWeekday = {
        weekday,
        label: WEEKDAY_LABELS[weekday],
        acceptanceRate: slot.accepted / slot.decided,
        decided: slot.decided,
      };
    }
  }

  // Meilleure fenêtre de 2 h (tous jours confondus, sans passer minuit) : mêmes règles, égalité → la plus tôt dans la journée.
  let bestWindow: RhythmStats["bestWindow"] = null;
  let bestWindowSlot: Slot | null = null;
  for (let fromHour = 0; fromHour + RHYTHM_WINDOW_HOURS <= 24; fromHour += 1) {
    const slot: Slot = { accepted: 0, decided: 0 };
    for (let weekday = 0; weekday < 7; weekday += 1) {
      for (let offset = 0; offset < RHYTHM_WINDOW_HOURS; offset += 1) {
        const cell = cells[weekday * 24 + fromHour + offset];
        slot.accepted += cell.accepted;
        slot.decided += cell.decided;
      }
    }
    if (slot.decided < RHYTHM_MIN_DECIDED_SLOT) continue;
    if (bestWindowSlot === null || isBetter(slot, bestWindowSlot)) {
      bestWindowSlot = slot;
      bestWindow = {
        fromHour,
        toHour: fromHour + RHYTHM_WINDOW_HOURS,
        acceptanceRate: slot.accepted / slot.decided,
        decided: slot.decided,
      };
    }
  }

  return { ...base, bestWeekday, bestWindow };
}
