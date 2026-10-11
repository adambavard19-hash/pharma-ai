/**
 * Ce que le robot dit : UNE phrase utile à la fois, choisie parmi des faits que l'application connaît déjà. Module pur.
 *
 * Règles, sans exception :
 *  - le robot ne donne jamais de conseil médical : il rappelle un challenge, une date courte, un stock à envoyer, une
 *    formation à reprendre ; le conseil au patient reste celui du moteur, relu, sous le médicament ;
 *  - aucune donnée de patient : rien de ce qui est lu ici n'en contient ;
 *  - aucun montant de challenge : les paliers se disent en unités (le montant est l'accord commercial du titulaire) ;
 *  - rien à dire vaut mieux qu'une phrase creuse : sans fait utile, la liste est vide et la bulle ne s'affiche pas.
 *
 * Les données arrivent déjà restreintes à l'officine ACTIVE et à la personne connectée (voir server/services/robot-tips).
 */

export type RobotTipKind = "challenge" | "short-date" | "stock" | "bonus" | "training";

export type RobotTip = {
  /** Clé stable du fait (pour qu'un « plus tard » ne le remontre pas aujourd'hui). */
  key: string;
  kind: RobotTipKind;
  text: string;
  /** Le lien utile, s'il y en a un. */
  action: { href: string; label: string } | null;
  /** Le robot peut-il être écarté ? Un stock vieux d'une semaine ne se met pas de côté d'un geste. */
  dismissible: boolean;
};

// ---------------------------------------------------------------------------------------------------------------
// Challenges : « plus que 3 ventes »
// ---------------------------------------------------------------------------------------------------------------

export type TipChallenge = {
  id: string;
  title: string;
  /** Unités de l'équipe aujourd'hui. */
  teamUnits: number;
  /** Les paliers, en unités seulement. */
  milestones: readonly { units: number; reached: boolean }[];
  /** L'objectif quand le challenge en fixe un. */
  target: number | null;
  daysRemaining: number;
};

/** « Proche » : au plus 5 ventes du prochain palier, ou au plus 15 % de son seuil quand il est grand. */
export const NEAR_TIER_UNITS = 5;
export const NEAR_TIER_SHARE = 0.15;

export type NearTier = { challenge: TipChallenge; missing: number; goal: number; label: "palier" | "objectif" };

/** Le prochain seuil d'un challenge, et ce qu'il manque pour l'atteindre. Null quand tout est atteint ou sans seuil. */
export function nextGoal(challenge: TipChallenge): NearTier | null {
  const tier = [...challenge.milestones].sort((a, b) => a.units - b.units).find((milestone) => challenge.teamUnits < milestone.units);
  if (tier) return { challenge, missing: tier.units - challenge.teamUnits, goal: tier.units, label: "palier" };
  if (challenge.target !== null && challenge.target > 0 && challenge.teamUnits < challenge.target)
    return { challenge, missing: challenge.target - challenge.teamUnits, goal: challenge.target, label: "objectif" };
  return null;
}

export function isNear(goal: NearTier): boolean {
  return goal.missing > 0 && (goal.missing <= NEAR_TIER_UNITS || goal.missing <= Math.ceil(goal.goal * NEAR_TIER_SHARE));
}

/** Le challenge en cours le plus proche de son prochain seuil (le plus petit manque ; à égalité, celui qui finit le plus tôt). */
export function closestChallenge(challenges: readonly TipChallenge[]): NearTier | null {
  const near = challenges
    .filter((challenge) => challenge.daysRemaining > 0)
    .map(nextGoal)
    .filter((goal): goal is NearTier => goal !== null && isNear(goal));
  near.sort((a, b) => a.missing - b.missing || a.challenge.daysRemaining - b.challenge.daysRemaining || a.challenge.title.localeCompare(b.challenge.title, "fr"));
  return near[0] ?? null;
}

function challengeTip(near: NearTier, href: string | null): RobotTip {
  const sales = `${near.missing} vente${near.missing > 1 ? "s" : ""}`;
  return {
    key: `challenge:${near.challenge.id}:${near.goal}`,
    kind: "challenge",
    text: `Plus que ${sales} « ${near.challenge.title} » pour le ${near.label} de ${near.goal}.`,
    action: href ? { href, label: "Voir le challenge" } : null,
    dismissible: true,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Le comptoir (« Nouvelle vente »)
// ---------------------------------------------------------------------------------------------------------------

export type TipShortDate = { label: string; quantity: number | null; daysLeft: number };

export type CounterTipInput = {
  challenges: readonly TipChallenge[];
  /** Lots suivis encore en rayon, urgents et non périmés, du plus proche au plus lointain. */
  shortDates: readonly TipShortDate[];
  /** Âge du stock en jours ; null quand il n'a jamais été envoyé. */
  stockAgeDays: number | null;
  /** Le rappel du stock vaut seulement pour qui peut l'envoyer, et jamais en démonstration. */
  canUpdateStock: boolean;
  /** L'écran où cette personne lit les challenges (« Mon équipe »), ou null si elle n'y a pas accès. */
  challengeHref: string | null;
};

/** À partir de combien de jours le robot parle du stock : la règle du rappel existant (core/stock-deposit/rules). */
export type StockRule = (ageDays: number | null) => boolean;

/** Combien de noms la bulle cite au plus : le reste se lit sur l'écran des dates courtes. */
export const SHORT_DATE_NAMES = 2;

/**
 * Les phrases du comptoir, dans l'ordre où le robot les dira : un challenge proche d'un palier, puis les dates courtes
 * à proposer en premier, puis le stock à mettre à jour. La bulle n'en montre qu'une — la première non écartée.
 */
export function counterTips(input: CounterTipInput, stockIsStale: StockRule): RobotTip[] {
  const tips: RobotTip[] = [];

  const near = closestChallenge(input.challenges);
  if (near) tips.push(challengeTip(near, input.challengeHref));

  if (input.shortDates.length > 0) {
    const known = input.shortDates.every((lot) => lot.quantity !== null && lot.quantity > 0);
    const count = known ? input.shortDates.reduce((sum, lot) => sum + (lot.quantity ?? 0), 0) : input.shortDates.length;
    const unit = known ? (count > 1 ? "boîtes" : "boîte") : count > 1 ? "lots" : "lot";
    const names = [...new Set(input.shortDates.map((lot) => lot.label.trim()).filter(Boolean))];
    const listed = names.slice(0, SHORT_DATE_NAMES).join(", ") + (names.length > SHORT_DATE_NAMES ? "…" : "");
    tips.push({
      key: `short-date:${names.slice(0, SHORT_DATE_NAMES).join("|")}:${count}`,
      kind: "short-date",
      text: `${count} ${unit} en date courte à proposer en premier : ${listed}.`,
      action: { href: "/stock/dates-courtes", label: "Voir les dates courtes" },
      dismissible: true,
    });
  }

  if (input.canUpdateStock && stockIsStale(input.stockAgeDays)) {
    tips.push({
      key: `stock:${input.stockAgeDays ?? "jamais"}`,
      kind: "stock",
      text:
        input.stockAgeDays === null
          ? "Votre stock n'a jamais été envoyé : je conseille mieux avec ce que vous avez vraiment."
          : `Votre stock n'a pas été mis à jour depuis ${input.stockAgeDays} jour${input.stockAgeDays > 1 ? "s" : ""}.`,
      action: { href: "/stock/mise-a-jour", label: "Mettre à jour mon stock" },
      dismissible: false,
    });
  }

  return tips;
}

/** La phrase à montrer : la première que la personne n'a pas écartée aujourd'hui (une non écartable passe toujours). */
export function visibleTip(tips: readonly RobotTip[], dismissed: ReadonlySet<string>): RobotTip | null {
  return tips.find((tip) => !tip.dismissible || !dismissed.has(tip.key)) ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// L'application mobile (Accueil)
// ---------------------------------------------------------------------------------------------------------------

export type MobileTipInput = {
  /** Une prime validée par le titulaire et pas encore versée, la plus récente d'abord. */
  bonuses: readonly { id: string; label: string; status: "VALIDATED" | "PAID"; validatedAt: Date | null }[];
  challenges: readonly TipChallenge[];
  training: { title: string; href: string; mode: "continue" | "start"; percent: number } | null;
  now: Date;
};

/** Une prime validée reste une bonne nouvelle une semaine. */
export const BONUS_NEWS_DAYS = 7;

/**
 * La prochaine étape la plus utile pour la personne : une prime validée cette semaine (bonne nouvelle d'abord), un
 * challenge tout proche d'un palier, une formation commencée, une formation à découvrir. Rien sinon.
 */
export function mobileTip(input: MobileTipInput): RobotTip | null {
  const since = input.now.getTime() - BONUS_NEWS_DAYS * 86_400_000;
  const bonus = input.bonuses.find((entry) => entry.status === "VALIDATED" && entry.validatedAt && entry.validatedAt.getTime() >= since);
  if (bonus)
    return { key: `bonus:${bonus.id}`, kind: "bonus", text: `Bonne nouvelle : votre prime « ${bonus.label} » a été validée.`, action: { href: "/m/moi", label: "Voir mes primes" }, dismissible: true };

  const near = closestChallenge(input.challenges);
  if (near) return challengeTip(near, "/m/challenges");

  const training = input.training;
  if (training && training.mode === "continue")
    return { key: `training:${training.href}`, kind: "training", text: `Vous en êtes à ${training.percent} % de « ${training.title} ». On reprend ?`, action: { href: training.href, label: "Reprendre" }, dismissible: true };
  if (training)
    return { key: `training:${training.href}`, kind: "training", text: `Une formation vous attend : « ${training.title} ».`, action: { href: training.href, label: "Découvrir" }, dismissible: true };

  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// « Votre journée »
// ---------------------------------------------------------------------------------------------------------------

/** L'heure (0-23, heure de l'officine) et le nombre de conseils validés dans cette heure. */
export type HourCount = { hour: number; validated: number };

/** Le meilleur moment de la journée : l'heure où l'équipe a validé le plus de conseils (la plus tôt à égalité). Null sans conseil validé. */
export function bestMoment(hours: readonly HourCount[]): { hour: number; validated: number; label: string } | null {
  const best = [...hours].filter((entry) => entry.validated > 0).sort((a, b) => b.validated - a.validated || a.hour - b.hour)[0];
  if (!best) return null;
  return { ...best, label: `entre ${best.hour} h et ${(best.hour + 1) % 24} h` };
}

/** La récapitulation s'affiche d'elle-même à partir de 18 h (heure de l'officine) ; avant, à la demande. */
export const RECAP_HOUR = 18;

export function recapIsDue(hourInPharmacy: number): boolean {
  return hourInPharmacy >= RECAP_HOUR;
}
