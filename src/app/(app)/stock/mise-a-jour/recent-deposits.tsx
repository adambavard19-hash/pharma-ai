import type { DepositView } from "@/core/stock-deposit/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { depositBadge, describeDepositLine } from "./view";

/** Les derniers fichiers reçus : quand, lequel, ce qui s'est passé. Rien d'autre. */
export function RecentDeposits({ deposits }: { deposits: DepositView[] }) {
  return (
    <Card>
      <CardHeader title="Vos derniers envois" />
      <CardContent className="pt-0">
        {deposits.length === 0 ? (
          <p className="text-[13.5px] text-text-secondary">Aucun fichier reçu pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {deposits.map((deposit) => {
              const badge = depositBadge(deposit);
              return (
                <li key={deposit.id} className="space-y-1 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="min-w-0 truncate text-[13.5px] font-medium text-text-primary">{deposit.fileName}</span>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </div>
                  <p className="text-[13px] text-text-secondary">{describeDepositLine(deposit)}</p>
                  <p className="text-[12px] text-text-tertiary">{formatDateTime(deposit.receivedAt)}</p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
