import Link from "next/link";
import { FileText } from "lucide-react";
import type { DepositView } from "@/core/stock-deposit/types";
import { DEPOSIT_RETENTION_DAYS, DEPOSIT_SOURCE_LABELS, describeDepositResult } from "@/core/stock-deposit/rules";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { HeldActions, RetryButton } from "./deposit-actions";
import { DepositStatusBadge, STALLED_MESSAGE, formatFileSize } from "./status";

/**
 * Un fichier de stock reçu : qui l'a envoyé, quand, son état, ce qui en a été fait, et les gestes de l'équipe quand il attend
 * une décision ou une relance. Partagé par la liste « Stocks reçus » (toutes les officines) et par la fiche d'une officine.
 */
export function DepositFileRow({ deposit, showPharmacy = true }: { deposit: DepositView; showPharmacy?: boolean }) {
  const result = describeDepositResult(deposit);
  return (
    <li className="space-y-2 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {showPharmacy &&
          (deposit.pharmacyName ? (
            <Link href={`/admin/pharmacies/${deposit.pharmacyId}`} className="text-[14px] font-semibold text-text-primary hover:underline">
              {deposit.pharmacyName}
            </Link>
          ) : (
            <span className="text-[14px] font-semibold text-text-tertiary">Officine supprimée</span>
          ))}
        <DepositStatusBadge status={deposit.status} stalled={deposit.stalled} />
        <span className="text-[12px] text-text-tertiary">
          <time dateTime={deposit.receivedAt.toISOString()}>{formatDateTime(deposit.receivedAt)}</time> · {DEPOSIT_SOURCE_LABELS[deposit.source]}
        </span>
      </div>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-text-secondary">
        <FileText className="size-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
        {deposit.hasFile ? (
          <a href={`/api/admin/depots-stock/${deposit.id}/fichier`} title="Télécharger le fichier reçu" className="min-w-0 font-medium break-all text-brand-700 hover:underline dark:text-brand-400">
            {deposit.fileName}
          </a>
        ) : (
          <span className="min-w-0 break-all">{deposit.fileName}</span>
        )}
        <span className="text-text-tertiary">
          {formatFileSize(deposit.fileSize)}
          {deposit.hasFile ? "" : ` · fichier supprimé (gardé ${DEPOSIT_RETENTION_DAYS} jours)`}
        </span>
      </p>

      {result && <p className="text-[13px] text-text-primary">{result}</p>}
      {deposit.stalled && !deposit.message && <p className="text-[12.5px] leading-5 text-danger-700 dark:text-danger-500">{STALLED_MESSAGE}</p>}
      {deposit.message && (
        <p className={cn("text-[12.5px] leading-5", deposit.status === "HELD" && "text-warning-700 dark:text-warning-500", deposit.status === "FAILED" && "text-danger-700 dark:text-danger-500", deposit.status !== "HELD" && deposit.status !== "FAILED" && "text-text-tertiary")}>{deposit.message}</p>
      )}

      {deposit.status === "HELD" && <HeldActions id={deposit.id} fileName={deposit.fileName} pharmacyName={deposit.pharmacyName} />}
      {/* Un fichier « en cours » depuis trop longtemps se relance comme un fichier en échec. */}
      {(deposit.status === "FAILED" || deposit.stalled) && <RetryButton id={deposit.id} />}
    </li>
  );
}
