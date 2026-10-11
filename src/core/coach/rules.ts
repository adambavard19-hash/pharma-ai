import { UNIVERSES, universeLabel } from "@/config/universes";

/**
 * Le coach de formation, version 1 : des règles écrites, lisibles, sans modèle de langage.
 *
 * Il lit UNIQUEMENT ce que la personne a le droit de voir d'elle-même : les conseils PharmaBoost apparus sur SES ventes
 * (comptoir qui lui est attribué ou ventes qu'elle a saisies), leur issue, le motif de refus quand il a été donné, ses
 * formations suivies et ses scores de quiz. Il n'en garde que des agrégats par univers — jamais un patient, une
 * ordonnance ni une vente.
 *
 * Principe premier : un refus n'est PAS un manque de connaissance par défaut.
 *  - le patient refuse, trouve trop cher, a déjà le produit → rien à apprendre, aucune formation ;
 *  - rupture de stock → un signal de stock, pas de formation ;
 *  - « cliniquement inadapté » → on ne pousse JAMAIS le pharmacien : la règle de conseil part en validation clinique
 *    centrale (ClinicalReviewFlag), c'est elle qu'on relit ;
 *  - « Non vendu » sans motif (ou « autre ») → non concluant : seul, il ne déclenche jamais rien.
 * Une formation n'est suggérée que si, dans un même univers, des conseils non concluants se répètent (au moins
 * `MIN_OCCURRENCES`), que la majorité des conseils tranchés n'aboutissent pas, ET que la personne n'a pas de bagage
 * dans cet univers (aucune formation terminée, ou des quiz sous `LOW_QUIZ_SCORE`) — et seulement une formation relue
 * et publiée de cet univers, qu'elle n'a pas déjà terminée.
 *
 * Module pur : aucune base, aucun réseau. Les essais vérifient chaque ligne de la table de décision.
 */

export const COACH_WINDOW_DAYS = 30;
/** En dessous, une série de conseils sans suite ne dit rien. */
export const MIN_OCCURRENCES = 5;
/** Score moyen de quiz (sur 100) en dessous duquel l'univers est jugé « peu maîtrisé ». */
export const LOW_QUIZ_SCORE = 60;
/** Part minimale de conseils tranchés sans suite pour parler de difficulté (le reste est la vie normale du comptoir). */
export const MIN_UNSUCCESSFUL_SHARE = 0.5;
/** Une suggestion écartée ne revient pas avant ce délai. */
export const DISMISS_COOLDOWN_DAYS = 30;

export const REFUSAL_REASONS = ["PATIENT_REFUSED", "OUT_OF_STOCK", "CLINICALLY_INAPPROPRIATE", "PRICE", "ALREADY_OWNED", "OTHER"] as const;
export type RefusalReason = (typeof REFUSAL_REASONS)[number];

export const REFUSAL_REASON_LABELS: Record<RefusalReason, string> = {
  PATIENT_REFUSED: "Le patient n'en veut pas",
  PRICE: "Trop cher pour le patient",
  ALREADY_OWNED: "Le patient l'a déjà",
  OUT_OF_STOCK: "En rupture",
  CLINICALLY_INAPPROPRIATE: "Pas adapté à ce patient",
  OTHER: "Autre raison",
};

export function isRefusalReason(value: unknown): value is RefusalReason {
  return typeof value === "string" && (REFUSAL_REASONS as readonly string[]).includes(value);
}

/** Les statuts d'un conseil retenu (la même définition que le classement de l'équipe). */
export const VALIDATED = new Set(["ACCEPTED", "MODIFIED", "REPLACED", "PRESENTED", "PURCHASED"]);
/** Les statuts d'un conseil qui n'a pas abouti. */
export const NOT_VALIDATED = new Set(["DECLINED", "IGNORED", "REMOVED"]);

/**
 * Ce que dit l'issue d'un conseil.
 *  - VALIDATED : retenu.
 *  - PENDING : pas encore tranché, on ne le lit pas.
 *  - PATIENT_CHOICE : le patient a décidé (refus, prix, déjà équipé) — jamais une formation.
 *  - STOCK_SIGNAL : rupture — un sujet de stock, jamais une formation.
 *  - CLINICAL_REVIEW : jugé inadapté — remonte à la validation clinique centrale, jamais une formation.
 *  - INCONCLUSIVE : sans motif, ou « autre » — ne prouve rien à lui seul.
 */
export type OutcomeClass = "VALIDATED" | "PENDING" | "PATIENT_CHOICE" | "STOCK_SIGNAL" | "CLINICAL_REVIEW" | "INCONCLUSIVE";

export function classifyOutcome(status: string, reason: string | null | undefined): OutcomeClass {
  if (VALIDATED.has(status)) return "VALIDATED";
  if (!NOT_VALIDATED.has(status)) return "PENDING";
  switch (reason) {
    case "PATIENT_REFUSED":
    case "PRICE":
    case "ALREADY_OWNED":
      return "PATIENT_CHOICE";
    case "OUT_OF_STOCK":
      return "STOCK_SIGNAL";
    case "CLINICALLY_INAPPROPRIATE":
      return "CLINICAL_REVIEW";
    default:
      return "INCONCLUSIVE";
  }
}

/** Univers d'un conseil, d'après la catégorie du besoin (ou, à défaut, celle du produit). Null : aucun univers connu. */
export function universeOfCategory(...categories: (string | null | undefined)[]): string | null {
  for (const category of categories) {
    if (!category) continue;
    const universe = UNIVERSES.find((entry) => entry.categories.includes(category as never));
    if (universe) return universe.key;
  }
  return null;
}

export type CoachAdvice = { status: string; reason: string | null; universe: string | null; ruleKey: string | null };
export type CoachTraining = { universe: string | null; completed: boolean };
export type CoachQuiz = { universe: string | null; score: number };
export type CoachCandidate = { contentId: string; universe: string; title: string };

export type UniverseTally = {
  universe: string;
  proposed: number;
  validated: number;
  patientChoice: number;
  stockSignal: number;
  clinicalReview: number;
  inconclusive: number;
};

export type UniverseEvidence = UniverseTally & {
  trainingsCompleted: number;
  /** Moyenne des quiz de l'univers ; null sans quiz. */
  averageQuizScore: number | null;
};

export type CoachSuggestion = {
  universe: string;
  contentId: string;
  /** Ce qui fonde la suggestion : des AGRÉGATS, rien d'autre. */
  evidence: UniverseEvidence & { windowDays: number };
  /** Pourquoi, en une phrase de français courant (règle par défaut ; un narrateur peut la reformuler). */
  explanation: string;
};

/** Une règle à relire par la validation clinique centrale : un compte, une officine, aucun détail de vente. */
export type ClinicalSignal = { ruleKey: string; count: number };

export type CoachOutcome = { suggestions: CoachSuggestion[]; clinicalSignals: ClinicalSignal[]; tallies: UniverseTally[] };

export function tallyByUniverse(advice: CoachAdvice[]): UniverseTally[] {
  const map = new Map<string, UniverseTally>();
  for (const item of advice) {
    if (!item.universe) continue;
    const kind = classifyOutcome(item.status, item.reason);
    if (kind === "PENDING") continue;
    const row = map.get(item.universe) ?? { universe: item.universe, proposed: 0, validated: 0, patientChoice: 0, stockSignal: 0, clinicalReview: 0, inconclusive: 0 };
    row.proposed += 1;
    if (kind === "VALIDATED") row.validated += 1;
    else if (kind === "PATIENT_CHOICE") row.patientChoice += 1;
    else if (kind === "STOCK_SIGNAL") row.stockSignal += 1;
    else if (kind === "CLINICAL_REVIEW") row.clinicalReview += 1;
    else row.inconclusive += 1;
    map.set(item.universe, row);
  }
  return [...map.values()].sort((a, b) => b.proposed - a.proposed || a.universe.localeCompare(b.universe));
}

/** Les règles jugées inadaptées, comptées : elles vont à la validation clinique, jamais à la personne. */
export function clinicalSignals(advice: CoachAdvice[]): ClinicalSignal[] {
  const counts = new Map<string, number>();
  for (const item of advice) {
    if (!item.ruleKey || classifyOutcome(item.status, item.reason) !== "CLINICAL_REVIEW") continue;
    counts.set(item.ruleKey, (counts.get(item.ruleKey) ?? 0) + 1);
  }
  return [...counts.entries()].map(([ruleKey, count]) => ({ ruleKey, count })).sort((a, b) => b.count - a.count || a.ruleKey.localeCompare(b.ruleKey));
}

/** Le bagage de la personne dans un univers : formations terminées, moyenne des quiz. */
export function backgroundIn(universe: string, trainings: CoachTraining[], quizzes: CoachQuiz[]): { trainingsCompleted: number; averageQuizScore: number | null } {
  const trainingsCompleted = trainings.filter((training) => training.universe === universe && training.completed).length;
  const scores = quizzes.filter((quiz) => quiz.universe === universe).map((quiz) => quiz.score);
  const averageQuizScore = scores.length > 0 ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
  return { trainingsCompleted, averageQuizScore };
}

/** Le bagage manque-t-il ? Aucune formation terminée dans l'univers, ou des quiz faibles. */
export function lacksBackground(background: { trainingsCompleted: number; averageQuizScore: number | null }): boolean {
  if (background.averageQuizScore !== null && background.averageQuizScore < LOW_QUIZ_SCORE) return true;
  return background.trainingsCompleted === 0;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count > 1 ? many : one}`;
}

const UNIVERSE_PHRASES: Record<string, string> = {
  COMPLEMENTS_ALIMENTAIRES: "les compléments alimentaires",
  NUTRITION: "la nutrition",
  DERMOCOSMETIQUE: "la dermocosmétique",
  VETERINAIRE: "le conseil vétérinaire",
  ORTHOPEDIE: "l'orthopédie",
  BUCCO_DENTAIRE: "l'hygiène bucco-dentaire",
  BEBE: "l'univers bébé",
  HYGIENE_FEMININE: "l'hygiène féminine",
  PRESERVATIFS_LUBRIFIANTS: "les préservatifs et lubrifiants",
  DOULEUR: "la douleur",
  HIVER: "les produits d'hiver",
};

/** Le nom d'un univers dans une phrase, avec son article : « la dermocosmétique ». */
export function universePhrase(universe: string): string {
  return UNIVERSE_PHRASES[universe] ?? `l'univers « ${universeLabel(universe)} »`;
}

/** La phrase par défaut, factuelle, sans jugement. */
export function explainSuggestion(evidence: UniverseEvidence & { windowDays: number }): string {
  const what = universePhrase(evidence.universe);
  const background =
    evidence.averageQuizScore !== null && evidence.averageQuizScore < LOW_QUIZ_SCORE
      ? `Vos quiz sur ${what} sont à ${evidence.averageQuizScore} % de moyenne`
      : `Vous avez peu suivi de formations sur ${what}`;
  const period = evidence.windowDays === 30 ? "ces 30 derniers jours" : `ces ${evidence.windowDays} derniers jours`;
  return `${background} ; ${plural(evidence.inconclusive, "conseil de cet univers n'a pas abouti", "conseils de cet univers n'ont pas abouti")} ${period}, sans raison donnée par le patient. Une formation courte peut aider.`;
}

/**
 * La décision. Une suggestion au plus par univers, au plus `limit` en tout, uniquement parmi les formations proposées
 * (`candidates`, déjà filtrées : relues, publiées, visibles par la personne, ni terminées ni écartées récemment).
 */
export function decideCoach(input: {
  advice: CoachAdvice[];
  trainings: CoachTraining[];
  quizzes: CoachQuiz[];
  candidates: CoachCandidate[];
  windowDays?: number;
  limit?: number;
}): CoachOutcome {
  const windowDays = input.windowDays ?? COACH_WINDOW_DAYS;
  const tallies = tallyByUniverse(input.advice);
  const suggestions: CoachSuggestion[] = [];
  for (const tally of tallies) {
    if (tally.inconclusive < MIN_OCCURRENCES) continue;
    const decided = tally.proposed;
    const unsuccessful = decided - tally.validated;
    if (decided === 0 || unsuccessful / decided < MIN_UNSUCCESSFUL_SHARE) continue;
    const background = backgroundIn(tally.universe, input.trainings, input.quizzes);
    if (!lacksBackground(background)) continue;
    const candidate = input.candidates.find((item) => item.universe === tally.universe);
    if (!candidate) continue;
    const evidence = { ...tally, ...background, windowDays };
    suggestions.push({ universe: tally.universe, contentId: candidate.contentId, evidence, explanation: explainSuggestion(evidence) });
  }
  return { suggestions: suggestions.slice(0, input.limit ?? 3), clinicalSignals: clinicalSignals(input.advice), tallies };
}
