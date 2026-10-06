import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { stockAgeDays, stockReminderLevel } from "@/core/stock-deposit/rules";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Le texte du rappel : sobre à 3 jours, appuyé à 7 jours ou quand rien n'a jamais été envoyé. */
export function describeStockReminder(stockSyncedAt: Date | null, now: Date): { level: "soft" | "strong"; text: string } | null {
  const level = stockReminderLevel(stockSyncedAt, now);
  if (level === "none") return null;
  const days = stockAgeDays(stockSyncedAt, now);
  if (days === null) return { level, text: "Envoyez votre stock pour que PharmaBoost conseille selon ce que vous avez vraiment." };
  const age = `Votre stock date de ${days} jour${days > 1 ? "s" : ""}.`;
  return { level, text: level === "soft" ? `${age} Mettez-le à jour en 1 minute.` : `${age} Mettez-le à jour pour que PharmaBoost conseille selon ce que vous avez vraiment.` };
}

/**
 * Le rappel au titulaire quand son stock est vieux.
 *
 * Un seul bouton, vers la page « Mettre à jour mon stock ». Réservé à celui qui
 * a le droit d'envoyer le stock (`canImport`) : l'équipe au comptoir n'a rien à
 * en faire. Jamais en mode démo : le stock d'une officine de démonstration
 * n'est pas à rafraîchir.
 */
export function StockReminderBanner({ stockSyncedAt, canImport, isDemo = false, now = new Date() }: { stockSyncedAt: Date | null; canImport: boolean; isDemo?: boolean; now?: Date }) {
  if (!canImport || isDemo) return null;
  const reminder = describeStockReminder(stockSyncedAt, now);
  if (!reminder) return null;
  const strong = reminder.level === "strong";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 text-[14px]",
        strong ? "border-warning-300 bg-warning-50 py-3.5 dark:border-warning-800 dark:bg-warning-950/30" : "border-border-subtle bg-surface-card py-2.5",
      )}
    >
      <p className={cn("flex min-w-0 flex-1 items-start gap-2.5 leading-5", strong ? "font-medium text-text-primary" : "text-text-secondary")}>
        {strong ? <AlertTriangle className="mt-0.5 size-[18px] shrink-0 text-warning-700 dark:text-warning-400" aria-hidden="true" /> : <RefreshCw className="mt-0.5 size-4 shrink-0 text-text-tertiary" aria-hidden="true" />}
        {reminder.text}
      </p>
      <Button asChild size="sm" variant={strong ? "primary" : "outline"}>
        <Link href="/stock/mise-a-jour">Mettre à jour mon stock</Link>
      </Button>
    </div>
  );
}
