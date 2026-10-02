import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { LotView } from "@/server/services/stock-lots";
import type { ShortDateThresholds } from "@/core/stock/expiry";
import { describeDaysLeft, formatExpiry } from "@/core/stock/expiry-input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ExpiryLevelBadge } from "./level-badge";
import { AddLotButton, type LotTarget } from "./lot-form";
import { LotRowActions } from "./lot-actions";

/**
 * Les dates de péremption d'un produit, sur sa fiche : les lots suivis, et
 * l'ajout d'un lot sans quitter la page. Sans effet sur la quantité.
 */
export function ProductLots({
  lots,
  today,
  thresholds,
  target,
  canAdjust,
}: {
  lots: LotView[];
  today: string;
  thresholds: ShortDateThresholds;
  target: LotTarget;
  canAdjust: boolean;
}) {
  return (
    <Card>
      <CardHeader
        title="Dates de péremption"
        description="Les lots suivis de ce produit. Sans effet sur la quantité du stock."
        action={canAdjust ? <AddLotButton today={today} thresholds={thresholds} target={target} label="Ajouter" variant="outline" size="sm" /> : undefined}
      />
      <CardContent className="space-y-3">
        {lots.length === 0 ? (
          <p className="text-[13px] text-text-tertiary">Aucune date suivie pour ce produit.</p>
        ) : (
          <ul className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
            {lots.map((lot) => (
              <li key={lot.id} className="space-y-1.5 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <ExpiryLevelBadge level={lot.level} />
                  <span className="text-[14px] font-semibold text-text-primary tabular">{formatExpiry(lot.expiresOn, lot.precision)}</span>
                  <span className="text-[12.5px] text-text-tertiary">{describeDaysLeft(lot.daysLeft)}</span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12.5px] text-text-secondary">
                    {[lot.lotNumber ? `Lot ${lot.lotNumber}` : "Lot non renseigné", lot.quantity ? `${lot.quantity} boîte${lot.quantity > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")}
                  </span>
                  {canAdjust && <LotRowActions lot={lot} today={today} thresholds={thresholds} />}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link href="/stock/dates-courtes" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700 hover:underline">
          Toutes les dates courtes <ArrowRight className="size-3.5" />
        </Link>
      </CardContent>
    </Card>
  );
}
