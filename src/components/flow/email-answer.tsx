"use client";

import { useId } from "react";
import { suggestEmailCorrection } from "@/core/site/email-typos";
import { TextAnswer } from "./controls";

/** Un e-mail, avec la correction proposée d'une faute de frappe dans le domaine (« gmial.com »). */
export function EmailAnswer({ value, onValueChange, error, placeholder, label }: { value: string; onValueChange: (value: string) => void; error?: string; placeholder?: string; label?: string }) {
  const suggestion = suggestEmailCorrection(value);
  const id = useId();
  return (
    <div>
      <TextAnswer id={id} label={label} srLabel={label ? undefined : "Adresse e-mail"} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={value} onValueChange={onValueChange} error={error} placeholder={placeholder} />
      {suggestion && (
        <p className="mt-3 text-[14px] text-text-secondary" aria-live="polite">
          Vouliez-vous dire{" "}
          <button type="button" onClick={() => {
              onValueChange(suggestion);
              // Le bouton disparaît : le curseur revient dans le champ, Entrée continue.
              requestAnimationFrame(() => document.getElementById(id)?.focus());
            }} className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4 hover:decoration-brand-600 dark:text-brand-300">
            {suggestion}
          </button>{" "}
          ?
        </p>
      )}
    </div>
  );
}
