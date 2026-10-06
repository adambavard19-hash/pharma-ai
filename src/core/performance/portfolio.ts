import {
  PORTFOLIO_GETTING_STARTED_DAYS,
  PORTFOLIO_HIGH_VALUE_MIN_SALES,
  PORTFOLIO_HIGH_VALUE_ROI,
  PORTFOLIO_INACTIVE_DAYS,
  PORTFOLIO_LOW_ACCEPTANCE,
  PORTFOLIO_LOW_ACCEPTANCE_MIN_DECIDED,
  PORTFOLIO_NO_SALES_MIN_ACCEPTED,
  SUBSCRIPTION_VAT_RATE,
} from "./definitions";
import { metric, ratio } from "./metrics";
import { pctText } from "./narrative";
import { returnSubscriptionPrice } from "./roi";
import type { PortfolioHealth, PortfolioInput, PortfolioRow } from "./types";

/**
 * Le portefeuille du Super Admin : quelles officines tirent beaucoup de valeur
 * de PharmaBoost, lesquelles ont besoin d'être accompagnées.
 *
 * La classe de santé suit des règles écrites, dans l'ordre : la première qui
 * s'applique gagne, et chaque règle écrit sa raison en une phrase pour que
 * l'équipe sache quoi dire au titulaire. Rien n'est deviné : une donnée absente
 * ne déclenche jamais une alerte.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type HealthTone = "neutral" | "brand" | "accent" | "success" | "warning" | "danger" | "info";

export const HEALTH_LABELS: Record<PortfolioHealth, string> = {
  high_value: "Forte valeur",
  on_track: "Dans la bonne voie",
  needs_support: "À accompagner",
  getting_started: "Démarrage",
  no_data: "Pas encore démarré",
};

/** Les tons de pastille (`Badge`) : vert pour la valeur, orange pour l'accompagnement, la marque pour la normale. */
export const HEALTH_TONES: Record<PortfolioHealth, HealthTone> = {
  high_value: "success",
  on_track: "brand",
  needs_support: "warning",
  getting_started: "info",
  no_data: "neutral",
};

/**
 * La priorité de tri, « à voir en premier » en haut : à accompagner (le plus
 * haut, et plus il y a de raisons plus c'est haut), puis pas démarré, démarrage,
 * dans la bonne voie, forte valeur (le plus bas).
 */
const BASE_PRIORITY: Record<PortfolioHealth, number> = {
  needs_support: 100,
  no_data: 40,
  getting_started: 30,
  on_track: 20,
  high_value: 10,
};

function daysSince(date: Date, now: Date): number {
  return (now.getTime() - date.getTime()) / DAY_MS;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

/** Règle 1 : officine créée il y a moins de 14 jours. */
function gettingStartedReason(input: PortfolioInput, now: Date): string | null {
  const age = daysSince(input.createdAt, now);
  if (age >= PORTFOLIO_GETTING_STARTED_DAYS) return null;
  const days = Math.max(0, Math.floor(age));
  return days === 0 ? "Officine créée il y a moins d'un jour" : `Officine créée il y a ${plural(days, "jour")}`;
}

/**
 * Règle 2 : « jamais démarré » = l'officine n'a JAMAIS eu de conseil (aucune date de
 * dernier conseil, aucun conseil ce mois-ci) et aucune analyse sur les 30 derniers jours.
 * Une officine qui a eu des conseils puis s'est arrêtée, il y a 8 jours comme il y a
 * 400, n'est pas « jamais démarrée » : elle tombe dans la règle 3 (« Utilisation arrêtée »).
 */
function isNeverStarted(input: PortfolioInput): boolean {
  const hadAdvice = input.proposed > 0 || input.lastProposalAt !== null;
  return !hadAdvice && input.recentAnalyses <= 0;
}

/** Règle 3 : les raisons d'accompagner, dans l'ordre d'écriture. */
function supportReasons(input: PortfolioInput, now: Date, acceptanceRate: number | null): string[] {
  const reasons: string[] = [];

  // Utilisation arrêtée : plus de conseil depuis 7 jours alors qu'il y en avait avant.
  if (input.lastProposalAt !== null) {
    const silentDays = daysSince(input.lastProposalAt, now);
    if (silentDays >= PORTFOLIO_INACTIVE_DAYS) {
      reasons.push(`Utilisation arrêtée depuis ${plural(Math.floor(silentDays), "jour")}`);
    }
  }

  // Conseils peu retenus : moins de 20 % d'acceptés, sur au moins 20 conseils tranchés.
  if (acceptanceRate !== null && input.decided >= PORTFOLIO_LOW_ACCEPTANCE_MIN_DECIDED && acceptanceRate < PORTFOLIO_LOW_ACCEPTANCE) {
    reasons.push(`Conseils peu retenus (${input.accepted} acceptés sur ${input.decided} tranchés, soit ${pctText(acceptanceRate)})`);
  }

  // Beaucoup de conseils acceptés mais aucune vente enregistrée : la valeur n'est pas mesurable.
  // Une vente sans prix reste une vente enregistrée : seule l'absence totale déclenche cette raison.
  const noRecordedSale = input.purchased <= 0 && input.confirmedTtcCents <= 0 && input.unpricedConfirmedLines <= 0;
  if (input.accepted >= PORTFOLIO_NO_SALES_MIN_ACCEPTED && noRecordedSale) {
    reasons.push(
      `Ventes pas enregistrées dans PharmaBoost : la valeur n'est pas mesurable (${input.accepted} conseils acceptés ce mois-ci, aucune vente confirmée)`,
    );
  }

  // Le retour sur abonnement affiché reste sous 1.
  if (input.roi.status === "shown" && input.roi.ratio < 1) {
    reasons.push(`La valeur mesurée reste sous le prix de l'abonnement (${input.roi.ratioLabel})`);
  }

  return reasons;
}

/**
 * Règle 4 : forte valeur. Retour sur abonnement affiché ≥ 3 ; ou, quand il est
 * masqué, un CA confirmé du mois ≥ 3 fois le prix mensuel (converti en TTC) et
 * au moins 10 conseils achetés. Jamais pour un abonnement partagé entre plusieurs
 * officines (`returnSubscriptionPrice` rend alors `null`). Renvoie la raison, ou `null`.
 */
function highValueReason(input: PortfolioInput): string | null {
  if (input.roi.status === "shown") {
    return input.roi.ratio >= PORTFOLIO_HIGH_VALUE_ROI ? `Retour sur abonnement de ${input.roi.ratioLabel} ce mois-ci` : null;
  }
  const price = returnSubscriptionPrice(input.subscription);
  if (price === null || input.purchased < PORTFOLIO_HIGH_VALUE_MIN_SALES) return null;
  // Comparaison en entiers (prix HT × (100 + TVA) ÷ 100 = prix TTC) pour que le seuil pile soit exact.
  if (input.confirmedTtcCents * 100 < PORTFOLIO_HIGH_VALUE_ROI * price * (100 + SUBSCRIPTION_VAT_RATE)) return null;
  return `Plus de ${PORTFOLIO_HIGH_VALUE_ROI} fois le prix de l'abonnement en ventes confirmées ce mois-ci (${plural(input.purchased, "conseil acheté", "conseils achetés")})`;
}

function classifyOne(input: PortfolioInput, now: Date): PortfolioRow {
  const decidedRate = ratio(input.accepted, input.decided);
  const acceptanceRate = decidedRate === null ? null : Math.min(1, decidedRate);
  const deltaPct = metric(input.confirmedTtcCents, input.previousConfirmedTtcCents).deltaPct;
  const common = { ...input, acceptanceRate, deltaPct };

  const startingReason = gettingStartedReason(input, now);
  if (startingReason !== null) {
    return { ...common, health: "getting_started", reasons: [startingReason], priority: BASE_PRIORITY.getting_started };
  }

  if (isNeverStarted(input)) {
    return { ...common, health: "no_data", reasons: ["Aucun conseil proposé pour l'instant"], priority: BASE_PRIORITY.no_data };
  }

  const reasons = supportReasons(input, now, acceptanceRate);
  if (reasons.length > 0) {
    return { ...common, health: "needs_support", reasons, priority: BASE_PRIORITY.needs_support + reasons.length };
  }

  const valueReason = highValueReason(input);
  if (valueReason !== null) {
    return { ...common, health: "high_value", reasons: [valueReason], priority: BASE_PRIORITY.high_value };
  }

  return { ...common, health: "on_track", reasons: ["Aucun signal d'alerte ce mois-ci"], priority: BASE_PRIORITY.on_track };
}

/**
 * Classe chaque officine, puis trie « à voir en premier » : priorité
 * décroissante, puis nom (ordre alphabétique français), puis identifiant pour
 * un ordre toujours identique.
 */
export function classifyPortfolio(inputs: PortfolioInput[], now: Date): PortfolioRow[] {
  return inputs
    .map((input) => classifyOne(input, now))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        a.name.localeCompare(b.name, "fr", { sensitivity: "base" }) ||
        a.pharmacyId.localeCompare(b.pharmacyId),
    );
}
