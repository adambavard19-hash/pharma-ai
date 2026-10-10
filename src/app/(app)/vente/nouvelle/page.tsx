import { activityScope } from "@/server/db/demo-scope";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getOCRProvider } from "@/server/ai/registry";
import { TIME_ZONE } from "@/config/constants";
import { patientDataEnabled } from "@/config/env";
import { StockReminderBanner } from "@/components/app/stock-reminder";
import { listLiveCounterSales } from "@/server/services/counter-scan";
import { loadCounterDashboard, startOfParisDay } from "@/server/services/counter-dashboard";
import { myComptoirs } from "@/server/services/comptoirs";
import { countCounterRequestsToday } from "@/server/services/counter-request";
import { isCommercialDemoPharmacy } from "@/core/demo/identity";
import { findDemoScenario } from "@/core/demo/scenarios";
import { CounterDashboard } from "./counter-dashboard";
import { NewPrescriptionForm } from "./new-prescription-form";
import { CounterRequestCard } from "./counter-request";

export const metadata: Metadata = { title: "Nouvelle vente" };

/**
 * « Nouvelle vente » est le tableau de bord du comptoir : le pharmacien travaille dans son logiciel de
 * pharmacie, bipe ses boîtes, et PharmaBoost intervient de lui-même. La saisie à la main (ordonnance,
 * médicament, demande sans ordonnance) reste derrière « Saisie manuelle ».
 */
export default async function NewPrescriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string; demande?: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_CREATE);
  const params = await searchParams;
  const now = new Date();

  const patients = await prisma.patient.findMany({
    where: { ...activityScope(session.scope), pharmacyId: session.scope.pharmacyId, deletedAt: null },
    orderBy: { lastName: "asc" },
    select: { id: true, firstName: true, lastName: true, reference: true, email: true },
    take: 500,
  });

  // L'écran ne promet une lecture automatique que si un lecteur est réellement
  // branché. Sinon il propose la saisie, sans expliquer pourquoi.
  const canReadPrescriptions = getOCRProvider().info.capability === "LIVE";

  // Un scénario de démonstration « sans ordonnance » arrive avec sa demande déjà saisie (jamais lancée toute seule).
  const demoRequest = isCommercialDemoPharmacy(session.pharmacy) && params.demande ? (findDemoScenario(params.demande)?.request ?? null) : null;

  // Chaque comptoir est un espace à part : cet écran ne montre que les délivrances des comptoirs de cette personne.
  const mine = await myComptoirs(session.scope);
  const [dashboard, liveSalesRaw, requestsToday, pharmacy] = await Promise.all([
    loadCounterDashboard(session.scope, now, { canAssign: session.permissions.has(PERMISSIONS.PRODUCT_IMPORT) }),
    // Les délivrances qui arrivent de la douchette du LGO : la carte se met à jour seule.
    listLiveCounterSales(session.scope.pharmacyId, mine.postIds),
    // Les demandes sans ordonnance traitées aujourd'hui : le comptoir voit ce qu'il a fait.
    countCounterRequestsToday(session.scope.pharmacyId, startOfParisDay(now)),
    prisma.pharmacy.findUnique({ where: { id: session.scope.pharmacyId }, select: { stockSyncedAt: true } }),
  ]);
  const liveSales = liveSalesRaw.map((sale) => ({ id: sale.id, reference: sale.reference, status: sale.status, post: sale.counterPost, updatedAt: sale.updatedAt.toISOString(), lines: sale.lines.map((line) => ({ drugName: line.drugName ?? "", quantity: line.quantity ?? 1 })), recommendations: sale._count.recommendations }));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Le rappel du stock : seulement pour le titulaire, jamais pour l'équipe au comptoir. */}
      <StockReminderBanner stockSyncedAt={pharmacy?.stockSyncedAt ?? null} canImport={session.permissions.has(PERMISSIONS.PRODUCT_IMPORT)} isDemo={session.pharmacy.isDemo} />

      {isCommercialDemoPharmacy(session.pharmacy) && (
        <p className="rounded-xl border border-dashed border-brand-300 bg-brand-50/50 px-4 py-3 text-[13.5px] text-text-secondary dark:border-brand-800 dark:bg-brand-950/20">
          Pas de douchette dans cette démonstration.{" "}
          <Link href="/demo" className="font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-400">
            Simuler une délivrance
          </Link>{" "}
          : les boîtes arrivent comme si elles étaient passées à la caisse.
        </p>
      )}

      <CounterDashboard
        dateLabel={formatParisDate(now)}
        initial={dashboard}
        initialSales={liveSales}
        canConfigure={session.permissions.has(PERMISSIONS.PRODUCT_IMPORT)}
        manualOpen={Boolean(params.patient || params.demande)}
      >
        <NewPrescriptionForm
          patients={patientDataEnabled() ? patients : []}
          patientData={patientDataEnabled()}
          preselectedPatientId={patientDataEnabled() ? (params.patient ?? null) : null}
          canReadPrescriptions={canReadPrescriptions}
        />
        <CounterRequestCard today={requestsToday} prefill={demoRequest} />
      </CounterDashboard>
    </div>
  );
}

function formatParisDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" }).format(date);
}
