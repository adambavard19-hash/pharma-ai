/**
 * La grille progressive des commerciaux, pure et testée : la seule source des
 * montants, pour le calcul des commissions (service), l'écran du commercial et
 * son simulateur.
 *
 * Commission par pharmacie activée, selon son RANG dans l'historique du
 * commercial (1re, 2e… activée), sans remise à zéro :
 *   - de la 1re à la 9e : 200 € ;
 *   - de la 10e à la 19e : 250 € ;
 *   - à partir de la 20e : 300 €.
 * Le calcul est MARGINAL : la 10e pharmacie vaut 250 €, les neuf premières
 * gardent leurs 200 € (25 pharmacies = 9 × 200 + 10 × 250 + 6 × 300 = 6 100 €).
 *
 * Bonus cumulables, versés UNE seule fois par palier atteint :
 *   10 pharmacies → Bronze +200 € · 25 → Argent +350 € · 50 → Or +500 € · 100 → Élite +750 €.
 *
 * Tous les montants sont en centimes HT.
 */

import { monthLabelOf } from "@/core/affiliation/monthly";

export type CommissionTier = { from: number; to: number | null; rateCents: number };
export type BonusTier = { at: number; cents: number; name: string };

/** Les paliers de commission, dans l'ordre. `to: null` : sans limite. */
export const COMMISSION_TIERS: readonly CommissionTier[] = [
  { from: 1, to: 9, rateCents: 20_000 },
  { from: 10, to: 19, rateCents: 25_000 },
  { from: 20, to: null, rateCents: 30_000 },
];

/** Les bonus de palier, dans l'ordre. */
export const BONUS_TIERS: readonly BonusTier[] = [
  { at: 10, cents: 20_000, name: "Bronze" },
  { at: 25, cents: 35_000, name: "Argent" },
  { at: 50, cents: 50_000, name: "Or" },
  { at: 100, cents: 75_000, name: "Élite" },
];

/** Borne haute du simulateur de l'écran (relevée pour un commercial qui la dépasse : `simulatorMax`). */
export const SIMULATOR_MAX = 150;

/** La borne du simulateur pour un commercial : 150, ou au-delà de son vrai total (arrondie à la cinquantaine, avec de la marge). */
export function simulatorMax(realCount: number): number {
  const n = toCount(realCount);
  return Math.max(SIMULATOR_MAX, Math.ceil((n + 25) / 50) * 50);
}

/** Un nombre de pharmacies lisible : entier, positif ou nul (une saisie folle vaut 0). */
export function toCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** La commission de la k-ième pharmacie activée (k ≥ 1). Hors grille (k < 1) : 0. */
export function rateForRank(rank: number): number {
  const k = toCount(rank);
  if (k < 1) return 0;
  for (const tier of COMMISSION_TIERS) if (tier.to === null || k <= tier.to) return tier.rateCents;
  return COMMISSION_TIERS[COMMISSION_TIERS.length - 1].rateCents;
}

/** Le palier de commission où tombe la k-ième pharmacie (la première tranche pour k < 1). */
export function tierForRank(rank: number): CommissionTier {
  const k = Math.max(1, toCount(rank));
  return COMMISSION_TIERS.find((tier) => tier.to === null || k <= tier.to) ?? COMMISSION_TIERS[COMMISSION_TIERS.length - 1];
}

/** Le total des commissions de n pharmacies activées : Σ rateForRank(k) pour k = 1…n, tranche par tranche. */
export function commissionsTotalCents(pharmacies: number): number {
  const n = toCount(pharmacies);
  let total = 0;
  for (const tier of COMMISSION_TIERS) {
    if (n < tier.from) break;
    const last = tier.to === null ? n : Math.min(n, tier.to);
    total += (last - tier.from + 1) * tier.rateCents;
  }
  return total;
}

/** Les bonus atteints avec n pharmacies activées. */
export function unlockedBonuses(pharmacies: number): BonusTier[] {
  const n = toCount(pharmacies);
  return BONUS_TIERS.filter((bonus) => n >= bonus.at);
}

export function bonusesTotalCents(pharmacies: number): number {
  return unlockedBonuses(pharmacies).reduce((total, bonus) => total + bonus.cents, 0);
}

/** La commission de la PROCHAINE pharmacie activée (la n+1-ième) : ce que rapporte la suivante. */
export function currentRateCents(pharmacies: number): number {
  return rateForRank(toCount(pharmacies) + 1);
}

/**
 * La « Commission actuelle » de l'écran : celle de la n-ième pharmacie, le
 * palier où le commercial SE TROUVE (à 25 pharmacies : 300 €, comme la
 * maquette). Avant la première activation : la commission de la première.
 * Le palier suivant, quand la prochaine pharmacie change de tranche (à 9 : la
 * 10e vaut 250 €), est donné à part par `nextTier`.
 */
export function displayedRateCents(pharmacies: number): number {
  const n = toCount(pharmacies);
  return rateForRank(Math.max(1, n));
}

export type NextBonus = BonusTier & { remaining: number };

/** Le prochain bonus à débloquer et ce qu'il reste à activer ; `null` quand tous sont atteints. */
export function nextBonus(pharmacies: number): NextBonus | null {
  const n = toCount(pharmacies);
  const bonus = BONUS_TIERS.find((tier) => n < tier.at);
  return bonus ? { ...bonus, remaining: bonus.at - n } : null;
}

export type NextActivationGain = { rateCents: number; bonus: BonusTier | null; totalCents: number };

/** Ce que rapporterait la PROCHAINE activation : sa commission, plus le bonus si elle atteint un palier (à 9 : 250 € + Bronze 200 € = 450 €). */
export function nextActivationGain(pharmacies: number): NextActivationGain {
  const next = toCount(pharmacies) + 1;
  const rateCents = rateForRank(next);
  const bonus = BONUS_TIERS.find((tier) => tier.at === next) ?? null;
  return { rateCents, bonus, totalCents: rateCents + (bonus?.cents ?? 0) };
}

export type NextTier = { from: number; rateCents: number; remaining: number };

/** Le prochain palier de commission (première pharmacie de la tranche suivante) ; `null` dans la dernière tranche. */
export function nextTier(pharmacies: number): NextTier | null {
  const n = toCount(pharmacies);
  // La tranche de la n-ième (ou de la première si aucune) ; la suivante commence après elle.
  const current = tierForRank(Math.max(1, n));
  const index = COMMISSION_TIERS.indexOf(current);
  const next = COMMISSION_TIERS[index + 1];
  if (!next) return null;
  return { from: next.from, rateCents: next.rateCents, remaining: next.from - n };
}

/** L'avancement vers le prochain bonus, de 0 à 1, entre le palier précédent (ou 0) et le suivant ; 1 quand tout est atteint. */
export function progressToNextBonus(pharmacies: number): number {
  const n = toCount(pharmacies);
  const next = BONUS_TIERS.find((tier) => n < tier.at);
  if (!next) return 1;
  const previous = [...BONUS_TIERS].reverse().find((tier) => tier.at <= n)?.at ?? 0;
  return (n - previous) / (next.at - previous);
}

export type Simulation = {
  pharmacies: number;
  commissionsCents: number;
  bonusesCents: number;
  totalCents: number;
  /** La commission du palier atteint (`displayedRateCents`). */
  rateCents: number;
  /** La commission de la prochaine pharmacie (`currentRateCents`). */
  nextRateCents: number;
  unlocked: BonusTier[];
  nextBonus: NextBonus | null;
  nextTier: NextTier | null;
  progressToNextBonus: number;
};

/** Tout ce que l'écran et le simulateur affichent pour n pharmacies activées, d'un seul calcul. */
export function simulate(pharmacies: number): Simulation {
  const n = toCount(pharmacies);
  const commissionsCents = commissionsTotalCents(n);
  const bonusesCents = bonusesTotalCents(n);
  return {
    pharmacies: n,
    commissionsCents,
    bonusesCents,
    totalCents: commissionsCents + bonusesCents,
    rateCents: displayedRateCents(n),
    nextRateCents: currentRateCents(n),
    unlocked: unlockedBonuses(n),
    nextBonus: nextBonus(n),
    nextTier: nextTier(n),
    progressToNextBonus: progressToNextBonus(n),
  };
}

/** Le bonus d'un palier (10, 25, 50, 100), ou `null` pour une valeur inconnue. */
export function bonusForTier(at: number | null | undefined): BonusTier | null {
  return BONUS_TIERS.find((bonus) => bonus.at === at) ?? null;
}

/** « Bonus Bronze » pour une ligne de bonus ; `null` pour une commission ordinaire. */
export function bonusLabel(row: { type: string; bonusTier?: number | null }): string | null {
  if (row.type !== "BONUS") return null;
  const bonus = bonusForTier(row.bonusTier);
  return bonus ? `Bonus ${bonus.name}` : "Bonus de palier";
}

/**
 * Le libellé d'une ligne de commission dans une liste : la pharmacie, « Bonus Bronze — Pharmacie… », ou, pour une
 * commission mensuelle d'affiliation, « Pharmacie… — octobre 2026 » (le mois de l'abonnement commissionné).
 */
export function commissionSubject(row: { type: string; bonusTier?: number | null; periodMonth?: string | null }, prospectName: string): string {
  if (row.type === "AFFILIATE" && row.periodMonth) return `${prospectName} — ${monthLabelOf(row.periodMonth)}`;
  if (row.type === "AFFILIATE_SIGNUP") return `Prime d'arrivée — ${prospectName}`;
  const label = bonusLabel(row);
  return label ? `${label} — ${prospectName}` : prospectName;
}

/** « 1re », « 10e » : le rang d'une pharmacie, à la française. */
export function rankLabel(rank: number): string {
  return rank === 1 ? "1re" : `${rank}e`;
}

// ---------------------------------------------------------------- Recalcul (plan pur)

/**
 * Une commission est intouchable quand elle est payée, annulée, ou réclamée par
 * une facture : elle se règle alors par la facture, jamais par un recalcul.
 */
export function isRecomputable(row: { status: string; invoiceId: string | null }): boolean {
  return row.invoiceId === null && (row.status === "FORECAST" || row.status === "EARNED" || row.status === "PAYABLE");
}

/**
 * Une commission de grille dont la pharmacie n'est pas encore activée : son
 * montant est une prévision (la commission de la prochaine activation), fixé
 * seulement à l'activation, quand le rang est connu. Elle ne se facture pas
 * encore : une facture la figerait à un montant qui peut monter.
 */
export function isProvisionalProgressive(row: { type: string; activated: boolean }): boolean {
  return row.type === "PROGRESSIVE" && !row.activated;
}

export type PlanActivation = { prospectId: string; at: Date };
export type PlanCommission = { id: string; prospectId: string; type: string; status: string; amountCents: number; invoiceId: string | null; bonusTier: number | null };

export type ProgressivePlan = {
  /** Les pharmacies activées, dans l'ordre d'activation (rang = index + 1). */
  ranked: (PlanActivation & { rank: number })[];
  /** Commissions PROGRESSIVE dont le montant change. `rank` : null pour une pharmacie pas encore activée (prévision). */
  amountUpdates: { id: string; prospectId: string; fromCents: number; toCents: number; rank: number | null }[];
  /** Bonus atteints sans ligne : à créer, acquis d'emblée si la pharmacie du palier a déjà payé. */
  bonusCreations: { tier: BonusTier; prospectId: string; earned: boolean }[];
  /**
   * Bonus de paliers atteints AVANT le passage du commercial à la grille, sans
   * ligne : jamais créés d'office (une décision du fondateur, par le script de
   * rattrapage et une option explicite).
   */
  preGridBonuses: { tier: BonusTier; prospectId: string; earned: boolean }[];
  /** Bonus prévisionnels à rattacher à la pharmacie qui atteint AUJOURD'HUI le palier (rangs corrigés entre-temps). */
  bonusRelinks: { id: string; tier: BonusTier; fromProspectId: string; toProspectId: string }[];
  /** Bonus prévisionnels dont la pharmacie du palier a payé : ils deviennent acquis. */
  bonusPromotions: { id: string; tier: BonusTier; prospectId: string }[];
};

/** L'ordre d'activation : la date, puis l'identifiant du dossier pour départager deux activations simultanées. */
export function rankActivations(activations: PlanActivation[]): (PlanActivation & { rank: number })[] {
  return [...activations]
    .sort((a, b) => a.at.getTime() - b.at.getTime() || (a.prospectId < b.prospectId ? -1 : a.prospectId > b.prospectId ? 1 : 0))
    .map((activation, index) => ({ ...activation, rank: index + 1 }));
}

/**
 * Les paliers de bonus atteints AVANT `since` (le passage du commercial à la
 * grille) : ceux dont la pharmacie du palier a été activée avant. `ranked` est
 * dans l'ordre d'activation. Sans date de passage : aucun.
 */
export function preGridTiers(ranked: { at: Date }[], since: Date | null | undefined): BonusTier[] {
  if (!since) return [];
  return BONUS_TIERS.filter((tier) => ranked.length >= tier.at && ranked[tier.at - 1].at.getTime() < since.getTime());
}

/**
 * Ce que le recalcul doit écrire pour un commercial, à partir de SES
 * activations (celles qui lui sont créditées), de ses commissions et des
 * pharmacies qui ont déjà payé. Pur : le service l'applique sous verrou, dans
 * une transaction.
 *
 * - commission PROGRESSIVE d'une pharmacie activée : la commission de son rang ;
 * - commission PROGRESSIVE d'une pharmacie pas encore activée : la prévision,
 *   commission de la prochaine (rang n + 1) ;
 * - commission PROGRESSIVE d'une pharmacie activée mais créditée à un AUTRE
 *   commercial (dossier réaffecté avant son activation) : elle garde son
 *   montant, jamais recalculé sur un rang qui n'est pas le sien ;
 * - une commission payée, annulée ou facturée ne bouge jamais ;
 * - les autres types (montant fixe d'avant la grille, montant fixé à la main,
 *   accords particuliers) gardent leur montant ;
 * - bonus : une ligne par palier atteint, jamais deux, jamais supprimée ni
 *   rétrogradée ; acquise quand la pharmacie qui a atteint le palier a fait
 *   son premier paiement. Un palier atteint avant le passage à la grille
 *   (`gridSince`) n'est créé que sur demande explicite (`includePreGridBonuses`).
 * - commercial sorti de la grille (`gridActive: false`) : seuls ses bonus déjà
 *   débloqués continuent de devenir acquis au premier paiement ; rien d'autre.
 */
export function planProgressiveSync(input: {
  activations: PlanActivation[];
  commissions: PlanCommission[];
  paidProspectIds: ReadonlySet<string>;
  activatedElsewhere?: ReadonlySet<string>;
  gridSince?: Date | null;
  includePreGridBonuses?: boolean;
  gridActive?: boolean;
}): ProgressivePlan {
  const ranked = rankActivations(input.activations);
  const rankOf = new Map(ranked.map((activation) => [activation.prospectId, activation.rank]));
  const count = ranked.length;
  const gridActive = input.gridActive ?? true;
  const elsewhere = input.activatedElsewhere ?? new Set<string>();
  const preGrid = new Set(preGridTiers(ranked, input.gridSince).map((tier) => tier.at));

  const amountUpdates: ProgressivePlan["amountUpdates"] = [];
  if (gridActive) {
    for (const row of input.commissions) {
      if (row.type !== "PROGRESSIVE" || !isRecomputable(row)) continue;
      const rank = rankOf.get(row.prospectId) ?? null;
      if (rank === null && elsewhere.has(row.prospectId)) continue;
      const toCents = rank === null ? rateForRank(count + 1) : rateForRank(rank);
      if (toCents !== row.amountCents) amountUpdates.push({ id: row.id, prospectId: row.prospectId, fromCents: row.amountCents, toCents, rank });
    }
  }

  const bonusCreations: ProgressivePlan["bonusCreations"] = [];
  const preGridBonuses: ProgressivePlan["preGridBonuses"] = [];
  const bonusRelinks: ProgressivePlan["bonusRelinks"] = [];
  const bonusPromotions: ProgressivePlan["bonusPromotions"] = [];
  for (const tier of BONUS_TIERS) {
    const reached = count >= tier.at;
    const threshold = reached ? ranked[tier.at - 1].prospectId : null;
    const existing = input.commissions.find((row) => row.type === "BONUS" && row.bonusTier === tier.at);
    if (!existing) {
      if (!gridActive || !threshold) continue;
      const creation = { tier, prospectId: threshold, earned: input.paidProspectIds.has(threshold) };
      if (preGrid.has(tier.at) && !input.includePreGridBonuses) preGridBonuses.push(creation);
      else bonusCreations.push(creation);
      continue;
    }
    // Acquis, payé, facturé ou annulé : la décision est prise, le recalcul n'y revient jamais.
    if (existing.status !== "FORECAST" || existing.invoiceId !== null) continue;
    // La pharmacie du palier : celle d'aujourd'hui (grille active, palier atteint), sinon celle de la ligne.
    const target = gridActive && threshold ? threshold : existing.prospectId;
    if (target !== existing.prospectId) bonusRelinks.push({ id: existing.id, tier, fromProspectId: existing.prospectId, toProspectId: target });
    if (input.paidProspectIds.has(target)) bonusPromotions.push({ id: existing.id, tier, prospectId: target });
  }

  return { ranked, amountUpdates, bonusCreations, preGridBonuses, bonusRelinks, bonusPromotions };
}

// ---------------------------------------------------------------- Écran du commercial

export type EarningRow = { type: string; status: string; amountCents: number; bonusTier: number | null; createdAt?: Date };

const ACQUIRED = new Set(["EARNED", "PAYABLE", "PAID"]);

export type EarningsSummary = {
  /** Commissions (hors bonus) acquises, à payer ou payées. */
  commissionsCents: number;
  /** Commissions prévisionnelles (contrat envoyé ou signé, pas encore acquises). */
  commissionsUpcomingCents: number;
  /** Bonus acquis, à payer ou payés. */
  bonusesCents: number;
  /** Bonus atteints en attente du premier paiement de la pharmacie du palier. */
  bonusesUpcomingCents: number;
  /** Gains cumulés : commissions + bonus acquis, à payer ou payés. */
  totalCents: number;
  /** À venir : commissions et bonus prévisionnels. */
  upcomingCents: number;
  paidCents: number;
  /** Acquis, pas encore payé. */
  toBePaidCents: number;
};

/** Les vrais gains d'un commercial, à partir de SES lignes de commission. Les annulées ne comptent nulle part. */
export function summarizeEarnings(rows: EarningRow[]): EarningsSummary {
  const sum = (predicate: (row: EarningRow) => boolean) => rows.filter(predicate).reduce((total, row) => total + row.amountCents, 0);
  const isBonus = (row: EarningRow) => row.type === "BONUS";
  const commissionsCents = sum((row) => !isBonus(row) && ACQUIRED.has(row.status));
  const bonusesCents = sum((row) => isBonus(row) && ACQUIRED.has(row.status));
  const commissionsUpcomingCents = sum((row) => !isBonus(row) && row.status === "FORECAST");
  const bonusesUpcomingCents = sum((row) => isBonus(row) && row.status === "FORECAST");
  return {
    commissionsCents,
    commissionsUpcomingCents,
    bonusesCents,
    bonusesUpcomingCents,
    totalCents: commissionsCents + bonusesCents,
    upcomingCents: commissionsUpcomingCents + bonusesUpcomingCents,
    paidCents: sum((row) => row.status === "PAID"),
    toBePaidCents: sum((row) => row.status === "EARNED" || row.status === "PAYABLE"),
  };
}

export type RewardState = "PAID" | "EARNED" | "AWAITING_PAYMENT" | "BEFORE_GRID" | "LOCKED" | "CANCELLED";

/**
 * « Débloqué » veut dire ACQUIS (le bonus sera versé) ; un palier simplement
 * atteint attend encore le premier paiement de la pharmacie du palier.
 */
export const REWARD_STATE_LABELS: Record<RewardState, string> = {
  PAID: "Versé",
  EARNED: "Débloqué",
  AWAITING_PAYMENT: "En attente du 1er paiement",
  BEFORE_GRID: "Atteint avant la grille",
  LOCKED: "À débloquer",
  CANCELLED: "Annulé",
};

export type Reward = BonusTier & { state: RewardState; remaining: number };

/**
 * « Mes récompenses » : l'état de chaque bonus. La ligne de bonus fait foi
 * quand elle existe (versé, acquis, annulé, en attente) ; sans ligne, un
 * palier atteint avant le passage à la grille (`beforeGrid`) le dit, et un
 * palier atteint depuis attend le premier paiement (ou son enregistrement).
 */
export function rewardsFor(pharmacies: number, bonusRows: { bonusTier: number | null; status: string }[], beforeGrid: readonly number[] = []): Reward[] {
  const n = toCount(pharmacies);
  return BONUS_TIERS.map((tier) => {
    const row = bonusRows.find((candidate) => candidate.bonusTier === tier.at);
    const remaining = Math.max(0, tier.at - n);
    if (row) {
      const state: RewardState = row.status === "PAID" ? "PAID" : row.status === "EARNED" || row.status === "PAYABLE" ? "EARNED" : row.status === "CANCELLED" ? "CANCELLED" : "AWAITING_PAYMENT";
      return { ...tier, state, remaining };
    }
    if (n < tier.at) return { ...tier, state: "LOCKED", remaining };
    return { ...tier, state: beforeGrid.includes(tier.at) ? "BEFORE_GRID" : "AWAITING_PAYMENT", remaining };
  });
}

/**
 * La ligne sous « Bonus débloqués » : ce que deviennent les paliers atteints,
 * d'après l'état de chaque récompense (jamais un simple compte des paliers
 * non verrouillés : un bonus annulé n'est pas débloqué).
 */
export function bonusStatusLine(rewards: Reward[], euros: (cents: number) => string): string {
  const of = (state: RewardState) => rewards.filter((reward) => reward.state === state);
  const parts: string[] = [];
  const paid = of("PAID").length;
  const earned = of("EARNED").length;
  const awaiting = of("AWAITING_PAYMENT");
  if (paid > 0) parts.push(`${paid} versé${paid > 1 ? "s" : ""}`);
  if (earned > 0) parts.push(`${earned} à verser`);
  if (awaiting.length > 0) parts.push(`${awaiting.length} en attente du 1er paiement (+${euros(awaiting.reduce((total, reward) => total + reward.cents, 0))})`);
  const beforeGrid = of("BEFORE_GRID").length;
  if (beforeGrid > 0) parts.push(`${beforeGrid} atteint${beforeGrid > 1 ? "s" : ""} avant la grille`);
  if (parts.length > 0) return parts.join(" · ");
  const next = rewards.find((reward) => reward.state === "LOCKED");
  return next ? `prochain : ${next.name} à ${next.at} pharmacies` : "aucun bonus à venir";
}
