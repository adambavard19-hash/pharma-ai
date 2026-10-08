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
  saysWhenEmpty = false,
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
  /**
   * Dire qu'il n'y a rien à proposer avec ce médicament. Seulement quand
   * l'analyse sait rattacher ses conseils aux médicaments : sur une analyse plus
   * ancienne, ils sont dans « Conseils pour ce patient » et cette phrase serait fausse.
   */
  saysWhenEmpty?: boolean;
}) {
  if (recommendations.length === 0) {
    return saysWhenEmpty ? <p className="mt-2 pl-3 text-[12.5px] text-text-tertiary sm:pl-4">Aucun conseil à proposer avec ce médicament.</p> : null;
  }
  const split = splitAdvice(recommendations);
  // Sous un produit de parapharmacie, il n'y a que des associations de l'officine : « ce produit », pas « ce médicament ».
  const subject = recommendations.every((recommendation) => recommendation.origin === "RULE") ? "ce produit" : "ce médicament";

  return (
    <section aria-label={`À proposer avec ${drugName || subject}`} className="mt-3 border-l-2 border-brand-300 pl-3 sm:pl-4 dark:border-brand-700">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.06em] text-brand-800 uppercase dark:text-brand-300">
          <Sparkles className="size-3.5" />
          À proposer avec {subject}
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
        // Une association écrite par le pharmacien désigne UN produit : elle n'a pas d'« autres références du même besoin ».
        renderAlternatives={(recommendation) =>
          recommendation.origin === "RULE" ? null : <AlternativesList recommendationId={recommendation.id} alternatives={recommendation.alternatives} />
        }
      />
    </section>
  );
}
