"use server";

import { z } from "zod";
import { getUserSession } from "@/server/auth/user-session";
import { academyViewer, checkAnswer, recordWatch, submitQuiz, type QuizOutcome } from "@/server/services/mobile/academy";
import { recordSponsoredTrainingEvent } from "@/server/services/mobile/sponsoring";
import type { AnswerFeedback } from "@/core/academy/quiz";
import { fail, ok, type ActionResult } from "./types";

/**
 * L'Académie, côté personne : avancée de lecture, correction d'une réponse, tentative de quiz. Chaque action relit la
 * session : la progression et les tentatives sont TOUJOURS celles de la personne connectée, dans son contexte courant
 * (officine active, ou hors officine). Un contenu qu'elle ne peut pas voir est « introuvable ». Pas de revalidation
 * ici : le fil ne doit pas se réordonner sous le doigt ; les écrans, dynamiques, relisent la base à la navigation.
 */

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

async function viewerOrNull() {
  const session = await getUserSession();
  return session ? Object.assign(await academyViewer(session), { sessionSecret: session.sessionId }) : null;
}

/** Compteurs agrégés des parcours sponsorisés (sans identité ; ne casse jamais une formation). */
function countSponsored(contentId: string, kind: "training_started" | "training_completed", sessionSecret: string) {
  void recordSponsoredTrainingEvent({ contentId, kind, sessionSecret });
}

const watchSchema = z.object({ contentId: id, percent: z.number().min(0).max(100) });

export async function recordWatchAction(payload: z.input<typeof watchSchema>): Promise<ActionResult<{ status: string; percent: number; newBadges: { title: string; kind: string }[] }>> {
  const viewer = await viewerOrNull();
  if (!viewer) return fail("Votre session a expiré : reconnectez-vous.");
  const parsed = watchSchema.safeParse(payload);
  if (!parsed.success) return fail("Demande invalide.");
  const result = await recordWatch(viewer, parsed.data.contentId, parsed.data.percent);
  if (!result) return fail("Formation introuvable.");
  countSponsored(parsed.data.contentId, result.status === "DONE" ? "training_completed" : "training_started", viewer.sessionSecret);
  return ok(result);
}

const answerSchema = z.object({ contentId: id, questionId: id, chosen: z.array(z.number().int().min(0).max(20)).max(10) });

export async function checkAnswerAction(payload: z.input<typeof answerSchema>): Promise<ActionResult<AnswerFeedback>> {
  const viewer = await viewerOrNull();
  if (!viewer) return fail("Votre session a expiré : reconnectez-vous.");
  const parsed = answerSchema.safeParse(payload);
  if (!parsed.success) return fail("Choisissez une réponse.");
  const feedback = await checkAnswer(viewer, parsed.data.contentId, parsed.data.questionId, parsed.data.chosen);
  return feedback ? ok(feedback) : fail("Question introuvable.");
}

const quizSchema = z.object({ contentId: id, answers: z.record(id, z.array(z.number().int().min(0).max(20)).max(10)) });

export async function submitQuizAction(payload: z.input<typeof quizSchema>): Promise<ActionResult<QuizOutcome>> {
  const viewer = await viewerOrNull();
  if (!viewer) return fail("Votre session a expiré : reconnectez-vous.");
  const parsed = quizSchema.safeParse(payload);
  if (!parsed.success) return fail("Réponses illisibles : recommencez le quiz.");
  const outcome = await submitQuiz(viewer, parsed.data.contentId, parsed.data.answers);
  if (!outcome) return fail("Quiz introuvable.");
  if (outcome.passed) countSponsored(parsed.data.contentId, "training_completed", viewer.sessionSecret);
  return ok(outcome, outcome.passed ? "Quiz réussi." : "Quiz à retenter.");
}
