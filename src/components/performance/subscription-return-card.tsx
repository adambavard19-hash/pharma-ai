import { Info, PiggyBank } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROI_MIN_PRICED_LINES, ROI_MIN_PRICED_SHARE } from "@/core/performance/definitions";
import type { SubscriptionReturn, SubscriptionReturnHiddenReason } from "@/core/performance/types";
import { formatCents } from "@/lib/format";
import { cn } from "@/lib/utils";
import { capitalizeFirst, countOf, formatRate } from "./format";

/**
 * Ce qui manque encore pour que le retour s'affiche, dit simplement (la suite
 * de « Retour sur abonnement : »). On n'affiche JAMAIS un rapport douteux :
 * tant que les conditions ne sont pas réunies, une seule ligne discrète
 * explique ce qu'on attend — ou, pour un abonnement partagé, pourquoi on ne
 * l'affichera pas : le chiffre d'affaires d'une officine ne se compare pas au
 * prix du groupe.
 */
const WAITING_FOR: Record<SubscriptionReturnHiddenReason, string> = {
  no_subscription: "il s'affichera dès qu'un abonnement sera actif sur votre officine.",
  no_price: "il s'affichera dès que le tarif de votre abonnement sera connu.",
  not_enough_sales: `il s'affichera dès que le mois comptera au moins ${countOf(ROI_MIN_PRICED_LINES, "ligne de vente confirmée", "lignes de vente confirmées")} au prix connu.`,
  prices_unreliable: `il s'affichera dès que presque toutes les lignes de vente confirmées du mois auront un prix saisi (au moins ${Math.round(ROI_MIN_PRICED_SHARE * 100)} %).`,
  no_data: "il s'affichera dès que des ventes confirmées seront enregistrées ce mois-ci.",
  shared_subscription: "il n'est pas calculé, car votre abonnement couvre plusieurs officines (le chiffre d'affaires d'une seule ne se compare pas au prix du groupe).",
};

/** Deux barres sur la même échelle : l'abonnement, et ce que les ventes confirmées ont représenté (HT). */
function ComparisonBars({ subscriptionCents, confirmedCents }: { subscriptionCents: number; confirmedCents: number }) {
  const scale = Math.max(subscriptionCents, confirmedCents, 1);
  const rows = [
    { key: "subscription", label: "Votre abonnement", cents: subscriptionCents, bar: "bg-ink-300 dark:bg-ink-600" },
    { key: "confirmed", label: "Ventes confirmées", cents: confirmedCents, bar: "bg-brand-600 dark:bg-brand-500" },
  ];
  return (
    <div
      role="img"
      aria-label={`Hors taxes, ce mois-ci : abonnement ${formatCents(subscriptionCents)}, ventes confirmées ${formatCents(confirmedCents)}.`}
      className="space-y-3"
    >
      {rows.map((row) => (
        <div key={row.key} className="space-y-1" aria-hidden="true">
          <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
            <span className="text-text-secondary">{row.label}</span>
            <span className="font-medium text-text-primary tabular">{formatCents(row.cents)} HT</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-sunken">
            <div
              data-bar={row.key}
              className={cn("h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none", row.bar)}
              style={{ width: `${Math.max(2, Math.round((row.cents / scale) * 100))}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * « Mon abonnement me coûte X €, PharmaBoost m'a permis d'attribuer X € de
 * ventes ce mois-ci. » Toujours le mois civil en cours, quelle que soit la
 * période choisie plus haut. Le chiffre d'affaires est hors taxes, comparé au
 * prix hors taxes du contrat : ce n'est pas un bénéfice, et la carte le dit.
 */
export function SubscriptionReturnCard({ roi, audience }: { roi: SubscriptionReturn; audience: "owner" | "platform" }) {
  if (roi.status === "hidden") {
    return (
      <div data-state="roi-hidden" className="flex gap-3 rounded-xl border border-dashed border-border-default bg-surface-card px-4 py-3.5">
        <span className="mt-0.5 shrink-0 text-text-tertiary">
          <Info className="size-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-0.5 text-[13px] leading-5">
          {audience === "owner" ? (
            <p className="text-text-secondary">
              <span className="font-medium text-text-primary">Retour sur abonnement :</span> {WAITING_FOR[roi.reason]}
            </p>
          ) : (
            <>
              <p className="font-medium text-text-primary">Retour sur abonnement non mesurable</p>
              <p className="text-text-secondary">{roi.detail}</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const aboveOne = roi.ratio >= 1;

  return (
    <Card
      data-state="roi-shown"
      className={cn(
        "overflow-hidden p-5",
        aboveOne && "border-brand-200 bg-gradient-to-br from-brand-50 to-surface-card dark:border-brand-800/60 dark:from-brand-950 dark:to-surface-card",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            aboveOne ? "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300" : "bg-surface-sunken text-text-tertiary",
          )}
        >
          <PiggyBank className="size-4.5" aria-hidden="true" />
        </span>
        <h3 className="text-[15px] leading-6 font-semibold text-text-primary">Retour sur abonnement</h3>
        <Badge tone="neutral">{capitalizeFirst(roi.monthLabel)}</Badge>
        {roi.trialing && <Badge tone="info">Période d&apos;essai</Badge>}
      </div>

      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-center">
        <div className="space-y-2">
          <p
            className={cn(
              "text-[34px] leading-10 font-semibold tracking-[-0.02em] tabular",
              aboveOne ? "text-brand-700 dark:text-brand-300" : "text-text-primary",
            )}
          >
            {roi.ratioLabel}
          </p>
          <p className="max-w-xl text-[14px] leading-6 text-text-primary">{roi.sentence}</p>
        </div>
        <ComparisonBars subscriptionCents={roi.monthlyPriceHtCents} confirmedCents={roi.confirmedHtCents} />
      </div>

      <p className="mt-4 border-t border-border-subtle pt-3 text-[12px] leading-5 text-text-tertiary">
        Toujours le mois en cours, quelle que soit la période choisie. Chiffre d&apos;affaires hors taxes des ventes confirmées, comparé au prix mensuel hors taxes du contrat : ce n&apos;est pas un
        bénéfice. Calculé sur {countOf(roi.confirmedLines, "ligne de vente", "lignes de vente")} au prix connu ({formatRate(roi.pricedShare)} des lignes confirmées).
      </p>
    </Card>
  );
}
