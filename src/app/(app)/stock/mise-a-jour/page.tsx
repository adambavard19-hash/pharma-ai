import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Inbox } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { listPharmacyDeposits } from "@/server/services/stock-deposits";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { RecentDeposits } from "./recent-deposits";
import { UpdateFlow } from "./update-flow";
import { HELD_NOTICE, REJECTED_NOTICE, linesOfLastStock, stockState } from "./view";

export const metadata: Metadata = { title: "Mettre à jour mon stock" };

// Le fichier envoyé d'ici est lu, classé puis écrit en une fois : on déclare la
// durée à l'hébergeur plutôt que d'être coupé en route.
export const maxDuration = 300;

const STATE_STYLES = {
  success: { box: "border-success-200 bg-success-50 dark:border-success-800 dark:bg-success-950/30", icon: "text-success-600 dark:text-success-400", Icon: CheckCircle2 },
  warning: { box: "border-warning-300 bg-warning-50 dark:border-warning-800 dark:bg-warning-950/30", icon: "text-warning-700 dark:text-warning-400", Icon: AlertTriangle },
  neutral: { box: "border-border-default bg-surface-card", icon: "text-text-tertiary", Icon: Inbox },
} as const;

/**
 * Mettre à jour mon stock — le parcours en trois étapes (choisir le fichier, vérifier, confirmer), l'état du stock en
 * haut, et ce qui s'est passé aux derniers envois en bas. Les contrôles (fichier incomplet, lignes illisibles, produits
 * qui passeraient à 0) sont ceux du serveur ; l'équipe PharmaBoost tranche ce qui sort de l'ordinaire. Les dossiers et
 * les réglages du serveur de l'officine n'ont plus rien à faire ici : ils sont dans l'espace d'assistance de la console.
 */
export default async function StockUpdatePage() {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const pharmacyId = session.scope.pharmacyId;

  const [pharmacy, deposits] = await Promise.all([
    prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { stockSyncedAt: true } }),
    listPharmacyDeposits(pharmacyId, 5),
  ]);

  const now = new Date();
  const syncedAt = pharmacy?.stockSyncedAt ?? null;
  const state = stockState({ syncedAt, lines: linesOfLastStock(syncedAt, deposits), now });
  const look = STATE_STYLES[state.tone];
  const latest = deposits[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 pb-20">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/stock">Mon stock</Link>
      </Button>

      <PageHeader title="Mettre à jour mon stock" description="PharmaBoost ne conseille que ce que vous avez en rayon : plus votre stock est récent, plus ses conseils sont justes." />

      <section aria-labelledby="etat-du-stock" className={cn("flex items-start gap-3 rounded-2xl border p-4 sm:p-5", look.box)}>
        <look.Icon className={cn("mt-0.5 size-6 shrink-0", look.icon)} aria-hidden="true" />
        <div className="min-w-0">
          <h2 id="etat-du-stock" className="text-[17px] leading-6 font-semibold text-text-primary">
            {state.title}
          </h2>
          <p className="text-[14px] leading-5 text-text-secondary">{state.detail}</p>
        </div>
      </section>

      {latest?.status === "HELD" && (
        <Alert tone="warning" title="Votre dernier fichier est en vérification">
          {HELD_NOTICE}
        </Alert>
      )}
      {latest?.status === "FAILED" && (
        <Alert tone="danger" title="Votre dernier fichier n'a pas pu être lu">
          {latest.message ? `${latest.message} ` : ""}Votre stock n&apos;a pas changé. L&apos;équipe PharmaBoost est prévenue.
        </Alert>
      )}
      {latest?.status === "REJECTED" && (
        <Alert tone="neutral" title="Votre dernier fichier n'a pas été appliqué">
          {REJECTED_NOTICE}
        </Alert>
      )}
      {latest?.status === "RECEIVED" && latest.stalled && (
        <Alert tone="warning" title="La lecture de votre dernier fichier s'est interrompue">
          Renvoyez votre fichier avec le parcours ci-dessous : votre stock n&apos;a pas changé.
        </Alert>
      )}

      <UpdateFlow />

      <RecentDeposits deposits={deposits} />
    </div>
  );
}
