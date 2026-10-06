import { Info, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { FunnelStats, RevenueStats } from "@/core/performance/types";
import { formatCents, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FEW_ADVICE_BELOW, countOf, formatRate } from "./format";

/**
 * L'entonnoir honnête : conseils proposés → acceptés → achetés.
 *
 * Un mot, une unité : ici on compte des CONSEILS (« conseils achetés »), jamais
 * des ventes. « Ventes confirmées » ne s'écrit que dans le bloc « côté caisse »,
 * où il compte des tickets de vente enregistrés.
 *
 * Trois choses ne se confondent jamais, et se voient à l'œil nu :
 *  - un conseil ACCEPTÉ est retenu par l'équipe, ce n'est pas une vente ;
 *  - « acceptés non confirmés » (hachures grises) : retenus, mais aucune vente enregistrée ;
 *  - « refusés par le patient » (hachures et contour rouges) : retenus, puis refusés au comptoir.
 * Chaque segment a son libellé et son chiffre dans la légende : la couleur ne
 * porte jamais seule le sens.
 *
 * Les conseils sont comptés à la date de proposition ; le chiffre d'affaires, à
 * la date de la vente : le bloc « côté caisse » est donc séparé de l'entonnoir.
 */

/**
 * Chaque segment a sa propre apparence (couleur, hachures, contour) : on les
 * distingue sans la couleur. Le succès est plein et vert ; le refus du patient,
 * hachuré avec un contour rouge (jamais la teinte ambre de l'alerte) ; ce qui
 * n'a pas de vente, hachuré en gris ; « sans réponse » a un contour pour tenir
 * sur la piste claire.
 */
const SWATCH = {
  accepted: "bg-brand-500",
  removed: "bg-ink-400 dark:bg-ink-500",
  unanswered: "border border-ink-500 bg-ink-300 dark:border-ink-400 dark:bg-ink-600",
  pending: "border border-dashed border-border-strong",
  confirmed: "bg-success-600 dark:bg-success-500",
  notConfirmed:
    "bg-ink-100 bg-[repeating-linear-gradient(135deg,var(--color-ink-500)_0,var(--color-ink-500)_2px,transparent_2px,transparent_6px)] dark:bg-ink-800",
  declined:
    "border border-danger-600 bg-danger-50 bg-[repeating-linear-gradient(45deg,var(--color-danger-500)_0,var(--color-danger-500)_2px,transparent_2px,transparent_5px)] dark:border-danger-500 dark:bg-danger-950",
} as const;

type Segment = { key: string; label: string; value: number; swatch: string };

/** Largeur d'une étape en % de la première ; une étape non vide reste visible (3 % au moins). */
function widthPercent(value: number, total: number): number {
  if (!(total > 0) || !(value > 0)) return 0;
  return Math.round(Math.min(100, Math.max(3, (value / total) * 100)) * 10) / 10;
}

function Stage({
  title,
  value,
  rateLabel,
  note,
  widthPct,
  segments,
  showLegend,
}: {
  title: string;
  value: number;
  rateLabel?: string;
  note?: string;
  widthPct: number;
  segments: Segment[];
  showLegend: boolean;
}) {
  const drawn = segments.filter((segment) => segment.value > 0);
  return (
    <li>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h4 className="text-[13px] font-medium text-text-primary">{title}</h4>
        <p className="flex flex-wrap items-baseline justify-end gap-x-2">
          <span className="text-[22px] leading-7 font-semibold tracking-[-0.02em] text-text-primary tabular">{formatNumber(value)}</span>
          {rateLabel && <span className="text-[12.5px] text-text-secondary">{rateLabel}</span>}
        </p>
      </div>

      <div className="mt-2 h-8 w-full rounded-lg bg-surface-sunken" aria-hidden="true">
        {widthPct > 0 && (
          <div className="flex h-full gap-px overflow-hidden rounded-lg motion-safe:animate-fade-in" style={{ width: `${widthPct}%` }}>
            {drawn.map((segment) => (
              <div key={segment.key} data-segment={segment.key} className={segment.swatch} style={{ flexGrow: segment.value, flexBasis: 0, minWidth: 6 }} />
            ))}
          </div>
        )}
      </div>

      {showLegend && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {segments.map((segment) => (
            <li key={segment.key} className={cn("flex items-center gap-1.5 text-[12px] text-text-secondary", segment.value === 0 && "opacity-70")}>
              <span className={cn("size-2.5 shrink-0 rounded-[3px]", segment.swatch)} aria-hidden="true" />
              <span>{segment.label}</span>
              <span className="font-medium text-text-primary tabular">{formatNumber(segment.value)}</span>
            </li>
          ))}
        </ul>
      )}

      {note && <p className="mt-1.5 text-[12px] leading-5 text-text-tertiary">{note}</p>}
    </li>
  );
}

export function HonestFunnel({ funnel, revenue, className }: { funnel: FunnelStats; revenue: RevenueStats; className?: string }) {
  const proposed = funnel.proposed.value;
  const accepted = funnel.accepted.value;
  const purchased = funnel.purchased.value;
  const pending = funnel.pending;

  const proposedSegments: Segment[] = [
    { key: "accepted", label: "Acceptés", value: accepted, swatch: SWATCH.accepted },
    { key: "removed", label: "Retirés par l'équipe", value: funnel.removedByTeam, swatch: SWATCH.removed },
    { key: "unanswered", label: "Sans réponse", value: funnel.unanswered, swatch: SWATCH.unanswered },
    ...(pending > 0 ? [{ key: "pending", label: "En attente (moins de 24 h)", value: pending, swatch: SWATCH.pending }] : []),
  ];
  const acceptedSegments: Segment[] = [
    { key: "confirmed", label: "Conseils achetés", value: purchased, swatch: SWATCH.confirmed },
    { key: "notConfirmed", label: "Acceptés non confirmés", value: funnel.acceptedNotConfirmed, swatch: SWATCH.notConfirmed },
    { key: "declined", label: "Refusés par le patient", value: funnel.declinedByPatient, swatch: SWATCH.declined },
  ];

  const acceptanceRate = funnel.acceptanceRate.value;
  const conversionRate = funnel.conversionRate.value;

  const pendingNote =
    pending > 0
      ? `${countOf(pending, "conseil proposé", "conseils proposés")} depuis moins de 24 h ${pending > 1 ? "attendent" : "attend"} encore une décision : ${pending > 1 ? "ils ne comptent" : "il ne compte"} pas encore dans le taux.`
      : undefined;
  const acceptedNote =
    accepted === 0
      ? "Aucun conseil accepté pour l'instant."
      : purchased === 0
        ? "Un conseil accepté n'est pas une vente : aucun conseil acheté n'est enregistré pour l'instant."
        : funnel.acceptedNotConfirmed > 0
          ? "Les acceptés non confirmés n'ont pas de vente enregistrée : ils ne font pas de chiffre d'affaires."
          : undefined;
  const confirmedNote = "Conseils qui ont donné lieu à une vente enregistrée dans PharmaBoost : un conseil compte une fois, quel que soit le nombre de ventes.";

  const hasAdvice = proposed > 0;
  const fewAdvice = hasAdvice && proposed < FEW_ADVICE_BELOW;
  const averageBasket = revenue.averageBasketCents;

  return (
    <Card className={className}>
      <CardHeader title="Du conseil à la vente" description="Ce que l'équipe a retenu, et ce qui est devenu une vente enregistrée." />
      <CardContent className="space-y-5">
        {hasAdvice ? (
          <>
            {fewAdvice && (
              <p className="flex items-start gap-2 rounded-lg bg-info-50 px-3 py-2 text-[12.5px] leading-5 text-info-700 dark:bg-info-700/20 dark:text-info-500">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>Peu de conseils sur cette période : un seul conseil de plus ou de moins fait beaucoup bouger les pourcentages.</span>
              </p>
            )}
            <ol className="space-y-5">
              <Stage title="Conseils proposés" value={proposed} note={pendingNote} widthPct={100} segments={proposedSegments} showLegend />
              <Stage
                title="Conseils acceptés"
                value={accepted}
                rateLabel={acceptanceRate === null ? "Taux d'acceptation : pas encore de conseil tranché" : `Taux d'acceptation ${formatRate(acceptanceRate)}`}
                note={acceptedNote}
                widthPct={widthPercent(accepted, proposed)}
                segments={acceptedSegments}
                showLegend
              />
              <Stage
                title="Conseils achetés"
                value={purchased}
                rateLabel={conversionRate === null ? undefined : `${formatRate(conversionRate)} des conseils acceptés`}
                note={confirmedNote}
                widthPct={widthPercent(purchased, proposed)}
                segments={[{ key: "confirmed", label: "Conseils achetés", value: purchased, swatch: SWATCH.confirmed }]}
                showLegend={false}
              />
            </ol>
          </>
        ) : (
          <p className="rounded-lg bg-surface-sunken px-4 py-6 text-center text-[13px] text-text-secondary">PharmaBoost n&apos;a encore rien proposé à votre équipe sur cette période.</p>
        )}

        <div className="rounded-lg border border-border-subtle bg-surface-sunken/50 p-4">
          <h4 className="text-[13px] font-medium text-text-primary">Côté caisse</h4>
          <p className="mt-0.5 text-[12px] leading-5 text-text-tertiary">Compté à la date de la vente, pas à la date du conseil : les deux ne se correspondent pas ligne à ligne.</p>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
            <div>
              <dt className="text-[12px] text-text-secondary">Chiffre d&apos;affaires attribué</dt>
              <dd className="mt-0.5 text-[17px] leading-6 font-semibold text-text-primary tabular">
                {formatCents(revenue.confirmedTtcCents.value)} <span className="text-[12px] font-normal text-text-tertiary">TTC</span>
              </dd>
            </div>
            <div>
              <dt className="text-[12px] text-text-secondary">Ventes confirmées</dt>
              <dd className="mt-0.5 text-[17px] leading-6 font-semibold text-text-primary tabular">{formatNumber(revenue.confirmedSales.value)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-text-secondary">Panier moyen</dt>
              <dd className="mt-0.5 text-[17px] leading-6 font-semibold text-text-primary tabular">{averageBasket === null ? "—" : formatCents(averageBasket)}</dd>
            </div>
          </dl>
          {revenue.unpricedLines > 0 && (
            <p className="mt-3 flex items-start gap-2 text-[12.5px] leading-5 text-warning-700 dark:text-warning-500">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                {countOf(revenue.unpricedLines, "ligne de vente", "lignes de vente")} {revenue.unpricedLines > 1 ? "n'ont" : "n'a"} pas de prix saisi : aucun chiffre d&apos;affaires n&apos;est compté {revenue.unpricedLines > 1 ? "pour elles" : "pour elle"}.
              </span>
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
