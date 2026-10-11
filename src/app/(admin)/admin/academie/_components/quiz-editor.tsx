"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Save, Trash2, X } from "lucide-react";
import { saveQuizAction } from "@/server/actions/platform-academy";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { MAX_CHOICES, MAX_QUESTIONS } from "@/core/academy/quiz";
import { cn } from "@/lib/utils";

export type EditableQuestion = { prompt: string; choices: string[]; correctIndexes: number[]; explanation: string; sourceLabel: string };

const BLANK: EditableQuestion = { prompt: "", choices: ["", ""], correctIndexes: [], explanation: "", sourceLabel: "" };

/**
 * L'éditeur du quiz : des questions, leurs réponses, la ou les bonnes (cocher plusieurs = choix multiples), et
 * l'explication montrée après la réponse. Les règles (2 à 6 réponses, au moins une bonne, pas toutes, une explication)
 * sont vérifiées par le serveur, qui renvoie la première erreur.
 */
export function QuizEditor({ contentId, initial }: { contentId: string; initial: EditableQuestion[] }) {
  const [questions, setQuestions] = useState<EditableQuestion[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const { push } = useToast();

  const update = (index: number, change: Partial<EditableQuestion>) => {
    setDirty(true);
    setQuestions((current) => current.map((question, at) => (at === index ? { ...question, ...change } : question)));
  };
  const move = (index: number, delta: number) => {
    setDirty(true);
    setQuestions((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });
  };

  const save = () =>
    start(async () => {
      const result = await saveQuizAction({ contentId, questions: questions.map((question) => ({ ...question, explanation: question.explanation || null, sourceLabel: question.sourceLabel || null })) });
      push({ tone: result.ok ? "success" : "error", title: result.ok ? (result.message ?? "Enregistré.") : result.error });
      if (result.ok) {
        setDirty(false);
        router.refresh();
      }
    });

  return (
    <div className="space-y-4">
      {questions.length === 0 && <p className="text-[13px] text-text-tertiary">Pas de quiz : la vidéo vue jusqu&apos;au bout (90 %) suffit à terminer la formation.</p>}
      {questions.map((question, index) => (
        <fieldset key={index} className="space-y-3 rounded-xl border border-border-subtle p-4">
          <legend className="sr-only">Question {index + 1}</legend>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-text-secondary">
              Question {index + 1} · {question.correctIndexes.length > 1 ? "choix multiples" : "choix unique"}
            </p>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="icon" className="size-8" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Monter la question ${index + 1}`}>
                <ArrowUp className="size-4" aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-8" disabled={index === questions.length - 1} onClick={() => move(index, 1)} aria-label={`Descendre la question ${index + 1}`}>
                <ArrowDown className="size-4" aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="size-8 text-danger-700" onClick={() => { setDirty(true); setQuestions((current) => current.filter((_, at) => at !== index)); }} aria-label={`Supprimer la question ${index + 1}`}>
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <Field label="Question" htmlFor={`q-${index}-prompt`}>
            <Input id={`q-${index}-prompt`} value={question.prompt} onChange={(e) => update(index, { prompt: e.target.value })} maxLength={300} />
          </Field>
          <div className="space-y-2">
            <p className="text-[13px] font-medium text-text-primary">Réponses — cochez la ou les bonnes</p>
            {question.choices.map((choice, choiceIndex) => {
              const correct = question.correctIndexes.includes(choiceIndex);
              return (
                <div key={choiceIndex} className={cn("flex items-center gap-2 rounded-lg border px-2 py-1.5", correct ? "border-success-300 bg-success-50/60" : "border-border-subtle")}>
                  <input
                    type="checkbox"
                    id={`q-${index}-c-${choiceIndex}`}
                    checked={correct}
                    onChange={(e) => update(index, { correctIndexes: e.target.checked ? [...question.correctIndexes, choiceIndex].sort((a, b) => a - b) : question.correctIndexes.filter((value) => value !== choiceIndex) })}
                    className="size-4 rounded border-border-strong text-success-700"
                    aria-label={`Réponse ${choiceIndex + 1} correcte`}
                  />
                  <Input value={choice} onChange={(e) => update(index, { choices: question.choices.map((value, at) => (at === choiceIndex ? e.target.value : value)) })} maxLength={200} aria-label={`Réponse ${choiceIndex + 1}`} className="border-0 shadow-none focus:ring-0" />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    disabled={question.choices.length <= 2}
                    aria-label={`Retirer la réponse ${choiceIndex + 1}`}
                    onClick={() => update(index, { choices: question.choices.filter((_, at) => at !== choiceIndex), correctIndexes: question.correctIndexes.filter((value) => value !== choiceIndex).map((value) => (value > choiceIndex ? value - 1 : value)) })}
                  >
                    <X className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              );
            })}
            {question.choices.length < MAX_CHOICES && (
              <Button type="button" variant="ghost" size="sm" onClick={() => update(index, { choices: [...question.choices, ""] })} leadingIcon={<Plus className="size-4" aria-hidden="true" />}>
                Ajouter une réponse
              </Button>
            )}
          </div>
          <Field label="Explication (montrée après la réponse)" htmlFor={`q-${index}-explanation`}>
            <Textarea id={`q-${index}-explanation`} value={question.explanation} onChange={(e) => update(index, { explanation: e.target.value })} rows={2} maxLength={600} />
          </Field>
          <Field label="Source de l'explication" htmlFor={`q-${index}-source`} hint="RCP, recommandation, film… Ce qui permet de vérifier.">
            <Input id={`q-${index}-source`} value={question.sourceLabel} onChange={(e) => update(index, { sourceLabel: e.target.value })} maxLength={200} />
          </Field>
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={questions.length >= MAX_QUESTIONS} onClick={() => { setDirty(true); setQuestions((current) => [...current, { ...BLANK, choices: ["", ""] }]); }} leadingIcon={<Plus className="size-4" aria-hidden="true" />}>
          Ajouter une question
        </Button>
        <Button type="button" size="sm" loading={pending} disabled={!dirty} onClick={save} leadingIcon={<Save className="size-4" aria-hidden="true" />}>
          Enregistrer le quiz
        </Button>
      </div>
    </div>
  );
}
