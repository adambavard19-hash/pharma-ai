import { ACCEPTED_STATUSES, PENDING_GRACE_HOURS } from "./definitions";
import { metric, rateMetric, ratio } from "./metrics";
import type { AdviceRow, AdviceStatus, FunnelStats } from "./types";

/**
 * L'entonnoir des conseils : proposés → acceptés → achetés.
 *
 * Les conseils sont comptés à la date où ils ont été PROPOSÉS (la date de vente
 * est une autre horloge, voir `revenue.ts`). L'identité qui garde tout honnête :
 *
 *   proposés = acceptés + retirés par l'équipe + sans réponse + en attente
 *
 * Chaque conseil compté tombe dans exactement une de ces quatre cases.
 */

const HOUR_MS = 3_600_000;

/** Ce qui compte comme conseil PharmaBoost : origine IA ou règle, ordonnance conservée. */
export function selectCountedAdvice(rows: AdviceRow[]): AdviceRow[] {
  return rows.filter((row) => (row.origin === "AI" || row.origin === "RULE") && !row.prescriptionDeleted);
}

/** Retenu par l'équipe : accepté, modifié, remplacé, présenté, acheté ou refusé ensuite par le patient. */
export function isAcceptedStatus(status: AdviceStatus): boolean {
  return ACCEPTED_STATUSES.includes(status);
}

/**
 * En attente : proposé (jamais tranché) et créé il y a MOINS de 24 h. À 24 h
 * pile, le conseil est déjà « sans réponse » : la fenêtre est ouverte, pas fermée.
 */
export function isPendingAdvice(row: AdviceRow, now: Date): boolean {
  if (row.status !== "PROPOSED") return false;
  return now.getTime() - row.createdAt.getTime() < PENDING_GRACE_HOURS * HOUR_MS;
}

type Tally = {
  proposed: number;
  pending: number;
  accepted: number;
  declinedByPatient: number;
  removedByTeam: number;
  unanswered: number;
  purchased: number;
  acceptedNotConfirmed: number;
};

/**
 * Range chaque conseil déjà filtré dans sa case. `now = null` : la période est
 * entièrement passée, plus rien n'est « en attente » (un PROPOSED est sans réponse).
 */
function tally(rows: AdviceRow[], now: Date | null): Tally {
  const t: Tally = {
    proposed: rows.length,
    pending: 0,
    accepted: 0,
    declinedByPatient: 0,
    removedByTeam: 0,
    unanswered: 0,
    purchased: 0,
    acceptedNotConfirmed: 0,
  };

  for (const row of rows) {
    if (isAcceptedStatus(row.status)) {
      t.accepted += 1;
      if (row.status === "PURCHASED") t.purchased += 1;
      else if (row.status === "DECLINED") t.declinedByPatient += 1;
      else t.acceptedNotConfirmed += 1;
    } else if (row.status === "REMOVED") {
      t.removedByTeam += 1;
    } else if (now !== null && isPendingAdvice(row, now)) {
      t.pending += 1;
    } else {
      // IGNORED, PROPOSED de plus de 24 h : jamais tranché.
      t.unanswered += 1;
    }
  }
  return t;
}

/**
 * Calcule l'entonnoir de la période et de la période précédente.
 * `advice` / `previousAdvice` sont les conseils BRUTS lus en base : le filtrage
 * (ajouts manuels, ordonnances supprimées) est fait ici, et compté à part pour
 * que l'écran puisse dire ce qu'il a laissé de côté.
 */
export function computeFunnel(input: { advice: AdviceRow[]; previousAdvice: AdviceRow[]; now: Date }): {
  funnel: FunnelStats;
  manualExcluded: number;
  deletedPrescriptionAdvice: number;
  counted: AdviceRow[];
} {
  const { advice, previousAdvice, now } = input;

  const counted = selectCountedAdvice(advice);
  const previousCounted = selectCountedAdvice(previousAdvice);

  // Les deux catégories écartées ne se recouvrent pas : un ajout manuel est
  // d'abord un ajout manuel, même sur une ordonnance supprimée.
  const manualExcluded = advice.filter((row) => row.origin === "MANUAL").length;
  const deletedPrescriptionAdvice = advice.filter((row) => row.origin !== "MANUAL" && row.prescriptionDeleted).length;

  const current = tally(counted, now);
  const previous = tally(previousCounted, null);

  const acceptance = ratio(current.accepted, current.proposed - current.pending);
  const previousAcceptance = ratio(previous.accepted, previous.proposed - previous.pending);
  const conversion = ratio(current.purchased, current.accepted);
  const previousConversion = ratio(previous.purchased, previous.accepted);

  const funnel: FunnelStats = {
    proposed: metric(current.proposed, previous.proposed),
    pending: current.pending,
    accepted: metric(current.accepted, previous.accepted),
    declinedByPatient: current.declinedByPatient,
    removedByTeam: current.removedByTeam,
    unanswered: current.unanswered,
    purchased: metric(current.purchased, previous.purchased),
    acceptedNotConfirmed: current.acceptedNotConfirmed,
    acceptanceRate: rateMetric(acceptance, previousAcceptance),
    conversionRate: rateMetric(conversion, previousConversion),
  };

  return { funnel, manualExcluded, deletedPrescriptionAdvice, counted };
}
