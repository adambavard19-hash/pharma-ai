"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { ArrowRight, Award, Check, CheckCircle2, RotateCcw, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { checkAnswerAction, submitQuizAction } from "@/server/actions/mobile-academy";
import type { AnswerFeedback } from "@/core/academy/quiz";
import type { PlayableQuestion, QuizOutcome } from "@/server/services/mobile/academy";

/**
 * Le quiz rapide : une question à la fois, une correction immédiate avec son explication, puis la note. Les bonnes
 * réponses restent sur le serveur : la correction arrive après la réponse. La tentative complète est notée à nouveau
 * côté serveur et enregistrée ; réussie, elle termine la formation et ajoute le badge au passeport (une seule fois).
 */
export function QuizPlayer({ contentId, title, questions, passPercent, backHref, nextHref }: { contentId: string; title: string; questions: PlayableQuestion[]; passPercent: number; backHref: string; nextHref: string | null }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [outcome, setOutcome] = useState<QuizOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);

  const question = questions[index];
  const last = index === questions.length - 1;

  const pick = (choice: number) => {
    if (feedback) return;
    setSelected((current) => (question.multiple ? (current.includes(choice) ? current.filter((value) => value !== choice) : [...current, choice]) : [choice]));
  };

  const validate = () => {
    if (selected.length === 0) return;
    setError(null);
    start(async () => {
      const result = await checkAnswerAction({ contentId, questionId: question.id, chosen: selected });
      if (!result.ok) return setError(result.error);
      setFeedback(result.data);
      setAnswers((current) => ({ ...current, [question.id]: selected }));
    });
  };

  const next = () => {
    if (!last) {
      setIndex((value) => value + 1);
      setSelected([]);
      setFeedback(null);
      requestAnimationFrame(() => heading.current?.focus());
      return;
    }
    start(async () => {
      const result = await submitQuizAction({ contentId, answers });
      if (!result.ok) return setError(result.error);
      setOutcome(result.data);
    });
  };

  const restart = () => {
    setIndex(0);
    setSelected([]);
    setFeedback(null);
    setAnswers({});
    setOutcome(null);
    setError(null);
    requestAnimationFrame(() => heading.current?.focus());
  };

  if (outcome) return <QuizResult outcome={outcome} title={title} onRetry={restart} backHref={backHref} nextHref={nextHref} />;

  return (
    <div className="space-y-5">
      {/* Avancement */}
      <div className="space-y-2 px-1">
        <div className="flex items-center justify-between text-[12.5px] font-semibold text-text-tertiary">
          <span>
            Question {index + 1} sur {questions.length}
          </span>
          <span>Réussite à {passPercent} %</span>
        </div>
        <div className="flex gap-1.5" aria-hidden="true">
          {questions.map((item, position) => (
            <span key={item.id} className={cn("h-1.5 flex-1 rounded-full transition-colors", position < index || (position === index && feedback) ? "bg-brand-500" : position === index ? "bg-brand-200" : "bg-ink-200")} />
          ))}
        </div>
      </div>

      <section className="rounded-[24px] border border-white/70 bg-white p-5 shadow-[0_6px_28px_-8px_oklch(0.45_0.07_183/0.18)]">
        <h2 ref={heading} tabIndex={-1} className="text-[19px] leading-snug font-bold tracking-[-0.02em] text-ink-950 outline-none">
          {question.prompt}
        </h2>
        <p className="mt-1 text-[13px] text-text-tertiary">{question.multiple ? "Plusieurs réponses possibles." : "Une seule réponse."}</p>

        <div role={question.multiple ? "group" : "radiogroup"} aria-label={question.prompt} className="mt-4 space-y-2.5">
          {question.choices.map((choice, choiceIndex) => {
            const isSelected = selected.includes(choiceIndex);
            const isRight = feedback?.correctIndexes.includes(choiceIndex) ?? false;
            const isWrongPick = !!feedback && isSelected && !isRight;
            return (
              <button
                key={choiceIndex}
                type="button"
                role={question.multiple ? "checkbox" : "radio"}
                aria-checked={isSelected}
                disabled={!!feedback || pending}
                onClick={() => pick(choiceIndex)}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-[15px] leading-snug font-medium transition-all duration-150",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500",
                  !feedback && (isSelected ? "border-brand-500 bg-brand-50 text-ink-950" : "border-ink-200 bg-white text-ink-800 active:scale-[0.99]"),
                  feedback && isRight && "border-success-500 bg-success-50 text-success-900",
                  isWrongPick && "border-danger-400 bg-danger-50 text-danger-800",
                  feedback && !isRight && !isWrongPick && "border-ink-100 bg-white text-ink-400",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center border-2",
                    question.multiple ? "rounded-md" : "rounded-full",
                    feedback && isRight ? "border-success-600 bg-success-600 text-white" : isWrongPick ? "border-danger-500 bg-danger-500 text-white" : isSelected ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300",
                  )}
                >
                  {feedback && isRight ? <Check className="size-4" strokeWidth={3} /> : isWrongPick ? <X className="size-4" strokeWidth={3} /> : isSelected ? <Check className="size-4" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1">{choice}</span>
              </button>
            );
          })}
        </div>

        {/* La correction, annoncée aux lecteurs d'écran */}
        <div aria-live="polite" className="empty:hidden">
          {feedback && (
            <div className={cn("mt-4 rounded-2xl p-4", feedback.correct ? "bg-success-50" : "bg-accent-50")}>
              <p className={cn("flex items-center gap-2 text-[15px] font-bold", feedback.correct ? "text-success-800" : "text-accent-800")}>
                {feedback.correct ? <CheckCircle2 className="size-5" aria-hidden="true" /> : <XCircle className="size-5" aria-hidden="true" />}
                {feedback.correct ? "Bonne réponse" : "Pas tout à fait"}
              </p>
              {feedback.explanation && <p className="mt-1.5 text-[14px] leading-[1.5] text-ink-800">{feedback.explanation}</p>}
              {feedback.sourceLabel && <p className="mt-1.5 text-[12px] text-text-tertiary">Source : {feedback.sourceLabel}</p>}
            </div>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-3 text-[13.5px] font-medium text-danger-700">
            {error}
          </p>
        )}
      </section>

      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-10 lg:bottom-6">
        {feedback ? (
          <button type="button" onClick={next} disabled={pending} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand-gradient text-[16px] font-bold text-white shadow-lg transition-transform active:scale-[0.99] disabled:opacity-60">
            {last ? (pending ? "Calcul de votre note…" : "Voir ma note") : "Question suivante"}
            <ArrowRight className="size-5" aria-hidden="true" />
          </button>
        ) : (
          <button type="button" onClick={validate} disabled={selected.length === 0 || pending} className="flex h-14 w-full items-center justify-center rounded-2xl bg-ink-900 text-[16px] font-bold text-white shadow-lg transition-transform active:scale-[0.99] disabled:bg-ink-300">
            {pending ? "Vérification…" : "Valider ma réponse"}
          </button>
        )}
      </div>
    </div>
  );
}

const RING = 2 * Math.PI * 54;

function QuizResult({ outcome, title, onRetry, backHref, nextHref }: { outcome: QuizOutcome; title: string; onRetry: () => void; backHref: string; nextHref: string | null }) {
  return (
    <div className="space-y-5" role="status" aria-live="polite">
      <section className={cn("relative overflow-hidden rounded-[28px] p-6 text-center text-white shadow-[0_18px_40px_-18px_oklch(0.42_0.08_180/0.8)]", outcome.passed ? "bg-[linear-gradient(150deg,oklch(0.44_0.075_188),oklch(0.58_0.105_162))]" : "bg-[linear-gradient(150deg,oklch(0.4_0.03_230),oklch(0.5_0.04_220))]")}>
        <div aria-hidden="true" className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-white/12 blur-2xl" />
        <div className="relative mx-auto size-[132px]">
          <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
            <circle cx="60" cy="60" r="54" fill="none" stroke="white" strokeOpacity="0.22" strokeWidth="9" />
            <circle cx="60" cy="60" r="54" fill="none" stroke="white" strokeWidth="9" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING * (1 - outcome.score / 100)} className="transition-[stroke-dashoffset] duration-700" />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[34px] leading-none font-bold tabular">{outcome.score} %</span>
            <span className="mt-1 text-[12px] font-medium text-white/80">
              {outcome.correctCount}/{outcome.totalCount} juste{outcome.correctCount > 1 ? "s" : ""}
            </span>
          </span>
        </div>
        <h2 className="relative mt-4 text-[22px] font-bold tracking-[-0.02em]">{outcome.passed ? "Quiz réussi !" : "Presque !"}</h2>
        <p className="relative mt-1 text-[14px] leading-[1.45] text-white/85">
          {outcome.passed ? `« ${title} » est validée.` : `Il faut ${outcome.passPercent} % pour valider. Revoyez la vidéo, puis retentez : seules vos réponses comptent, pas le nombre d'essais.`}
        </p>
      </section>

      {outcome.newBadges.length > 0 && (
        <section className="space-y-2.5 rounded-[24px] border border-accent-200 bg-accent-50 p-4">
          <p className="flex items-center gap-2 text-[15px] font-bold text-accent-900">
            <Award className="size-5" aria-hidden="true" />
            Ajouté à votre passeport
          </p>
          <ul className="space-y-1.5">
            {outcome.newBadges.map((badge) => (
              <li key={`${badge.kind}-${badge.title}`} className="flex items-center gap-2 text-[14px] text-ink-800">
                <CheckCircle2 className="size-4 shrink-0 text-accent-700" aria-hidden="true" />
                {badge.kind === "MODULE_COMPLETED" ? `Parcours terminé : ${badge.title}` : `Quiz réussi : ${badge.title}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-2.5">
        {outcome.passed && nextHref && (
          <Link href={nextHref} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-brand-gradient text-[16px] font-bold text-white shadow-lg active:scale-[0.99]">
            Formation suivante
            <ArrowRight className="size-5" aria-hidden="true" />
          </Link>
        )}
        {!outcome.passed && (
          <button type="button" onClick={onRetry} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-brand-gradient text-[16px] font-bold text-white shadow-lg active:scale-[0.99]">
            <RotateCcw className="size-5" aria-hidden="true" />
            Retenter le quiz
          </button>
        )}
        <Link href={backHref} className="flex h-12 items-center justify-center rounded-2xl bg-white text-[15px] font-semibold text-ink-800 ring-1 ring-ink-200 active:scale-[0.99]">
          Revenir à la formation
        </Link>
        {outcome.passed && (
          <Link href="/m/formations?vue=passeport" className="flex h-12 items-center justify-center rounded-2xl text-[15px] font-semibold text-brand-700">
            Voir mon passeport
          </Link>
        )}
      </div>
    </div>
  );
}
