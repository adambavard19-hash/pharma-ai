/**
 * Le quiz rapide qui suit une vidéo : notation, seuil de réussite, et validation de ce que saisit la console.
 *
 * Une question est « à choix unique » quand elle a une seule bonne réponse, « à choix multiples » sinon. Une réponse
 * n'est juste que si l'ensemble coché est EXACTEMENT l'ensemble des bonnes réponses (pas de demi-point). Les bonnes
 * réponses ne quittent jamais le serveur avant que la personne ait répondu.
 */

export const DEFAULT_PASS_PERCENT = 70;
export const MAX_QUESTIONS = 10;
export const MIN_CHOICES = 2;
export const MAX_CHOICES = 6;

export type QuizQuestionData = {
  id: string;
  prompt: string;
  choices: string[];
  correctIndexes: number[];
  explanation: string | null;
  sourceLabel?: string | null;
};

export function isMultiple(question: Pick<QuizQuestionData, "correctIndexes">): boolean {
  return question.correctIndexes.length > 1;
}

/** Les index choisis, nettoyés : entiers, dans les bornes, sans doublon, triés. */
export function cleanChoice(chosen: unknown, choiceCount: number): number[] {
  if (!Array.isArray(chosen)) return [];
  const set = new Set<number>();
  for (const value of chosen) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value < choiceCount) set.add(value);
  }
  return [...set].sort((a, b) => a - b);
}

export function isCorrect(question: Pick<QuizQuestionData, "correctIndexes" | "choices">, chosen: unknown): boolean {
  const picked = cleanChoice(chosen, question.choices.length);
  const expected = [...new Set(question.correctIndexes)].sort((a, b) => a - b);
  return picked.length === expected.length && picked.every((value, index) => value === expected[index]);
}

export type AnswerFeedback = { questionId: string; correct: boolean; correctIndexes: number[]; explanation: string | null; sourceLabel: string | null };

export function feedbackFor(question: QuizQuestionData, chosen: unknown): AnswerFeedback {
  return { questionId: question.id, correct: isCorrect(question, chosen), correctIndexes: [...question.correctIndexes].sort((a, b) => a - b), explanation: question.explanation, sourceLabel: question.sourceLabel ?? null };
}

export type QuizScore = {
  score: number;
  correctCount: number;
  totalCount: number;
  passed: boolean;
  passPercent: number;
  answers: { questionId: string; chosen: number[]; correct: boolean }[];
};

/** Un seuil valable : un entier de 1 à 100 ; sinon le seuil par défaut. */
export function passPercentOf(value: number | null | undefined): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 100 ? value : DEFAULT_PASS_PERCENT;
}

/**
 * La note d'une tentative. Une question laissée sans réponse est fausse ; une réponse à une question inconnue est
 * ignorée. Un quiz vide ne se réussit pas.
 */
export function scoreQuiz(questions: QuizQuestionData[], answers: Record<string, unknown>, passPercent: number = DEFAULT_PASS_PERCENT): QuizScore {
  const threshold = passPercentOf(passPercent);
  const rows = questions.map((question) => {
    const chosen = cleanChoice(answers[question.id], question.choices.length);
    return { questionId: question.id, chosen, correct: isCorrect(question, chosen) };
  });
  const correctCount = rows.filter((row) => row.correct).length;
  const totalCount = questions.length;
  const score = totalCount === 0 ? 0 : Math.round((correctCount / totalCount) * 100);
  return { score, correctCount, totalCount, passed: totalCount > 0 && score >= threshold, passPercent: threshold, answers: rows };
}

// --- La console : saisie d'une question -----------------------------------------------------------------------

export type QuestionDraft = { prompt: string; choices: string[]; correctIndexes: number[]; explanation?: string | null; sourceLabel?: string | null };
export type CleanQuestion = { prompt: string; choices: string[]; correctIndexes: number[]; explanation: string | null; sourceLabel: string | null };

function text(value: string | null | undefined, max: number): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Valide les questions d'un quiz. Les choix vides sont retirés (et les bonnes réponses recalées sur les choix
 * restants). Rend la première erreur, en français, avec le rang de la question.
 */
export function normalizeQuestions(drafts: QuestionDraft[]): { ok: true; questions: CleanQuestion[] } | { ok: false; error: string } {
  if (drafts.length > MAX_QUESTIONS) return { ok: false, error: `${MAX_QUESTIONS} questions au plus.` };
  const questions: CleanQuestion[] = [];
  for (const [index, draft] of drafts.entries()) {
    const rank = `Question ${index + 1}`;
    const prompt = text(draft.prompt, 300);
    if (prompt.length < 5) return { ok: false, error: `${rank} : écrivez la question.` };
    const kept: { label: string; correct: boolean }[] = [];
    draft.choices.forEach((choice, choiceIndex) => {
      const label = text(choice, 200);
      if (label) kept.push({ label, correct: draft.correctIndexes.includes(choiceIndex) });
    });
    if (kept.length < MIN_CHOICES) return { ok: false, error: `${rank} : proposez au moins ${MIN_CHOICES} réponses.` };
    if (kept.length > MAX_CHOICES) return { ok: false, error: `${rank} : ${MAX_CHOICES} réponses au plus.` };
    if (new Set(kept.map((choice) => choice.label.toLowerCase())).size !== kept.length) return { ok: false, error: `${rank} : deux réponses sont identiques.` };
    const correctIndexes = kept.flatMap((choice, choiceIndex) => (choice.correct ? [choiceIndex] : []));
    if (correctIndexes.length === 0) return { ok: false, error: `${rank} : cochez au moins une bonne réponse.` };
    if (correctIndexes.length === kept.length) return { ok: false, error: `${rank} : toutes les réponses ne peuvent pas être bonnes.` };
    const explanation = text(draft.explanation, 600);
    if (explanation.length < 10) return { ok: false, error: `${rank} : expliquez la bonne réponse (elle s'affiche après la réponse).` };
    questions.push({ prompt, choices: kept.map((choice) => choice.label), correctIndexes, explanation, sourceLabel: text(draft.sourceLabel, 200) || null });
  }
  return { ok: true, questions };
}

/** Les choix tels qu'ils sont stockés (Json) : une liste de textes, sinon rien. */
export function choicesOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((choice): choice is string => typeof choice === "string") : [];
}
