import { countByFamily, describeFamilyMix, type AdviceFamily, type FamilyCounts } from "@/core/ai/family";
import type { AdviceView } from "./types";

/**
 * Où s'affiche chaque conseil, et sous quelle forme.
 *
 * Le moteur sait quel médicament a déclenché quel besoin (`lineIds`) : le
 * conseil se lit donc sous ce médicament, pas dans une colonne à part. Ce
 * module ne fait que ranger — il ne choisit, ne classe ni ne filtre rien : un
 * conseil rangé nulle part n'existe pas, il tombe dans la zone générale.
 */

/** Un conseil tranché ne se propose plus : il reste lisible, barré, jusqu'à ce qu'on revienne dessus. */
export const DECIDED_STATUSES: ReadonlySet<string> = new Set(["DECLINED", "REMOVED", "PURCHASED"]);

/**
 * Range les conseils par médicament.
 *
 * `lines` : les médicaments affichés (confirmés), dans l'ordre de l'ordonnance.
 * Un conseil va sous la première de ses lignes qui est affichée. Sans lien
 * (analyse antérieure au rattachement, conseil ajouté à la main, besoin sans
 * médicament) ou avec des lignes qui ne sont plus affichées, il reste dans
 * `general`.
 *
 * Une routine se lit d'un seul bloc : toutes ses étapes suivent la première
 * d'entre elles (celle qui porte le plus petit rang d'étape), même si les
 * suivantes pointent ailleurs. L'ordre reçu est conservé dans chaque groupe :
 * c'est celui de la page (priorité clinique du besoin, puis score), et les
 * conseils tranchés restent là où ils étaient proposés. Un médicament sans
 * conseil n'a pas d'entrée.
 */
export function groupAdviceByLine(
  lines: { id: string }[],
  recommendations: AdviceView[],
): { byLine: Map<string, AdviceView[]>; general: AdviceView[] } {
  const rank = new Map(lines.map((line, index) => [line.id, index]));

  const firstSteps = new Map<string, { stepIndex: number; lineIds: string[] }>();
  for (const recommendation of recommendations) {
    const routine = recommendation.routine;
    if (!routine) continue;
    const known = firstSteps.get(routine.key);
    if (!known || routine.stepIndex < known.stepIndex) {
      firstSteps.set(routine.key, { stepIndex: routine.stepIndex, lineIds: recommendation.lineIds });
    }
  }

  const byLine = new Map<string, AdviceView[]>();
  const general: AdviceView[] = [];
  for (const recommendation of recommendations) {
    const anchor = recommendation.routine ? firstSteps.get(recommendation.routine.key) : undefined;
    const lineIds = anchor ? anchor.lineIds : recommendation.lineIds;
    const shown = lineIds.map((id) => rank.get(id)).filter((position): position is number => position !== undefined);
    if (shown.length === 0) {
      general.push(recommendation);
      continue;
    }
    const lineId = lines[Math.min(...shown)].id;
    byLine.set(lineId, [...(byLine.get(lineId) ?? []), recommendation]);
  }
  return { byLine, general };
}

/** Une carte à l'écran : un conseil seul, ou une routine dont les étapes se lisent ensemble. */
export type AdviceCardItem =
  | { kind: "single"; recommendation: AdviceView }
  | { kind: "routine"; key: string; steps: AdviceView[] };

/**
 * Ce qui se montre, pour un groupe de conseils : les cartes à décider, ce
 * qu'on ne propose pas faute de stock, et ce qui est déjà tranché.
 *
 * Une routine (nettoyer, hydrater, protéger) est une seule carte : ses étapes
 * se lisent ensemble et se proposent ensemble.
 */
export function splitAdvice(recommendations: AdviceView[]): {
  cards: AdviceCardItem[];
  unavailable: AdviceView[];
  closed: AdviceView[];
} {
  const open = recommendations.filter((recommendation) => !DECIDED_STATUSES.has(recommendation.status));
  const available = open.filter((recommendation) => !recommendation.product || recommendation.product.quantity > 0);
  const unavailable = open.filter((recommendation) => recommendation.product && recommendation.product.quantity <= 0);
  const closed = recommendations.filter((recommendation) => DECIDED_STATUSES.has(recommendation.status));

  const cards: AdviceCardItem[] = [];
  const seenRoutines = new Set<string>();
  for (const recommendation of available) {
    const routine = recommendation.routine;
    if (!routine) {
      cards.push({ kind: "single", recommendation });
      continue;
    }
    if (seenRoutines.has(routine.key)) continue;
    seenRoutines.add(routine.key);
    cards.push({
      kind: "routine",
      key: routine.key,
      steps: available.filter((step) => step.routine?.key === routine.key).sort((a, b) => (a.routine?.stepIndex ?? 0) - (b.routine?.stepIndex ?? 0)),
    });
  }
  return { cards, unavailable, closed };
}

/**
 * Vrai quand l'écran n'a ni carte ni conseil tranché à montrer, nulle part :
 * c'est alors l'issue de l'analyse qui explique pourquoi il n'y a rien. Un
 * conseil écarté faute de stock ne compte pas : il ne se montre pas.
 */
export function nothingToShow(recommendations: AdviceView[]): boolean {
  const { cards, closed } = splitAdvice(recommendations);
  return cards.length === 0 && closed.length === 0;
}

/** Combien de cartes attendent encore une décision (une routine compte pour une). */
export function countUndecided(cards: AdviceCardItem[], inBasket: (id: string) => boolean): number {
  return cards.filter((card) => (card.kind === "single" ? !inBasket(card.recommendation.id) : card.steps.some((step) => !inBasket(step.id)))).length;
}

/**
 * Les produits déjà présents parmi TOUS les conseils ouverts, rattachés ou non :
 * un produit associé déjà ajouté (même après rechargement) ne se repropose pas,
 * d'où qu'il vienne.
 */
export function presentProductIds(recommendations: AdviceView[]): Set<string> {
  return new Set(
    recommendations
      .filter((recommendation) => !DECIDED_STATUSES.has(recommendation.status))
      .map((recommendation) => recommendation.product?.id)
      .filter((id): id is string => Boolean(id)),
  );
}

/**
 * Vrai quand le conseil attend la réponse du patient : son besoin ne se
 * confirme que par lui (`requiresConfirmation`), sa question n'est pas vide, et
 * elle n'a ni réponse ni « ne sait pas » (`answer` et `answeredAt` vides). C'est
 * alors une « Une question au patient » à l'écran, et le produit ne se propose
 * qu'après un « oui ».
 *
 * UN seul prédicat, pour le bandeau (ce qui est proposé, ce qui l'est sous
 * réserve) et pour la liste des questions : les deux ne peuvent pas se contredire.
 */
function awaitsAnswer(recommendation: AdviceView): boolean {
  const opportunity = recommendation.opportunity;
  const question = opportunity?.question?.trim();
  if (!opportunity || !question || !opportunity.requiresConfirmation) return false;
  return opportunity.answer === null && opportunity.answeredAt === null;
}

/** Les conseils d'un même lot, famille par famille. */
export type FamilyMix = { counts: FamilyCounts; total: number; summary: string };

const mixOf = (families: AdviceFamily[]): FamilyMix => {
  const counts = countByFamily(families);
  return { counts, total: families.length, summary: describeFamilyMix(counts) };
};

/**
 * Le « conseil complet » : ce que l'ordonnance reçoit, famille par famille.
 *
 * Il se déduit des cartes ouvertes — ni tranchées, ni écartées faute de stock —
 * et jamais d'autre chose : une famille sans carte n'est pas écrite (pas de
 * reproche, pas de produit inventé). Une routine est UNE carte, de la famille
 * de sa première étape, comme dans le moteur où elle compte pour un conseil.
 *
 * Deux décomptes, pour ne rien affirmer que l'écran ne tienne :
 * - `open` : les conseils qu'on peut proposer tout de suite, sans réponse du patient ;
 * - `conditional` : les conseils sous réserve d'une réponse du patient (leur
 *   carte est une question, le produit n'est proposé qu'après un « oui »).
 * Une routine ne pose pas de question : elle est toujours `open`.
 */
export function familyMixOf(recommendations: AdviceView[]): { open: FamilyMix; conditional: FamilyMix } {
  const { cards } = splitAdvice(recommendations);
  const open: AdviceFamily[] = [];
  const conditional: AdviceFamily[] = [];
  for (const card of cards) {
    if (card.kind === "routine") open.push(card.steps[0].family);
    else (awaitsAnswer(card.recommendation) ? conditional : open).push(card.recommendation.family);
  }
  return { open: mixOf(open), conditional: mixOf(conditional) };
}

/** Une question à poser au patient, avec le conseil qu'elle ouvre. */
export type PendingQuestion = { opportunityId: string; recommendationId: string; question: string };

/**
 * Les questions qui attendent encore une réponse : celles des cartes ouvertes
 * dont le conseil attend la réponse du patient (même prédicat que le bandeau,
 * `awaitsAnswer`).
 *
 * Le geste de réponse reste celui de la carte : cette liste ne fait que dire
 * combien il y en a. Une question par besoin : si deux conseils partagent le
 * même besoin, la réponse vaut pour les deux. Une routine ne pose pas de
 * question sur sa carte, donc ses étapes n'en ajoutent aucune ici.
 */
export function pendingQuestionsOf(recommendations: AdviceView[]): PendingQuestion[] {
  const { cards } = splitAdvice(recommendations);
  const seen = new Set<string>();
  const pending: PendingQuestion[] = [];
  for (const card of cards) {
    if (card.kind !== "single" || !awaitsAnswer(card.recommendation)) continue;
    const opportunity = card.recommendation.opportunity!;
    if (seen.has(opportunity.id)) continue;
    seen.add(opportunity.id);
    pending.push({ opportunityId: opportunity.id, recommendationId: card.recommendation.id, question: opportunity.question!.trim() });
  }
  return pending;
}

/** « 1 question pour aller plus loin », « 3 questions pour aller plus loin ». */
export function describePendingQuestions(count: number): string {
  return `${count} question${count > 1 ? "s" : ""} pour aller plus loin`;
}
