"use client";

import { Sparkles } from "lucide-react";
import { AdviceStack, UndecidedPill } from "./advice-zone";
import { AlternativesList } from "./alternatives-list";
import { countUndecided, splitAdvice } from "./group-advice";
import type { AdviceView } from "./types";

/**
 * « À proposer avec ce médicament » : le conseil se lit sous la ligne qui l'a
 * déclenché, pas dans une colonne à part.
 *
 * Rien n'est inventé ici : le bloc ne montre que les conseils que le moteur a
 * rattachés à ce médicament (`recommendations`) et, sous chacun encore à
 * décider, les autres références qu'il a retenues pour le même besoin. Un
 * médicament sans conseil n'affiche rien de plus qu'avant. Une routine reste
 * une seule carte, sans alternatives par étape : remplacer une étape romprait la
 * cohérence de la gamme.
 *
 * Le trait à gauche rattache visuellement le bloc à sa ligne.
 */
export function MedicationAdvice({
  drugName,
  prescriptionId,
  recommendations,
  canDecide,
  canVerify = true,
  presentProductIds,
  inBasket,
  onAccept,
  onCancelAccept,
}: {
  drugName: string;
  prescriptionId: string;
  /** Les conseils rangés sous ce médicament, tranchés compris, dans l'ordre de la page. */
  recommendations: AdviceView[];
  canDecide: boolean;
  canVerify?: boolean;
  presentProductIds: Set<string>;
  inBasket: (id: string) => boolean;
  onAccept: (recommendation: AdviceView) => void;
  onCancelAccept: (recommendation: AdviceView) => void;
}) {
  if (recommendations.length === 0) return null;
  const split = splitAdvice(recommendations);

  return (
    <section aria-label={`À proposer avec ${drugName || "ce médicament"}`} className="mt-3 border-l-2 border-brand-300 pl-3 sm:pl-4 dark:border-brand-700">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.06em] text-brand-800 uppercase dark:text-brand-300">
          <Sparkles className="size-3.5" />
          À proposer avec ce médicament
        </h3>
        {split.cards.length > 0 && <UndecidedPill count={countUndecided(split.cards, inBasket)} />}
      </div>
      <AdviceStack
        prescriptionId={prescriptionId}
        split={split}
        canDecide={canDecide}
        canVerify={canVerify}
        presentProductIds={presentProductIds}
        inBasket={inBasket}
        onAccept={onAccept}
        onCancelAccept={onCancelAccept}
        renderAlternatives={(recommendation) => (
          <AlternativesList recommendationId={recommendation.id} alternatives={recommendation.alternatives} />
        )}
      />
    </section>
  );
}
