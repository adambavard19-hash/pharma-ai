import { activityScope } from "@/server/db/demo-scope";
import type { Metadata } from "next";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getOCRProvider } from "@/server/ai/registry";
import { patientDataEnabled } from "@/config/env";
import { StockReminderBanner } from "@/components/app/stock-reminder";
import { loadFinishedToday, loadLiveBoard } from "@/server/services/counter-board";
import { loadCounterDashboard, startOfParisDay } from "@/server/services/counter-dashboard";
import { NOT_LINKED, thisPcComptoir } from "@/server/services/post-link";
import { countCounterRequestsToday } from "@/server/services/counter-request";
import { isCommercialDemoPharmacy } from "@/core/demo/identity";
import { CounterDemoCard } from "../../demo/counter-demo-card";
import { CounterDashboard } from "./counter-dashboard";
import { HelixBackdrop } from "@/components/app/helix/helix-backdrop";
import { NewPrescriptionForm } from "./new-prescription-form";
import { CounterRequestCard } from "./counter-request";
import { TIME_ZONE } from "@/config/constants";

export const metadata: Metadata = { title: "Au comptoir" };

/**
 * « Au comptoir » (adresse historique /vente/nouvelle, alias /comptoir) : au comptoir, c'est la bannière du poste Windows
 * qui fait tout ; cette page suit les délivrances en cours de MES comptoirs, retrouve les ventes terminées du jour, et
 * garde la saisie à la main (ordonnance, médicament, demande sans ordonnance) repliée, en secours.
 */
export default async function NewPrescriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string; demande?: string; lien?: string }>;
}) {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_CREATE);
  // Le compte de démonstration : au comptoir, seulement la démo plein écran (fondateur, 26 oct. 2026).
  if (isCommercialDemoPharmacy(session.pharmacy)) {
    return (
      <div className="mx-auto max-w-3xl">
        <CounterDemoCard />
      </div>
    );
  }
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

  // Chaque comptoir est un espace à part : cet écran ne montre que les délivrances des comptoirs de cette personne. Sur le
  // PC d'un comptoir, le comptoir lui revient d'abord tout seul (la même vérification que la coquille, faite une fois), et
  // l'écran est celui de CE comptoir seulement — même si la même personne est connectée sur un autre PC lié.
  const thisPc = await thisPcComptoir(session.scope.pharmacyId, session.scope.userId, true).catch(() => NOT_LINKED);
  const [dashboard, liveSales, finished, requestsToday, pharmacy] = await Promise.all([
    loadCounterDashboard(session.scope, now, { canAssign: session.permissions.has(PERMISSIONS.PRODUCT_IMPORT), thisPcPostId: thisPc.postId }),
    // Les délivrances qui arrivent de la douchette du LGO : la liste se met à jour seule.
    loadLiveBoard(session.scope, thisPc.postId),
    loadFinishedToday(session.scope, thisPc.postId, now),
    // Les demandes sans ordonnance traitées aujourd'hui : le comptoir voit ce qu'il a fait.
    countCounterRequestsToday(session.scope.pharmacyId, startOfParisDay(now)),
    prisma.pharmacy.findUnique({ where: { id: session.scope.pharmacyId }, select: { stockSyncedAt: true } }),
  ]);
  const canUpdateStock = session.permissions.has(PERMISSIONS.PRODUCT_IMPORT);

  return (
    // L'hélice d'ADN en fond de toute la fenêtre (fixe, z-index négatif) : ce conteneur ne doit pas l'isoler.
    <div className="mx-auto max-w-3xl space-y-4">
      <HelixBackdrop />

      {params.lien === "perime" && (
        <p role="status" className="rounded-xl border border-border-subtle bg-surface-card px-4 py-3 text-[13.5px] leading-5 text-text-secondary">
          Ce lien d&apos;ouverture a déjà servi ou a expiré. Sur l&apos;ordinateur du comptoir, cliquez sur l&apos;icône PharmaBoost près de l&apos;horloge, puis « Ouvrir mon espace PharmaBoost ».
        </p>
      )}

      <CounterDashboard
        dateLabel={formatParisDate(now)}
        initial={dashboard}
        initialSales={liveSales}
        initialFinished={finished}
        canConfigure={canUpdateStock}
        manualOpen={Boolean(params.patient || params.demande)}
        // Le rappel du stock : seulement pour le titulaire, jamais pour l'équipe au comptoir.
        notice={<StockReminderBanner stockSyncedAt={pharmacy?.stockSyncedAt ?? null} canImport={canUpdateStock} isDemo={session.pharmacy.isDemo} />}
      >
        <NewPrescriptionForm
          patients={patientDataEnabled() ? patients : []}
          patientData={patientDataEnabled()}
          preselectedPatientId={patientDataEnabled() ? (params.patient ?? null) : null}
          canReadPrescriptions={canReadPrescriptions}
        />
        <CounterRequestCard today={requestsToday} />
      </CounterDashboard>
    </div>
  );
}

function formatParisDate(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, weekday: "long", day: "numeric", month: "long" }).format(date);
}
