"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

/**
 * Partager le résumé du passeport : la feuille de partage du téléphone quand elle existe, sinon une copie dans le
 * presse-papiers. Seulement du texte (prénom, nombre de formations, badges) : aucun lien public, aucune donnée
 * d'officine.
 */
export function SharePassportButton({ text }: { text: string }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");
  const share = async () => {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Mon passeport de compétences PharmaBoost", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
    } catch (error) {
      if ((error as { name?: string }).name !== "AbortError") setState("error");
    }
  };
  return (
    <>
      <button type="button" onClick={share} className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 text-[14px] font-bold text-brand-800 shadow-md transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
        {state === "copied" ? <Check className="size-4" aria-hidden="true" /> : <Share2 className="size-4" aria-hidden="true" />}
        {state === "copied" ? "Copié" : "Partager"}
      </button>
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? "Résumé copié dans le presse-papiers." : state === "error" ? "Le partage n'a pas abouti." : ""}
      </span>
    </>
  );
}
