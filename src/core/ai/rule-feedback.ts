import { ACCEPTED_STATUSES } from "@/core/performance/definitions";

/**
 * Ce que les comptoirs de toutes les pharmacies disent d'une règle : combien de fois elle a été proposée, retenue, achetée.
 *
 * C'est un INDICATEUR pour la pharmacienne qui relit, jamais une décision : il ne change rien tout seul au moteur. Un conseil très
 * bien accueilli ne devient pas plus fort, un conseil peu retenu n'est pas retiré — c'est elle qui juge, avec ces chiffres sous les
 * yeux. Les stocks, les équipes et les clientèles diffèrent d'une pharmacie à l'autre : on n'émet un verdict qu'avec assez de
 * conseils tranchés ET assez de pharmacies différentes.
 *
 * Module pur.
 */

export const MIN_DECIDED_FOR_VERDICT = 30;
export const MIN_PHARMACIES_FOR_VERDICT = 3;
export const WELL_RECEIVED_RATE = 0.6;
export const RARELY_RETAINED_RATE = 0.2;

export type FeedbackVerdict = "NOT_ENOUGH_DATA" | "WELL_RECEIVED" | "NEUTRAL" | "RARELY_RETAINED";

export type RuleFeedback = {
  /** Conseils proposés et déjà tranchés (retenus, retirés ou restés sans réponse) ; les conseils encore en attente ne comptent pas. */
  decided: number;
  retained: number;
  bought: number;
  pharmacies: number;
  retainedRate: number | null;
  verdict: FeedbackVerdict;
};

const ACCEPTED = new Set<string>(ACCEPTED_STATUSES);

export function summariseRuleFeedback(counts: { status: string; count: number }[], pharmacies: number): RuleFeedback {
  let decided = 0;
  let retained = 0;
  let bought = 0;
  for (const { status, count } of counts) {
    if (status === "PROPOSED") continue;
    decided += count;
    if (ACCEPTED.has(status)) retained += count;
    if (status === "PURCHASED") bought += count;
  }
  const retainedRate = decided > 0 ? retained / decided : null;
  let verdict: FeedbackVerdict = "NOT_ENOUGH_DATA";
  if (retainedRate !== null && decided >= MIN_DECIDED_FOR_VERDICT && pharmacies >= MIN_PHARMACIES_FOR_VERDICT) {
    verdict = retainedRate >= WELL_RECEIVED_RATE ? "WELL_RECEIVED" : retainedRate <= RARELY_RETAINED_RATE ? "RARELY_RETAINED" : "NEUTRAL";
  }
  return { decided, retained, bought, pharmacies, retainedRate, verdict };
}
