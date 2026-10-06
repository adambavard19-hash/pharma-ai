import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, Inbox } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getConnection } from "@/server/services/stock-sync";
import { listPharmacyDeposits } from "@/server/services/stock-deposits";
import { describeAge } from "@/core/stock/connectors";
import { PageHeader, SectionHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { cn } from "@/lib/utils";
import { CopyPath } from "./copy-path";
import { DepositForm } from "./deposit-form";
import { ReceiveStep } from "./receive-step";
import { RecentDeposits } from "./recent-deposits";
import { StepCard } from "./step-card";
import {
  FOLDER_FALLBACK_NOTICE,
  FOLDER_LOCATION_NOTICE,
  FOLDER_SHORTCUT_NOTICE,
  HELD_NOTICE,
  REJECTED_NOTICE,
  ZERO_ABSENT_NOTICE,
  exportGuide,
  isFolderReady,
  linesOfLastStock,
  sharedFolderPath,
  stockState,
} from "./view";

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
 * Mettre à jour mon stock — la page unique du titulaire.
 *
 * Du haut en bas : où en est mon stock, comment le mettre à jour en trois
 * étapes (le chemin simple : le dossier PharmaBoost), envoyer le fichier d'ici
 * si je n'ai pas le dossier, et ce qui s'est passé aux derniers envois. Pas de
 * choix de colonnes, pas d'aperçu : la lecture et ses garde-fous sont ceux du
 * serveur, et l'équipe PharmaBoost tranche ce qui sort de l'ordinaire.
 */
export default async function StockUpdatePage() {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const pharmacyId = session.scope.pharmacyId;

  const [pharmacy, connection, deposits] = await Promise.all([
    prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { stockSyncedAt: true } }),
    getConnection(pharmacyId),
    listPharmacyDeposits(pharmacyId, 5),
  ]);

  const now = new Date();
  const syncedAt = pharmacy?.stockSyncedAt ?? null;
  const state = stockState({ syncedAt, lines: linesOfLastStock(syncedAt, deposits), now });
  const look = STATE_STYLES[state.tone];

  const folderReady = isFolderReady(connection);
  const unreachable = folderReady && connection?.freshness === "DISCONNECTED";
  const guide = exportGuide(connection?.lgo ?? "autre");
  const latest = deposits[0] ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/stock">Retour au stock</Link>
      </Button>

      <PageHeader title="Mettre à jour mon stock" description="PharmaBoost ne conseille que ce que vous avez en rayon : plus votre stock est récent, plus ses conseils sont justes." />

      <section aria-labelledby="etat-du-stock" className={cn("flex items-start gap-4 rounded-2xl border p-5 sm:p-6", look.box)}>
        <look.Icon className={cn("mt-1 size-8 shrink-0", look.icon)} aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <h2 id="etat-du-stock" className="text-[22px] leading-8 font-semibold tracking-[-0.01em] text-text-primary sm:text-[26px] sm:leading-9">
            {state.title}
          </h2>
          <p className="text-[15px] leading-6 text-text-secondary">{state.detail}</p>
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
          Renvoyez votre fichier : depuis le dossier PharmaBoost, ou avec le bouton d&apos;envoi plus bas sur cette page.
        </Alert>
      )}

      <section className="space-y-3">
        <SectionHeader title="En 3 étapes" />
        <ol className="space-y-3">
          <StepCard number={1} title={`Sortez votre stock de ${guide.name}`}>
            <ul className="space-y-1 text-[14.5px] leading-6 text-text-primary">
              {guide.menuSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
            <p className="text-[14.5px] leading-6 font-medium text-text-primary">
              Prenez tout votre stock, pas seulement les nouveautés. {ZERO_ABSENT_NOTICE}
            </p>
            {guide.notice && <p className="text-[13px] leading-5 text-text-secondary">{guide.notice}</p>}
          </StepCard>

          <StepCard number={2} title="Enregistrez le fichier dans le dossier PharmaBoost">
            {folderReady ? (
              <>
                <p className="text-[14px] leading-6 text-text-secondary">{FOLDER_LOCATION_NOTICE}</p>
                <CopyPath path={sharedFolderPath(connection?.hostname)} />
                <p className="text-[14px] leading-6 text-text-secondary">{FOLDER_SHORTCUT_NOTICE}</p>
                <p className="text-[14px] leading-6 text-text-secondary">{FOLDER_FALLBACK_NOTICE}</p>
                {guide.saveHint && <p className="text-[14px] leading-6 text-text-primary">{guide.saveHint} Le nom du fichier n&apos;a pas d&apos;importance.</p>}
                {unreachable && (
                  <Alert tone="warning">
                    Le dossier PharmaBoost ne répond plus (dernier signe : {describeAge(connection?.seenAgeSeconds ?? null)}). Votre serveur est peut-être éteint. En attendant, envoyez votre fichier plus bas sur cette page.
                  </Alert>
                )}
              </>
            ) : (
              <p className="text-[14px] leading-6 text-text-secondary">
                Ce dossier est créé sur votre serveur quand votre conseiller PharmaBoost installe PharmaBoost. Pas encore fait : envoyez plutôt votre fichier ici, juste en dessous.
              </p>
            )}
          </StepCard>

          <ReceiveStep latest={latest && { id: latest.id, status: latest.status, lines: latest.lines, message: latest.message, stalled: latest.stalled }} folderReady={folderReady} />
        </ol>
      </section>

      <DepositForm defaultOpen={!folderReady || unreachable} />

      <RecentDeposits deposits={deposits} />
    </div>
  );
}
