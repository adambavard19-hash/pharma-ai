import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Database, Package } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getChallengeDetail, listStockBrands } from "@/server/services/challenges";
import { listChallengeDataSources, challengeSourcesLine } from "@/server/services/challenge-sources";
import { universeLabel } from "@/config/universes";
import { COUNT_MODE_LABELS } from "@/core/challenges/progress";
import { REWARD_MODE_LABELS } from "@/core/challenges/terms";
import { CHALLENGE_SOURCE_STATUS_LABELS } from "@/core/challenges/sources";
import { PageHeader } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCents } from "@/lib/format";
import { SettingsTabs } from "../../../settings-tabs";
import { LabTabs } from "../../lab-tabs";
import { ChallengeMeter, RewardFigures, StatusBadge, TierList, coverageLabel, formatDay, formatPeriod, timingLabel, unitsWord } from "../challenge-display";
import { DetailActions } from "./detail-actions";
import { EntriesManager } from "./entries-manager";

export const metadata: Metadata = { title: "Challenge laboratoire" };

/**
 * Le détail d'un challenge : où l'on en est, d'où viennent les unités
 * (ventes enregistrées par produit, saisies manuelles), et la source des
 * chiffres dite telle qu'elle est — Opeaz n'est pas connecté.
 */
export default async function ChallengeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requirePermission(PERMISSIONS.LAB_PROGRAMS_MANAGE);
  const [detail, brands] = await Promise.all([getChallengeDetail(session.scope, id), listStockBrands(session.scope)]);
  if (!detail) notFound();

  const { challenge, entries, salesByProduct, today } = detail;
  const { progress } = challenge;
  const sources = listChallengeDataSources();

  return (
    <div className="space-y-6">
      <PageHeader title="Paramètres" description="Officine, équipe, règles de conseil, moteur et conformité — tout ce qui se règle une fois, pas à chaque patient." />
      <SettingsTabs canSeeTeam={session.permissions.has(PERMISSIONS.TEAM_VIEW)} canSeeRules={session.permissions.has(PERMISSIONS.RECOMMENDATION_RULES_MANAGE)} canSeePrograms canSeeAudit={session.permissions.has(PERMISSIONS.AUDIT_VIEW)} />
      <LabTabs canManagePrograms canManageBrands={session.permissions.has(PERMISSIONS.RECOMMENDATION_RULES_MANAGE)} />

      <div className="space-y-3">
        <Link href="/parametres/laboratoires/challenges" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary">
          <ArrowLeft className="size-3.5" />
          Tous les challenges
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-[11.5px] font-semibold tracking-[0.06em] text-text-tertiary uppercase">
              {challenge.laboratory}
              {challenge.universe ? ` · ${universeLabel(challenge.universe)}` : ""}
            </p>
            <h2 className="text-[19px] leading-6 font-semibold tracking-[-0.01em] text-text-primary">{challenge.title}</h2>
            <p className="flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
              <StatusBadge status={progress.effectiveStatus} />
              <span>
                {formatPeriod(challenge.startsOn, challenge.endsOn)} · {timingLabel(progress)}
              </span>
            </p>
          </div>
          <DetailActions challenge={challenge} brands={brands} today={today} />
        </div>
      </div>

      {challenge.coveredProducts === 0 && (
        <Alert tone="warning" title="Aucune référence de votre stock n'est couverte">
          {challenge.productIds.length > 0
            ? "Les produits choisis ne figurent plus dans votre stock. Modifiez le challenge pour en choisir d'autres."
            : `Aucun produit de votre stock ne porte la marque « ${challenge.brandLabel ?? challenge.laboratory} ». Aucune vente ne peut être comptée : vérifiez la marque, ou choisissez les produits un par un.`}
        </Alert>
      )}
      {progress.ignoredManualUnits !== 0 && (
        <Alert tone="warning" title="Des saisies sont hors de la période">
          Des saisies manuelles ({progress.ignoredManualUnits} {unitsWord(progress.ignoredManualUnits)}) sont datées hors des dates actuelles du challenge : elles ne sont pas comptées. Retirez-les ou corrigez les dates du challenge.
        </Alert>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Progression" description={COUNT_MODE_LABELS[challenge.countMode]} />
            <CardContent className="space-y-4">
              <ChallengeMeter progress={progress} />

              <dl className="grid grid-cols-2 gap-3 rounded-lg bg-surface-sunken px-3.5 py-3 sm:grid-cols-3">
                <div>
                  <dt className="text-[11.5px] font-medium tracking-wide text-text-tertiary uppercase">Ventes comptées</dt>
                  <dd className="text-[15px] font-semibold tabular text-text-primary">{progress.salesUnits}</dd>
                  <dd className="text-[11.5px] text-text-tertiary">
                    {challenge.countMode === "ATTRIBUTED"
                      ? `sur ${progress.allSalesUnits} enregistrée${progress.allSalesUnits > 1 ? "s" : ""}`
                      : `dont ${progress.attributedSalesUnits} issue${progress.attributedSalesUnits > 1 ? "s" : ""} d'un conseil`}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium tracking-wide text-text-tertiary uppercase">Saisies manuelles</dt>
                  <dd className="text-[15px] font-semibold tabular text-text-primary">{progress.manualUnits}</dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium tracking-wide text-text-tertiary uppercase">Part des ventes</dt>
                  <dd className="text-[15px] font-semibold tabular text-text-primary">
                    {progress.salesShare === null ? "—" : `${Math.round(progress.salesShare * 100)} %`}
                  </dd>
                </div>
              </dl>

              {progress.projectedUnits !== null && (
                <p className="text-[12.5px] text-text-secondary">
                  Au rythme observé depuis le début ({progress.daysElapsed} jours sur {progress.daysTotal}), environ{" "}
                  <span className="font-medium tabular text-text-primary">{progress.projectedUnits}</span> {unitsWord(progress.projectedUnits)} en fin de challenge. Une indication, pas une promesse.
                </p>
              )}

              <div className="border-t border-border-subtle pt-4">
                <RewardFigures progress={progress} />
              </div>
              {challenge.rewardMode === "TIERS" && <TierList tiers={challenge.tiers} units={progress.units} />}
            </CardContent>
          </Card>

          <section className="space-y-2.5">
            <div className="space-y-0.5">
              <h3 className="text-[15px] font-semibold text-text-primary">Ventes par produit</h3>
              <p className="text-[12.5px] text-text-secondary">
                {coverageLabel(challenge)} · ventes enregistrées du {formatDay(challenge.startsOn)} au {formatDay(challenge.endsOn)} inclus.
              </p>
            </div>
            {salesByProduct.length === 0 ? (
              <Card>
                <EmptyState
                  icon={<Package className="size-5" />}
                  title="Aucune vente enregistrée sur la période"
                  description={
                    progress.effectiveStatus === "UPCOMING"
                      ? "Le challenge n'a pas commencé. Les ventes compteront dès son premier jour."
                      : "Dès qu'un produit concerné est vendu et enregistré dans PharmaBoost, il apparaît ici."
                  }
                />
              </Card>
            ) : (
              <TableWrapper>
                <Table>
                  <THead>
                    <TR>
                      <TH>Produit</TH>
                      <TH numeric>Vendues</TH>
                      <TH numeric>Dont conseil</TH>
                      <TH numeric>Comptées</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {salesByProduct.map((row) => (
                      <TR key={row.key}>
                        <TD className="max-w-[340px]">
                          <span className="block truncate text-[13.5px] font-medium text-text-primary">{row.name}</span>
                          {row.brand && <span className="block text-[12px] text-text-tertiary">{row.brand}</span>}
                        </TD>
                        <TD numeric>{row.units}</TD>
                        <TD numeric>{row.attributedUnits}</TD>
                        <TD numeric className="font-semibold">
                          {row.counted}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </TableWrapper>
            )}
          </section>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Saisies manuelles" description="Ventes hors PharmaBoost ou relevé du laboratoire." />
            <CardContent>
              <EntriesManager
                challengeId={challenge.id}
                entries={entries}
                startsOn={challenge.startsOn}
                endsOn={challenge.endsOn}
                today={today}
                locked={challenge.status === "ARCHIVED"}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Conditions" />
            <CardContent>
              <dl className="space-y-3 text-[13px]">
                <div>
                  <dt className="text-[11.5px] font-medium tracking-wide text-text-tertiary uppercase">Produits</dt>
                  <dd className="text-text-primary">{coverageLabel(challenge)}</dd>
                  {challenge.selectedProducts.length > 0 && (
                    <dd className="mt-1">
                      <ul className="space-y-0.5 text-[12.5px] text-text-secondary">
                        {challenge.selectedProducts.map((product) => (
                          <li key={product.id} className="truncate">
                            {product.name}
                            {product.isActive ? "" : " · inactif"}
                          </li>
                        ))}
                      </ul>
                    </dd>
                  )}
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium tracking-wide text-text-tertiary uppercase">Objectif</dt>
                  <dd className="text-text-primary">
                    {challenge.targetUnits !== null ? `${challenge.targetUnits} ${unitsWord(challenge.targetUnits)}` : "Aucun objectif chiffré"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium tracking-wide text-text-tertiary uppercase">Rémunération</dt>
                  <dd className="text-text-primary">
                    {challenge.rewardMode === "PER_UNIT" && challenge.bonusPerUnitCents !== null
                      ? `${formatCents(challenge.bonusPerUnitCents)} par unité`
                      : challenge.rewardMode === "TIERS"
                        ? `${challenge.tiers.length} palier${challenge.tiers.length > 1 ? "s" : ""}`
                        : REWARD_MODE_LABELS.NONE}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium tracking-wide text-text-tertiary uppercase">Ce qui compte</dt>
                  <dd className="text-text-primary">{COUNT_MODE_LABELS[challenge.countMode]}, plus les saisies manuelles</dd>
                </div>
                {challenge.notes && (
                  <div>
                    <dt className="text-[11.5px] font-medium tracking-wide text-text-tertiary uppercase">Notes</dt>
                    <dd className="whitespace-pre-line text-text-secondary">{challenge.notes}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Source des données" description={challengeSourcesLine()} />
            <CardContent>
              <ul className="space-y-3">
                {sources.map((source) => (
                  <li key={source.key} className="flex gap-2.5">
                    <Database className="mt-0.5 size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                    <span className="min-w-0 space-y-1">
                      <span className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-text-primary">
                        {source.label}
                        <Badge tone={source.status === "available" ? "success" : "neutral"}>{CHALLENGE_SOURCE_STATUS_LABELS[source.status]}</Badge>
                      </span>
                      <span className="block text-[12.5px] leading-5 text-text-secondary">{source.description}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      <p className="text-[12.5px] leading-5 text-text-tertiary">
        Ce challenge n&apos;est jamais affiché au comptoir et n&apos;entre pas dans le choix des conseils : un conseil reste choisi pour le patient, pas pour un objectif.
      </p>
    </div>
  );
}
