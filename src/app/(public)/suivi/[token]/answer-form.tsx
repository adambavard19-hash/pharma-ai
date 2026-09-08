"use client";

import { useState, useTransition } from "react";
import { answerFollowUpAction } from "@/server/actions/reminders";
import { FOLLOW_UP_ANSWERS, findAnswer, type FollowUpAnswerCode } from "@/core/followup/answers";

/**
 * Trois grands boutons, une confirmation. La réponse choisie dans l'e-mail
 * est mise en avant ; le patient peut en changer avant d'envoyer.
 */
export function AnswerForm({
  token,
  pharmacyName,
  preselected,
  alreadyAnswered,
}: {
  token: string;
  pharmacyName: string;
  preselected: FollowUpAnswerCode | null;
  alreadyAnswered: FollowUpAnswerCode | null;
}) {
  const [done, setDone] = useState<FollowUpAnswerCode | null>(alreadyAnswered);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    const answer = findAnswer(done)!;
    return (
      <div className="rounded-2xl bg-[#f6f7f9] px-5 py-5" role="status">
        <p className="text-[28px] leading-none" aria-hidden="true">
          {answer.emoji}
        </p>
        <p className="mt-3 text-[16px] leading-6 font-semibold text-[#111827]">{answer.label}</p>
        <p className="mt-1.5 text-[15.5px] leading-6 text-[#374151]">{answer.acknowledgement(pharmacyName)}</p>
      </div>
    );
  }

  const send = (code: FollowUpAnswerCode) => {
    setError(null);
    startTransition(async () => {
      const result = await answerFollowUpAction({ token, answer: code });
      if (result.ok) setDone(result.data.answered as FollowUpAnswerCode);
      else setError(result.error);
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-[17px] leading-6 font-semibold text-[#111827]">Comment allez-vous depuis votre passage ?</p>
      <div className="grid gap-2.5">
        {FOLLOW_UP_ANSWERS.map((answer) => {
          const highlighted = answer.code === preselected;
          return (
            <button
              key={answer.code}
              type="button"
              disabled={pending}
              onClick={() => send(answer.code)}
              className={
                "flex min-h-[60px] w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-[16.5px] leading-6 font-semibold text-[#111827] transition-colors disabled:opacity-60 " +
                (highlighted ? "border-[#111827] bg-[#f6f7f9] ring-2 ring-[#111827]/10" : "border-[#e5e7eb] bg-white hover:bg-[#f6f7f9]")
              }
            >
              <span className="text-[26px] leading-none" aria-hidden="true">
                {answer.emoji}
              </span>
              {answer.label}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="text-[14px] leading-5 text-[#b91c1c]" role="alert">
          {error}
        </p>
      )}
      <p className="text-[13px] leading-5 text-[#6b7280]">Un seul clic suffit : votre réponse part immédiatement.</p>
    </div>
  );
}
