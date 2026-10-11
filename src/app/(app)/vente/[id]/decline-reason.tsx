"use client";

import { useState, useTransition } from "react";
import { setDeclineReasonAction } from "@/server/actions/recommendations";
import { REFUSAL_REASONS, REFUSAL_REASON_LABELS } from "@/core/coach/rules";

/**
 * « Pourquoi ? » sous un conseil refusé : FACULTATIF, en un geste, modifiable. Il sert au coach de formation (un refus
 * du patient, un prix, une rupture ne sont pas des manques de connaissance) et, pour « Pas adapté à ce patient », à la
 * relecture de la RÈGLE par la validation clinique de PharmaBoost. Rien n'est demandé au patient.
 */
export function DeclineReasonPicker({ recommendationId, initial }: { recommendationId: string; initial: string | null }) {
  const [value, setValue] = useState(initial ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <label className="inline-flex items-center gap-1.5 text-[12px] text-text-tertiary">
      <span>Pourquoi ?</span>
      <select
        value={value}
        disabled={pending}
        aria-label="Pourquoi ce conseil n'a pas été vendu (facultatif)"
        onChange={(event) => {
          const next = event.target.value;
          const previous = value;
          setValue(next);
          setError(null);
          startTransition(async () => {
            const result = await setDeclineReasonAction({ recommendationId, reason: next || null });
            if (!result.ok) {
              setValue(previous);
              setError(result.error);
            }
          });
        }}
        className="h-8 rounded-md border border-border-default bg-surface-card px-2 text-[12.5px] text-text-primary focus:border-brand-500 focus:outline-none"
      >
        <option value="">Non précisé</option>
        {REFUSAL_REASONS.map((reason) => (
          <option key={reason} value={reason}>
            {REFUSAL_REASON_LABELS[reason]}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="text-danger-700">
          {error}
        </span>
      )}
    </label>
  );
}
