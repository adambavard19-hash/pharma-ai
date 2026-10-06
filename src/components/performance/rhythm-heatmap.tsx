"use client";

import { useState, type KeyboardEvent } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MIN_DECIDED_FOR_RATE, RHYTHM_MIN_DECIDED_SLOT, RHYTHM_MIN_DECIDED_TOTAL } from "@/core/performance/definitions";
import type { RhythmCell, RhythmStats } from "@/core/performance/types";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { WEEKDAY_NAMES, WEEKDAY_SHORT, capitalizeFirst, countOf, formatRate } from "./format";

/**
 * Les jours et les heures où le conseil marche le mieux : une carte de chaleur
 * jour × heure, sur les 90 derniers jours (pas sur la période choisie).
 *
 * La couleur est le taux d'acceptation, sur une échelle fixe (0 → 100 %), jamais
 * « relative au meilleur » : une case claire n'est pas un échec, c'est un taux
 * bas. Une case sans assez de conseils tranchés ne reçoit aucune couleur de
 * taux (un taux sur 1 ou 2 conseils ne veut rien dire) et reste en pointillé.
 * Au survol, au toucher ou au clavier (flèches), le détail s'écrit sous la grille.
 */

type Position = { weekday: number; hour: number };

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
/** Heures d'ouverture habituelles : la grille s'élargit seulement si des conseils sortent de cette plage. */
const DEFAULT_FIRST_HOUR = 8;
const DEFAULT_LAST_HOUR = 20;

/** Cinq niveaux sur une échelle fixe : < 20 %, < 40 %, < 60 %, < 80 %, 80 % et plus. */
const LEVELS = [
  "bg-brand-100 dark:bg-brand-900/50",
  "bg-brand-200 dark:bg-brand-800/70",
  "bg-brand-300 dark:bg-brand-700",
  "bg-brand-400 dark:bg-brand-600",
  "bg-brand-600 dark:bg-brand-500",
] as const;

const levelOf = (rate: number) => (rate >= 0.8 ? 4 : rate >= 0.6 ? 3 : rate >= 0.4 ? 2 : rate >= 0.2 ? 1 : 0);
const cellId = (position: Position) => `rythme-${position.weekday}-${position.hour}`;
const keyOf = (weekday: number, hour: number) => `${weekday}-${hour}`;

/** Le taux d'une case, ou `null` quand elle compte trop peu de conseils tranchés. */
function rateOf(cell: RhythmCell | undefined): number | null {
  if (!cell || cell.decided < MIN_DECIDED_FOR_RATE) return null;
  return Math.min(1, Math.max(0, cell.accepted / cell.decided));
}

/** La phrase d'une case : lue par les lecteurs d'écran et écrite sous la grille. */
function describeCell(weekday: number, hour: number, cell: RhythmCell | undefined): string {
  const when = `${capitalizeFirst(WEEKDAY_NAMES[weekday] ?? "")}, ${hour} h`;
  const proposed = cell?.proposed ?? 0;
  const decided = cell?.decided ?? 0;
  if (proposed === 0) return `${when} : aucun conseil proposé.`;
  const rate = rateOf(cell);
  if (rate === null) {
    const few = decided === 0 ? "aucun n'est tranché" : `${decided} seulement ${decided > 1 ? "sont tranchés" : "est tranché"}`;
    return `${when} : ${countOf(proposed, "conseil proposé", "conseils proposés")}, ${few} : trop peu pour donner un taux.`;
  }
  const accepted = cell?.accepted ?? 0;
  const base = `${when} : ${accepted} ${accepted > 1 ? "acceptés" : "accepté"} sur ${decided} ${decided > 1 ? "tranchés" : "tranché"} (${formatRate(rate)}).`;
  return decided < RHYTHM_MIN_DECIDED_SLOT ? `${base} Peu de conseils : à prendre avec prudence.` : base;
}

/** Les heures affichées : 8 h → 20 h, élargies aux heures où des conseils ont réellement été proposés. */
function visibleHours(cells: RhythmCell[]): number[] {
  let first = DEFAULT_FIRST_HOUR;
  let last = DEFAULT_LAST_HOUR;
  for (const cell of cells) {
    if (cell.proposed > 0 && cell.hour >= 0 && cell.hour <= 23) {
      first = Math.min(first, cell.hour);
      last = Math.max(last, cell.hour);
    }
  }
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

function Legend() {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-text-secondary">
      <li className="flex items-center gap-1.5">
        <span>Taux faible</span>
        <span className="flex gap-0.5" aria-hidden="true">
          {LEVELS.map((level) => (
            <span key={level} className={cn("size-3 rounded-[3px]", level)} />
          ))}
        </span>
        <span>élevé</span>
      </li>
      <li className="flex items-center gap-1.5">
        <span className="size-3 rounded-[3px] bg-surface-sunken/60 ring-1 ring-inset ring-border-subtle" aria-hidden="true" />
        Aucun conseil
      </li>
      <li className="flex items-center gap-1.5">
        <span className="size-3 rounded-[3px] border border-dashed border-border-strong" aria-hidden="true" />
        Moins de {MIN_DECIDED_FOR_RATE} conseils tranchés
      </li>
      <li className="flex items-center gap-1.5">
        <span className={cn("size-3 rounded-[3px] opacity-55", LEVELS[2])} aria-hidden="true" />
        Pâle : moins de {RHYTHM_MIN_DECIDED_SLOT} conseils tranchés
      </li>
    </ul>
  );
}

function Highlight({ title, value, detail }: { title: string; value: string | null; detail: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-lg bg-surface-sunken/60 px-3.5 py-2.5">
      <p className="text-[12px] text-text-secondary">{title}</p>
      {value ? (
        <>
          <p className="mt-0.5 text-[17px] leading-6 font-semibold text-text-primary tabular">{value}</p>
          <p className="text-[12px] text-text-tertiary">{detail}</p>
        </>
      ) : (
        <p className="mt-0.5 text-[12.5px] leading-5 text-text-tertiary">{detail}</p>
      )}
    </div>
  );
}

export function RhythmHeatmap({ rhythm, className }: { rhythm: RhythmStats; className?: string }) {
  const [selected, setSelected] = useState<Position | null>(null);

  const description = `Sur les ${rhythm.windowDays} derniers jours, quelle que soit la période choisie.`;
  const decidedTotal = rhythm.cells.reduce((sum, cell) => sum + cell.decided, 0);

  if (!rhythm.enoughData) {
    const share = Math.min(100, Math.round((decidedTotal / RHYTHM_MIN_DECIDED_TOTAL) * 100));
    return (
      <Card className={className}>
        <CardHeader title="Quand le conseil fonctionne le mieux" description={description} />
        <CardContent className="space-y-3">
          <p className="text-[13px] leading-5 text-text-secondary">
            {decidedTotal === 0
              ? `Aucun conseil n'a encore été tranché sur les ${rhythm.windowDays} derniers jours.`
              : `${countOf(decidedTotal, "conseil tranché", "conseils tranchés")} sur les ${rhythm.windowDays} derniers jours.`}{" "}
            Il en faut au moins {RHYTHM_MIN_DECIDED_TOTAL} pour dire quels jours et quelles heures fonctionnent le mieux : en dessous, ce serait du hasard.
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
            <div className="h-full rounded-full bg-brand-500 motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${share}%` }} />
          </div>
          <p className="text-[12px] text-text-tertiary tabular">
            {formatNumber(Math.min(decidedTotal, RHYTHM_MIN_DECIDED_TOTAL))} sur {RHYTHM_MIN_DECIDED_TOTAL} conseils tranchés
          </p>
        </CardContent>
      </Card>
    );
  }

  const byKey = new Map<string, RhythmCell>();
  for (const cell of rhythm.cells) byKey.set(keyOf(cell.weekday, cell.hour), cell);
  const hours = visibleHours(rhythm.cells);

  const bestDay = rhythm.bestWeekday;
  const bestWindow = rhythm.bestWindow;
  const inBestWindow = (hour: number) => bestWindow !== null && hour >= bestWindow.fromHour && hour < bestWindow.toHour;

  // Une seule case reçoit le focus au clavier (Tab), les flèches font le reste.
  const firstWithAdvice = rhythm.cells.find((cell) => cell.proposed > 0 && hours.includes(cell.hour));
  const wanted: Position | null = selected ?? (bestDay && bestWindow ? { weekday: bestDay.weekday, hour: bestWindow.fromHour } : firstWithAdvice ? { weekday: firstWithAdvice.weekday, hour: firstWithAdvice.hour } : null);
  const tabStop: Position = wanted && hours.includes(wanted.hour) && wanted.weekday >= 0 && wanted.weekday < DAYS.length ? wanted : { weekday: 0, hour: hours[0] };

  const moveFrom = (event: KeyboardEvent<HTMLButtonElement>, weekday: number, hour: number) => {
    const column = hours.indexOf(hour);
    let nextWeekday = weekday;
    let nextColumn = column;
    switch (event.key) {
      case "ArrowRight":
        nextColumn = Math.min(hours.length - 1, column + 1);
        break;
      case "ArrowLeft":
        nextColumn = Math.max(0, column - 1);
        break;
      case "ArrowDown":
        nextWeekday = Math.min(DAYS.length - 1, weekday + 1);
        break;
      case "ArrowUp":
        nextWeekday = Math.max(0, weekday - 1);
        break;
      case "Home":
        nextColumn = 0;
        break;
      case "End":
        nextColumn = hours.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const next = { weekday: nextWeekday, hour: hours[nextColumn] };
    setSelected(next);
    if (typeof document !== "undefined") document.getElementById(cellId(next))?.focus();
  };

  return (
    <Card className={className}>
      <CardHeader title="Quand le conseil fonctionne le mieux" description={description} />
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Highlight
            title="Meilleur jour"
            value={bestDay ? capitalizeFirst(bestDay.label) : null}
            detail={bestDay ? `${formatRate(bestDay.acceptanceRate)} de conseils acceptés · ${countOf(bestDay.decided, "conseil tranché", "conseils tranchés")}` : `Pas encore assez de conseils par jour (au moins ${RHYTHM_MIN_DECIDED_SLOT} tranchés) pour en désigner un.`}
          />
          <Highlight
            title="Meilleure plage de 2 heures"
            value={bestWindow ? `${bestWindow.fromHour} h – ${bestWindow.toHour} h` : null}
            detail={bestWindow ? `${formatRate(bestWindow.acceptanceRate)} de conseils acceptés · ${countOf(bestWindow.decided, "conseil tranché", "conseils tranchés")}` : `Pas encore assez de conseils par plage (au moins ${RHYTHM_MIN_DECIDED_SLOT} tranchés) pour en désigner une.`}
          />
        </div>

        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <table className="w-full min-w-[26rem] border-separate border-spacing-[3px]">
            <caption className="sr-only">Taux d&apos;acceptation des conseils, par jour de la semaine et par heure, sur les {rhythm.windowDays} derniers jours.</caption>
            <thead>
              <tr>
                <th scope="col" className="w-9">
                  <span className="sr-only">Jour</span>
                </th>
                {hours.map((hour) => (
                  <th key={hour} scope="col" className={cn("pb-0.5 text-center text-[10.5px] leading-4 font-normal text-text-tertiary tabular", inBestWindow(hour) && "border-b-2 border-brand-500 font-semibold text-brand-700 dark:text-brand-300")}>
                    {hour % 2 === 0 ? (
                      <>
                        <span aria-hidden="true">{hour}</span>
                        <span className="sr-only">{hour} h</span>
                      </>
                    ) : (
                      <span className="sr-only">{hour} h</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((weekday) => (
                <tr key={weekday}>
                  <th scope="row" className={cn("pr-1 text-left text-[11.5px] font-normal whitespace-nowrap text-text-secondary", bestDay?.weekday === weekday && "font-semibold text-brand-700 dark:text-brand-300")}>
                    <span aria-hidden="true">{WEEKDAY_SHORT[weekday]}</span>
                    <span className="sr-only">{WEEKDAY_NAMES[weekday]}</span>
                  </th>
                  {hours.map((hour) => {
                    const cell = byKey.get(keyOf(weekday, hour));
                    const rate = rateOf(cell);
                    const proposed = cell?.proposed ?? 0;
                    const isTabStop = tabStop.weekday === weekday && tabStop.hour === hour;
                    const isSelected = selected?.weekday === weekday && selected.hour === hour;
                    return (
                      <td key={hour} className="p-0">
                        <button
                          type="button"
                          id={cellId({ weekday, hour })}
                          aria-label={describeCell(weekday, hour, cell)}
                          tabIndex={isTabStop ? 0 : -1}
                          data-weekday={weekday}
                          data-hour={hour}
                          data-level={rate === null ? undefined : levelOf(rate)}
                          className={cn(
                            "block h-7 w-full min-w-[1.125rem] rounded-[5px] motion-safe:transition-transform motion-safe:duration-150 motion-safe:hover:scale-110",
                            rate !== null ? LEVELS[levelOf(rate)] : proposed > 0 ? "border border-dashed border-border-strong" : "bg-surface-sunken/60 ring-1 ring-inset ring-border-subtle",
                            rate !== null && (cell?.decided ?? 0) < RHYTHM_MIN_DECIDED_SLOT && "opacity-55",
                            isSelected && "ring-2 ring-brand-700 ring-offset-1 ring-offset-surface-card dark:ring-brand-300",
                          )}
                          onMouseEnter={() => setSelected({ weekday, hour })}
                          onFocus={() => setSelected({ weekday, hour })}
                          onClick={() => setSelected({ weekday, hour })}
                          onKeyDown={(event) => moveFrom(event, weekday, hour)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="min-h-10 text-[13px] leading-5 text-text-primary" aria-hidden="true" data-detail>
          {selected ? describeCell(selected.weekday, selected.hour, byKey.get(keyOf(selected.weekday, selected.hour))) : "Passez sur une case, ou touchez-la, pour voir le détail."}
        </p>

        <Legend />
      </CardContent>
    </Card>
  );
}
