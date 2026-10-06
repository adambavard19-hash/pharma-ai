"use client";

import { useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Granularity, SeriesBucket } from "@/core/performance/types";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { indexFromPointer, monotonePath, splitRuns, xPercent, yPercent, type Point } from "./chart-math";
import {
  MEASURES,
  availableMeasures,
  bucketDetail,
  buildScale,
  comparisonName,
  defaultMeasure,
  effectiveMeasure,
  formatTick,
  formatValue,
  granularityNoun,
  hasSignal,
  labelPlan,
  lastKnownIndex,
  seriesValues,
  spokenRange,
  axisLabel,
  type MeasureKey,
} from "./evolution-model";
import { bucketTitle, formatRate } from "./format";

/**
 * Le graphique d'évolution : une mesure à la fois (chiffre d'affaires, conseils
 * proposés, acceptés, taux), sa courbe, et en pointillé la même mesure sur la
 * période précédente. SVG pur, sans bibliothèque.
 *
 * Lecture : survol, toucher ou flèches du clavier → une infobulle datée. Les
 * mêmes chiffres sont dans un tableau réservé aux lecteurs d'écran : l'infobulle
 * ne conditionne jamais l'accès à une valeur.
 *
 * Sans cadre ni titre : le tableau de bord l'enveloppe dans son propre panneau.
 *
 * Le trait vit dans un repère étiré (0–100 sur les deux axes, épaisseur fixe) ;
 * tout ce qui doit rester rond ou net (points, étiquettes, infobulle) est en HTML
 * positionné en pourcentage.
 */

const GRADIENT_ID = "perf-evolution-area";

type Run = { line: string; area: string };

/** Les tronçons continus d'une série (un `null` coupe la courbe) et ses points isolés. */
function shapeOf(values: (number | null)[], count: number, max: number): { runs: Run[]; lone: Point[] } {
  const round = (value: number) => Math.round(value * 100) / 100;
  const runs: Run[] = [];
  const lone: Point[] = [];
  for (const run of splitRuns(values)) {
    const points = run.indices.map((index): Point => [xPercent(index, count), yPercent(values[index] ?? 0, max)]);
    if (points.length === 1) {
      lone.push(points[0]);
      continue;
    }
    const line = monotonePath(points);
    runs.push({ line, area: `${line} L ${round(points[points.length - 1][0])} 100 L ${round(points[0][0])} 100 Z` });
  }
  return { runs, lone };
}

const posStyle = (x: number, y: number) => ({ left: `${x}%`, top: `${y}%` });

export function EvolutionChart({
  series,
  granularity,
  comparisonLabel,
  showAcceptanceRate,
}: {
  series: { current: SeriesBucket[]; previous: SeriesBucket[] };
  granularity: Granularity;
  comparisonLabel: string;
  showAcceptanceRate: boolean;
}) {
  const [chosen, setChosen] = useState<MeasureKey>(() => defaultMeasure(series.current));
  const [showPrevious, setShowPrevious] = useState(true);
  const [active, setActive] = useState<number | null>(null);

  const count = series.current.length;
  if (count === 0) {
    return (
      <p className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border-default px-4 text-center text-[13px] text-text-tertiary">
        Aucune donnée sur la période.
      </p>
    );
  }

  const measure = effectiveMeasure(chosen, showAcceptanceRate);
  const definition = MEASURES[measure];
  const measures = availableMeasures(showAcceptanceRate);
  const name = comparisonName(comparisonLabel);

  const current = seriesValues(series.current, measure);
  // La période précédente est alignée par rang ; ce qui dépasse la fenêtre courante n'a pas d'abscisse.
  const previousBuckets = series.previous.slice(0, count);
  const previous = seriesValues(previousBuckets, measure);
  const hasPrevious = previousBuckets.length > 0;
  const previousShown = hasPrevious && showPrevious;

  const scale = buildScale(measure, previousShown ? [current, previous] : [current]);
  const empty = !hasSignal(current) && !(previousShown && hasSignal(previous));
  const currentShape = shapeOf(current, count, scale.max);
  const previousShape = previousShown ? shapeOf(previous, count, scale.max) : { runs: [], lone: [] };
  const endIndex = empty ? null : lastKnownIndex(current);

  const activeIndex = active !== null && active < count ? active : null;
  const activeBucket = activeIndex === null ? null : series.current[activeIndex];
  const activeValue = activeIndex === null ? null : current[activeIndex];
  const activePrevious = activeIndex === null || !previousShown ? null : (previous[activeIndex] ?? null);
  const activePreviousBucket = activeIndex === null || !previousShown ? null : (previousBuckets[activeIndex] ?? null);
  const activeX = activeIndex === null ? 0 : xPercent(activeIndex, count);
  const activeY = activeValue === null ? null : yPercent(activeValue, scale.max);
  // L'infobulle se place du côté opposé au point pour ne jamais le cacher.
  const tooltipAtTop = activeY === null || activeY >= 50;

  const activeSpoken =
    activeBucket === null || activeIndex === null
      ? ""
      : `${bucketTitle(activeBucket.startsAt, granularity)} : ${formatValue(measure, activeValue)}` +
        (activePreviousBucket ? `. ${name} : ${formatValue(measure, activePrevious)}` : "");

  const choose = (key: MeasureKey) => {
    setChosen(key);
    setActive(null);
  };

  const followPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    setActive(indexFromPointer(event.clientX, box.left, box.width, count));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = count - 1;
    let next: number | null | undefined;
    if (event.key === "ArrowRight") next = active === null ? 0 : Math.min(last, active + 1);
    else if (event.key === "ArrowLeft") next = active === null ? last : Math.max(0, active - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else if (event.key === "Escape") next = null;
    if (next === undefined) return;
    event.preventDefault();
    setActive(next);
  };

  const onFocus = (event: { currentTarget: { matches?: (selector: string) => boolean } }) => {
    // Au clavier seulement : un clic ou un toucher choisit lui-même son point.
    let keyboard = false;
    try {
      keyboard = event.currentTarget.matches?.(":focus-visible") ?? false;
    } catch {
      keyboard = false;
    }
    if (keyboard && active === null) setActive(count - 1);
  };

  return (
    <div data-measure={measure}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <p className="min-w-0 text-[13px] leading-5 font-medium text-text-primary">
          {definition.title}, {granularityNoun(granularity)}
        </p>
        <div role="group" aria-label="Mesure affichée" className="flex w-full flex-wrap rounded-lg bg-surface-sunken p-0.5 sm:inline-flex sm:w-auto">
          {measures.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={measure === key}
              onClick={() => choose(key)}
              className={cn(
                "min-h-8 flex-1 rounded-md px-1.5 text-[12px] font-medium whitespace-nowrap transition-colors sm:flex-none sm:px-3 sm:text-[12.5px]",
                measure === key ? "bg-surface-card text-text-primary shadow-xs" : "text-text-secondary hover:text-text-primary",
              )}
            >
              {MEASURES[key].tab}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-0.5 w-4 rounded-full bg-brand-600" />
          Cette période
        </span>
        {hasPrevious && (
          <button
            type="button"
            aria-pressed={showPrevious}
            title={`Afficher ou masquer la courbe « ${name} »`}
            onClick={() => setShowPrevious(!showPrevious)}
            className={cn(
              "inline-flex min-h-7 items-center gap-1.5 rounded-md px-2 transition-colors",
              showPrevious ? "bg-surface-sunken text-text-primary" : "text-text-tertiary hover:text-text-secondary",
            )}
          >
            <span aria-hidden="true" className={cn("w-4 border-t-2 border-dashed border-text-tertiary", !showPrevious && "opacity-50")} />
            {name}
          </button>
        )}
      </div>

      <figure className="mt-3">
        <figcaption className="sr-only">
          {definition.title}, {granularityNoun(granularity)} : {count} {count > 1 ? "points" : "point"}, {spokenRange(series.current[0].label, series.current[count - 1].label)}
        </figcaption>

        <div className="flex h-56 gap-2 sm:h-64">
          {/* Axe vertical : les graduations. */}
          <div aria-hidden="true" className="w-12 shrink-0 py-1.5">
            <div className="relative h-full">
              {scale.ticks.map((tick) => (
                <span
                  key={tick}
                  className="absolute right-0 -translate-y-1/2 text-[11px] leading-none whitespace-nowrap text-text-tertiary tabular"
                  style={{ top: `${yPercent(tick, scale.max)}%` }}
                >
                  {formatTick(measure, tick)}
                </span>
              ))}
            </div>
          </div>

          {/* Le tracé : le seul endroit où l'on survole, touche ou parcourt au clavier. */}
          <div
            role="group"
            tabIndex={0}
            data-chart-plot=""
            aria-label={`${definition.title}. Flèches gauche et droite pour parcourir les points, Échap pour fermer.`}
            className="min-w-0 flex-1 touch-pan-y rounded-md py-1.5"
            onPointerDown={followPointer}
            onPointerMove={followPointer}
            onPointerLeave={(event) => {
              if (event.pointerType === "mouse") setActive(null);
            }}
            onKeyDown={onKeyDown}
            onFocus={onFocus}
            onBlur={() => setActive(null)}
          >
            <div className="relative h-full">
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 size-full overflow-visible text-brand-600 motion-safe:animate-fade-in"
                aria-hidden="true"
                focusable="false"
              >
                <defs>
                  <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="currentColor" stopOpacity={0.24} />
                    <stop offset="100%" stopColor="currentColor" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                {scale.ticks.map((tick) => {
                  const y = yPercent(tick, scale.max);
                  return <line key={tick} x1={0} x2={100} y1={y} y2={y} className={tick === 0 ? "stroke-border-default" : "stroke-border-subtle"} strokeWidth={1} vectorEffect="non-scaling-stroke" />;
                })}
                {previousShape.runs.map((run, index) => (
                  <path key={`p${index}`} d={run.line} fill="none" className="stroke-text-tertiary" strokeWidth={2} strokeDasharray="5 5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" data-series="previous" />
                ))}
                {!empty &&
                  currentShape.runs.map((run, index) => (
                    <g key={`c${index}`} data-series="current">
                      <path d={run.area} fill={`url(#${GRADIENT_ID})`} stroke="none" />
                      <path d={run.line} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    </g>
                  ))}
              </svg>

              {/* Points isolés (un taux entouré de créneaux sans taux) et point de comparaison. */}
              {!empty &&
                currentShape.lone.map(([x, y]) => (
                  <span key={`l${x}`} aria-hidden="true" className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600" style={posStyle(x, y)} />
                ))}

              {/* Le point final, accentué : c'est lui qui dit « où l'on en est ». */}
              {endIndex !== null && (
                <span
                  aria-hidden="true"
                  data-point="end"
                  className="absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand-500/20"
                  style={posStyle(xPercent(endIndex, count), yPercent(current[endIndex] ?? 0, scale.max))}
                >
                  <span className="size-2.5 rounded-full bg-brand-600 ring-2 ring-surface-card" />
                </span>
              )}

              {empty && (
                <p className="pointer-events-none absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-md bg-surface-card/85 py-1 text-center text-[13px] text-text-tertiary">
                  {definition.emptyText}
                </p>
              )}

              {activeBucket && (
                <>
                  <span aria-hidden="true" data-point="crosshair" className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-border-strong" style={{ left: `${activeX}%` }} />
                  {activePrevious !== null && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-text-tertiary bg-surface-card"
                      style={posStyle(activeX, yPercent(activePrevious, scale.max))}
                    />
                  )}
                  {activeValue !== null && activeY !== null && (
                    <span
                      aria-hidden="true"
                      data-point="active"
                      className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600 ring-2 ring-surface-card"
                      style={posStyle(activeX, activeY)}
                    />
                  )}
                  <div
                    role="presentation"
                    data-tooltip=""
                    className="pointer-events-none absolute z-10 w-max max-w-[90%] rounded-lg border border-border-default bg-surface-raised px-3 py-2 text-[12px] leading-4 shadow-lg"
                    style={{ left: `${activeX}%`, transform: `translateX(-${activeX}%)`, ...(tooltipAtTop ? { top: 4 } : { bottom: 4 }) }}
                  >
                    <p className="font-medium text-text-secondary">{bucketTitle(activeBucket.startsAt, granularity)}</p>
                    <p className="mt-1 flex items-center gap-2">
                      <span aria-hidden="true" className="h-0.5 w-3.5 shrink-0 rounded-full bg-brand-600" />
                      <span className="text-[14px] leading-5 font-semibold text-text-primary tabular">{formatValue(measure, activeValue)}</span>
                    </p>
                    {bucketDetail(activeBucket, measure) && <p className="mt-0.5 text-text-tertiary">{bucketDetail(activeBucket, measure)}</p>}
                    {activePreviousBucket && (
                      <div className="mt-1.5 border-t border-border-subtle pt-1.5">
                        <p className="flex items-center gap-2">
                          <span aria-hidden="true" className="w-3.5 shrink-0 border-t-2 border-dashed border-text-tertiary" />
                          <span className="font-semibold text-text-primary tabular">{formatValue(measure, activePrevious)}</span>
                        </p>
                        <p className="mt-0.5 text-text-tertiary">
                          {name} · {bucketTitle(activePreviousBucket.startsAt, granularity)}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Axe horizontal : quelques étiquettes, davantage sur un grand écran. */}
        <div aria-hidden="true" className="mt-1.5 flex gap-2">
          <div className="w-12 shrink-0" />
          <div className="relative h-4 min-w-0 flex-1">
            {labelPlan(count).map(({ index, show }) => {
              const x = xPercent(index, count);
              return (
                <span
                  key={index}
                  className={cn("absolute top-0 text-[11px] leading-4 whitespace-nowrap text-text-tertiary tabular", show === "wide" && "max-sm:hidden", show === "narrow" && "sm:hidden")}
                  style={{ left: `${x}%`, transform: `translateX(-${x}%)` }}
                >
                  {axisLabel(series.current[index].label, granularity)}
                </span>
              );
            })}
          </div>
        </div>

        <p className="sr-only" aria-live="polite" data-live="">
          {activeSpoken}
        </p>

        {/* Dans un <div> « sr-only » : un <table> seul ignore la largeur de 1 px et fait défiler la page. */}
        <div className="sr-only" data-sr-table="">
          <table>
            <caption>Évolution {granularityNoun(granularity)}</caption>
            <thead>
              <tr>
                <th scope="col">Période</th>
                <th scope="col">Conseils proposés</th>
                <th scope="col">Conseils acceptés</th>
                {showAcceptanceRate && <th scope="col">Taux d&apos;acceptation</th>}
                <th scope="col">Chiffre d&apos;affaires attribué TTC</th>
                {hasPrevious && (
                  <th scope="col">
                    {definition.title} : {name}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {series.current.map((bucket, index) => (
                <tr key={index}>
                  <th scope="row">{bucketTitle(bucket.startsAt, granularity)}</th>
                  <td>{formatNumber(bucket.proposed)}</td>
                  <td>{formatNumber(bucket.accepted)}</td>
                  {showAcceptanceRate && <td>{bucket.acceptanceRate === null ? "Pas de taux (moins de 3 conseils tranchés)" : formatRate(bucket.acceptanceRate)}</td>}
                  <td>{formatValue("revenue", bucket.revenueTtcCents)}</td>
                  {hasPrevious && <td>{index < previous.length ? formatValue(measure, previous[index]) : "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </figure>
    </div>
  );
}
