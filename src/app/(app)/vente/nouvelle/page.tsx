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
import { NOT_LINKED, thisPcComptoir } from "@/server/services/post-link";
import { countCounterRequestsToday } from "@/server/services/counter-request";
import { isCommercialDemoPharmacy } from "@/core/demo/identity";
import { findDemoScenario } from "@/core/demo/scenarios";
import { CounterDashboard } from "./counter-dashboard";
import { NewPrescriptionForm } from "./new-prescription-form";
import { CounterRequestCard } from "./counter-request";
import { loadCounterRobotTips } from "@/server/services/robot-tips";
import { robotGreeting } from "@/core/robot/companion";

export const metadata: Metadata = { title: "Nouvelle vente" };

/**
 * « Nouvelle vente » est le tableau de bord du comptoir : le pharmacien travaille dans son logiciel de
 * pharmacie, bipe ses boîtes, et PharmaBoost intervient de lui-même. La saisie à la main (ordonnance,
 * médicament, demande sans ordonnance) reste derrière « Saisie manuelle ».
 */
export default async function NewPrescriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string; demande?: string; lien?: string }>;
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

  // Chaque comptoir est un espace à part : cet écran ne montre que les délivrances des comptoirs de cette personne. Sur le
  // PC d'un comptoir, le comptoir lui revient d'abord tout seul (la même vérification que la coquille, faite une fois), et
  // l'écran est celui de CE comptoir seulement — même si la même personne est connectée sur un autre PC lié.
  const thisPc = await thisPcComptoir(session.scope.pharmacyId, session.scope.userId, true).catch(() => NOT_LINKED);
  const mine = await myComptoirs(session.scope, thisPc.postId);
  const [dashboard, liveSalesRaw, requestsToday, pharmacy] = await Promise.all([
    loadCounterDashboard(session.scope, now, { canAssign: session.permissions.has(PERMISSIONS.PRODUCT_IMPORT), thisPcPostId: thisPc.postId }),
    // Les délivrances qui arrivent de la douchette du LGO : la carte se met à jour seule.
    listLiveCounterSales(session.scope.pharmacyId, mine.postIds),
    // Les demandes sans ordonnance traitées aujourd'hui : le comptoir voit ce qu'il a fait.
    countCounterRequestsToday(session.scope.pharmacyId, startOfParisDay(now)),
    prisma.pharmacy.findUnique({ where: { id: session.scope.pharmacyId }, select: { stockSyncedAt: true } }),
  ]);
  // Ce que le robot du coin peut dire : challenge proche d'un palier, dates courtes, stock — pour cette officine et cette personne.
  const canUpdateStock = session.permissions.has(PERMISSIONS.PRODUCT_IMPORT);
  const robotTips = await loadCounterRobotTips(session.scope, {
    canUpdateStock,
    canSeeChallenges: session.permissions.has(PERMISSIONS.TEAM_MANAGE),
    isDemo: session.pharmacy.isDemo,
    stockSyncedAt: pharmacy?.stockSyncedAt ?? null,
    now,
  }).catch(() => []);
  const liveSales = liveSalesRaw.map((sale) => ({ id: sale.id, reference: sale.reference, status: sale.status, post: sale.counterPost, updatedAt: sale.updatedAt.toISOString(), lines: sale.lines.map((line) => ({ drugName: line.drugName ?? "", quantity: line.quantity ?? 1 })), recommendations: sale._count.recommendations }));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {isCommercialDemoPharmacy(session.pharmacy) && (
        <p className="rounded-xl border border-dashed border-brand-300 bg-brand-50/50 px-4 py-3 text-[13.5px] text-text-secondary dark:border-brand-800 dark:bg-brand-950/20">
          Pas de douchette dans cette démonstration.{" "}
          <Link href="/demo" className="font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-400">
            Simuler une délivrance
          </Link>{" "}
          : les boîtes arrivent comme si elles étaient passées à la caisse.
        </p>
      )}

      {params.lien === "perime" && (
        <p role="status" className="rounded-xl border border-border-subtle bg-surface-card px-4 py-3 text-[13.5px] leading-5 text-text-secondary">
          Ce lien d&apos;ouverture a déjà servi ou a expiré. Sur l&apos;ordinateur du comptoir, cliquez sur l&apos;icône PharmaBoost près de l&apos;horloge, puis « Ouvrir mon espace PharmaBoost ».
        </p>
      )}

      <CounterDashboard
        dateLabel={formatParisDate(now)}
        initial={dashboard}
        initialSales={liveSales}
        canConfigure={session.permissions.has(PERMISSIONS.PRODUCT_IMPORT)}
        manualOpen={Boolean(params.patient || params.demande)}
        robotTips={robotTips}
        robotGreeting={robotGreeting(parisHour(now), session.user.firstName)}
        // Le rappel du stock : seulement pour le titulaire, jamais pour l'équipe au comptoir. Le robot le reprend quand c'est sa phrase du moment.
        stockBanner={<StockReminderBanner stockSyncedAt={pharmacy?.stockSyncedAt ?? null} canImport={canUpdateStock} isDemo={session.pharmacy.isDemo} />}
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

function parisHour(date: Date): number {
  return Number(new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(date));
}

function formatParisDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" }).format(date);
}
