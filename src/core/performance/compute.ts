import { computeFunnel, selectCountedAdvice } from "./funnel";
import { buildNarrative } from "./narrative";
import { buildProducts, buildUniverses } from "./products";
import { computeRevenue, selectCountedLines } from "./revenue";
import { buildRhythm } from "./rhythm";
import { buildSeries } from "./series";
import type { DataQuality, PerformanceInput, PerformanceReport } from "./types";

/**
 * Le rapport de performance d'une officine : on assemble, on ne recalcule rien.
 *
 * Chaque brique vit dans son module (entonnoir, chiffre d'affaires, séries,
 * produits, rythme, narration) et reste testable seule. Ici on décide
 * seulement qui reçoit quoi, et on veille à ce que tout le monde compte les
 * MÊMES conseils : ceux d'origine IA ou règle, d'ordonnance conservée.
 */
export function computePerformance(input: PerformanceInput): PerformanceReport {
  const { period, now, timeZone } = input;

  // L'entonnoir et le chiffre d'affaires filtrent eux-mêmes (ils comptent aussi ce qu'ils écartent).
  const { funnel, manualExcluded, deletedPrescriptionAdvice } = computeFunnel({
    advice: input.advice,
    previousAdvice: input.previousAdvice,
    now,
  });
  const { revenue, unpricedConfirmedLines } = computeRevenue({ lines: input.lines, previousLines: input.previousLines });

  // Les séries, produits, univers et le rythme reçoivent des lignes DÉJÀ filtrées.
  const advice = selectCountedAdvice(input.advice);
  const previousAdvice = selectCountedAdvice(input.previousAdvice);
  const lines = selectCountedLines(input.lines);
  const previousLines = selectCountedLines(input.previousLines);

  const series = buildSeries({ period, timeZone, now, advice, previousAdvice, lines, previousLines });
  // `now` : les conseils en attente (moins de 24 h) sortent du taux par produit comme du taux global.
  const products = buildProducts({ advice, lines, now });
  const universes = buildUniverses({ advice, lines, now });
  // Le rythme se lit sur les 90 derniers jours, quelle que soit la période choisie.
  const rhythm = buildRhythm({ rhythmAdvice: selectCountedAdvice(input.rhythmAdvice), timeZone, now });

  const quality: DataQuality = {
    manualExcluded,
    unpricedConfirmedLines,
    deletedPrescriptionAdvice,
    pendingAdvice: funnel.pending,
  };

  const narrative = buildNarrative({ period, funnel, revenue, products, universes, rhythm, quality, now });

  return {
    period,
    generatedAt: now,
    // « Rien à montrer » : ni conseil compté, ni ligne de vente comptée sur la période courante.
    empty: advice.length === 0 && lines.length === 0,
    funnel,
    revenue,
    series,
    products,
    universes,
    rhythm,
    quality,
    narrative,
  };
}
