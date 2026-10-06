import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadPerformanceReport, loadSubscriptionReturn } from "@/server/services/performance";
import { parsePeriodParams } from "@/core/performance/periods";
import { TIME_ZONE } from "@/config/constants";
import { PageHeader } from "@/components/ui/page";
import { PerformanceDashboard } from "@/components/performance/performance-dashboard";

export const metadata: Metadata = { title: "Ce que PharmaBoost vous rapporte" };

/**
 * « Ce que PharmaBoost vous rapporte » : la valeur mesurée des conseils, pour le titulaire.
 *
 * Même permission que Pilotage : un chiffre d'affaires attribué est une vue de titulaire,
 * l'équipe au comptoir ne le voit pas (403 sans la permission, et l'entrée de menu n'existe pas
 * pour elle). Pas de `loading.tsx` : il placerait la page dans une frontière Suspense, et un refus
 * deviendrait un 200 portant l'écran « Accès réservé » au lieu du vrai 403 (comme Pilotage).
 * L'officine vient TOUJOURS de la session, jamais de l'adresse ; l'adresse ne porte que la période. La période est lue par l'unique parseur du cœur, qui ne lève jamais d'erreur :
 * une valeur inconnue ou hostile retombe sur « 7 derniers jours ».
 *
 * `now` est lu une seule fois : la période, les deux lectures et l'affichage partagent le même
 * instant, sinon « aujourd'hui » et « le mois en cours » pourraient se décaler d'une lecture à l'autre.
 */
export default async function ResultatsPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string | string[]; du?: string | string[]; au?: string | string[] }>;
}) {
  const session = await requirePermission(PERMISSIONS.ANALYTICS_VIEW_TEAM_PERFORMANCE);
  const now = new Date();
  const period = parsePeriodParams(await searchParams, now, TIME_ZONE);
  const { pharmacyId } = session.scope;

  // L'officine de démonstration commerciale lit sa propre activité marquée démo ; une vraie officine, jamais.
  const demo = session.scope.isDemo ? { pharmacyIsDemo: true } : {};

  const [report, roi] = await Promise.all([loadPerformanceReport({ pharmacyId, period, now, ...demo }), loadSubscriptionReturn({ pharmacyId, now, ...demo })]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ce que PharmaBoost vous rapporte"
        description="Les conseils proposés à votre équipe, ceux qu'elle a retenus, et les ventes confirmées qui en découlent. Ces chiffres sont réservés au titulaire de l'officine et à l'équipe PharmaBoost qui vous accompagne."
      />

      <PerformanceDashboard report={report} roi={roi} basePath="/resultats" audience="owner" now={now} />
    </div>
  );
}
