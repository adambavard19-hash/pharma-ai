import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PerformanceDashboard } from "@/components/performance/performance-dashboard";
import { Alert } from "@/components/ui/feedback";
import { parsePeriodParams } from "@/core/performance/periods";
import { loadPerformanceForPlatform } from "@/server/services/performance";
import { isDemoMode } from "@/config/env";
import { TIME_ZONE } from "@/config/constants";

/**
 * Ce que PharmaBoost rapporte à cette officine : le même tableau de bord que
 * celui de son titulaire, vu de la console. La période passe par l'adresse
 * (`?onglet=performance&periode=7j`) : aucune action serveur, rien à enregistrer.
 * Des ventes enregistrées dans PharmaBoost et des volumes de conseils — aucune
 * donnée patient, aucune ventilation par collaborateur.
 *
 * L'officine de démonstration, hors environnement démo : le service la lit mais
 * filtre toute son activité (`activityScope`), donc le rapport est vide. Un tableau
 * « PharmaBoost n'a encore rien mesuré » serait une fausse mesure : on dit plutôt
 * que ses données ne sont pas comptées ici.
 */
export async function PerformanceTab({ pharmacyId, query, now }: { pharmacyId: string; query: Record<string, string | string[] | undefined>; now: Date }) {
  // Seuls les trois paramètres de période sont lus ; toute valeur douteuse retombe sur « 7 jours ».
  const period = parsePeriodParams({ periode: query.periode, du: query.du, au: query.au }, now, TIME_ZONE);
  const data = await loadPerformanceForPlatform({ pharmacyId, period, now });
  if (!data) notFound();

  const demoExcluded = data.pharmacy.isDemo && !isDemoMode();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        {!demoExcluded && <p className="text-[13px] leading-5 text-text-secondary">Les mêmes chiffres que dans l&apos;espace du titulaire.</p>}
        <Link href="/admin/performance" className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700 hover:underline dark:text-brand-400">
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          Toutes les officines
        </Link>
      </div>
      {demoExcluded ? (
        <Alert tone="info" title="Officine de démonstration : ses données ne sont pas comptées ici." />
      ) : (
        <PerformanceDashboard report={data.report} roi={data.roi} basePath={`/admin/pharmacies/${data.pharmacy.id}`} preserveParams={{ onglet: "performance" }} audience="platform" now={now} />
      )}
    </div>
  );
}
