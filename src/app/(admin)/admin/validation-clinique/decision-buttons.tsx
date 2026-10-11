"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { decideClinicalFlagAction } from "./actions";

const CHOICES = [
  { decision: "UNDER_REVIEW", label: "En relecture", variant: "outline" },
  { decision: "CONFIRMED_OK", label: "Règle confirmée", variant: "success" },
  { decision: "RULE_CHANGED", label: "Règle modifiée", variant: "primary" },
  { decision: "DISMISSED", label: "Écarter", variant: "ghost" },
] as const;

/** Trancher les signalements d'une règle (tous ceux encore ouverts), avec une note facultative. */
export function ClinicalDecisionButtons({ ruleKey, underReview }: { ruleKey: string; underReview: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const decide = (decision: (typeof CHOICES)[number]["decision"]) =>
    startTransition(async () => {
      const result = await decideClinicalFlagAction({ ruleKey, decision, note });
      setFeedback(result.ok ? { ok: true, text: result.message ?? "Enregistré." } : { ok: false, text: result.error });
      if (result.ok) router.refresh();
    });
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="sr-only">Note de relecture</span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          placeholder="Note de relecture (facultatif)"
          className="h-10 w-full rounded-md border border-border-default bg-surface-card px-3 text-[13.5px] text-text-primary focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 focus:outline-none"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {CHOICES.filter((choice) => !(underReview && choice.decision === "UNDER_REVIEW")).map((choice) => (
          <Button key={choice.decision} size="sm" variant={choice.variant} disabled={pending} onClick={() => decide(choice.decision)}>
            {choice.label}
          </Button>
        ))}
      </div>
      {feedback && (
        <p role={feedback.ok ? "status" : "alert"} className={feedback.ok ? "text-[12.5px] text-success-700" : "text-[12.5px] text-danger-700"}>
          {feedback.text}
        </p>
      )}
    </div>
  );
}
