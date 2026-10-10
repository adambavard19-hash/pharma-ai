"use client";

import { useTransition } from "react";
import { Loader2, MessageCircleQuestion, TriangleAlert } from "lucide-react";
import { answerCounterQuestionAction } from "@/server/actions/counter-questions";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { ViewQuestion } from "@/core/counter/question-tree";

/**
 * Les questions du comptoir : « Pourquoi le patient prend-il son paracétamol ? », puis « Où a-t-il mal ? » ou la fièvre.
 *
 * Même arbre, mêmes réponses que dans la fenêtre du poste de caisse. Un conseil ciblé (la poche du dos, le thermomètre) n'apparaît
 * qu'une fois la question répondue : cocher « douleur localisée » puis « dos » fait apparaître la poche du dos, jamais avant.
 */
export function CounterQuestions({ prescriptionId, questions, guidance, canAnswer }: { prescriptionId: string; questions: ViewQuestion[]; guidance: string[]; canAnswer: boolean }) {
  const [pending, startTransition] = useTransition();
  const { push } = useToast();

  const answer = (node: string, choice: string) =>
    startTransition(async () => {
      const result = await answerCounterQuestionAction({ prescriptionId, node, choice });
      if (!result.ok) push({ tone: "error", title: result.error });
    });

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-text-primary">
          <MessageCircleQuestion className="size-4 text-brand-600" aria-hidden />
          Questions à poser au patient
          {pending && <Loader2 className="size-3.5 animate-spin text-text-tertiary" aria-label="Enregistrement" />}
        </div>
        {questions.map((question) => (
          <div key={question.id} className="space-y-2">
            <p className="text-[14px] font-medium text-text-primary">{question.text}</p>
            <div role="group" aria-label={question.text} className="flex flex-wrap gap-2">
              {question.choices.map((choice) => (
                <button
                  key={choice.key}
                  type="button"
                  aria-pressed={choice.selected}
                  disabled={!canAnswer || pending}
                  onClick={() => answer(question.node, choice.key)}
                  className={cn(
                    "h-9 rounded-full border px-4 text-[13.5px] font-semibold transition-colors disabled:opacity-60",
                    choice.selected ? "border-transparent bg-brand-600 text-white" : "border-brand-500 bg-surface-card text-brand-700 hover:bg-brand-50",
                  )}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        {guidance.map((text) => (
          <p key={text} className="flex items-start gap-2 rounded-lg bg-warning-50 px-3 py-2 text-[13px] font-medium text-warning-800 dark:bg-warning-950/30 dark:text-warning-300">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {text}
          </p>
        ))}
      </CardContent>
    </Card>
  );
}
