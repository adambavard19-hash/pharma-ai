import type { Metadata } from "next";
import { ShieldOff, Store, Trophy } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listChallengesForPlatform, type PlatformChallengeRow } from "@/server/services/challenges";
import { challengeSourcesLine } from "@/server/services/challenge-sources";
import { EFFECTIVE_STATUS_ORDER, progressPercent, sumRewards } from "@/core/challenges/progress";
import { Grid } from "@/components/ui/page";
import { AdminPageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState, Progress } from "@/components/ui/feedback";
import { StatCard } from "@/components/ui/stat-card";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCents, formatNumber } from "@/lib/format";
import { universeLabel } from "@/config/universes";
import { StatusBadge, formatPeriod, unitsWord } from "@/app/(app)/parametres/laboratoires/challenges/challenge-display";

export const metadata: Metadata = { title: "Challenges laboratoires" };

/**
 * Les challenges laboratoires de toutes les officines clientes.
 *
 * Des agrégats seulement : officine, laboratoire, période, unités, objectif,
 * montants. Ni ligne de vente, ni collaborateur, ni donnée patient — la
 * console administre des clients, pas leur activité au comptoir.
 */
export default async function AdminChallengesPage() {
  await requirePlatformSession();
  const rows = await listChallengesForPlatform();

  const order = (row: PlatformChallengeRow) => EFFECTIVE_STATUS_ORDER.indexOf(row.effectiveStatus);
  const sorted = [...rows].sort((a, b) => order(a) - order(b) || a.endsOn.localeCompare(b.endsOn) || a.pharmacyName.localeCompare(b.pharmacyName, "fr"));
  // Les chiffres clés ne portent que sur les vraies officines : une officine de
  // démonstration reste listée (avec son badge), jamais additionnée.
  const real = rows.filter((row) => !row.pharmacyIsDemo);
  const demoCount = rows.length - real.length;
  const running = real.filter((row) => row.effectiveStatus === "RUNNING");
  const ended = real.filter((row) => row.effectiveStatus === "ENDED");
  const pharmacies = new Set(running.map((row) => row.pharmacyId)).size;
  const runningTotals = sumRewards(running);
  const endedTotals = sumRewards(ended);

  return (
    <>
      <AdminPageHeader
        space={{ label: "Administration", href: "/admin/societe" }}
        title="Challenges laboratoires"
        description="Les challenges saisis par les officines clientes, et où ils en sont. Chaque officine les gère elle-même dans ses Paramètres."
      />

      <Alert tone="info" title="Agrégats uniquement" icon={<ShieldOff className="size-[18px]" />}>
        Unités, objectifs et montants par challenge. Aucune vente détaillée, aucun collaborateur, aucune donnée patient. Source : {challengeSourcesLine()}.
      </Alert>

      <Grid cols={4}>
        <StatCard label="Challenges en cours" value={formatNumber(running.length)} sublabel={`${real.length} au total`} icon={<Trophy className="size-4" />} />
        <StatCard label="Officines engagées" value={formatNumber(pharmacies)} sublabel="avec un challenge en cours" icon={<Store className="size-4" />} />
        <StatCard
          label="Primes réalisées"
          value={formatCents(runningTotals.earnedCents)}
          sublabel={runningTotals.potentialCents !== null && runningTotals.potentialCents > 0 ? `sur ${formatCents(runningTotals.potentialCents)} potentiels · en cours` : "challenges en cours"}
          emphasis="accent"
        />
        <StatCard label="Primes des challenges terminés" value={formatCents(endedTotals.earnedCents)} sublabel={`${ended.length} challenge${ended.length > 1 ? "s" : ""} terminé${ended.length > 1 ? "s" : ""}`} />
      </Grid>
      {demoCount > 0 && (
        <p className="text-[12px] text-text-tertiary">
          {demoCount} challenge{demoCount > 1 ? "s" : ""} d&apos;officine{demoCount > 1 ? "s" : ""} de démonstration : listé{demoCount > 1 ? "s" : ""} ci-dessous, hors chiffres clés.
        </p>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Trophy className="size-5" />}
            title="Aucun challenge saisi"
            description="Les officines saisissent leurs challenges dans Paramètres › Laboratoires & gammes › Challenges. Ils apparaîtront ici, en agrégats."
          />
        </Card>
      ) : (
        <>
          <ul className="space-y-2.5 md:hidden">
            {sorted.map((row) => {
              const percent = progressPercent(row);
              return (
                <li key={row.id} className="space-y-2 rounded-xl border border-border-subtle bg-surface-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-medium text-text-primary">
                        <span className="truncate">{row.pharmacyName}</span>
                        {row.pharmacyIsDemo && <Badge tone="neutral">Démo</Badge>}
                      </p>
                      <p className="truncate text-[12px] text-text-tertiary">
                        {row.laboratory} · {row.title}
                      </p>
                    </div>
                    <StatusBadge status={row.effectiveStatus} />
                  </div>
                  <p className="text-[12px] text-text-tertiary">{formatPeriod(row.startsOn, row.endsOn)}</p>
                  <p className="text-[13px] text-text-primary tabular">
                    {row.units}
                    {row.target !== null ? ` / ${row.target}` : ""} {unitsWord(row.target ?? row.units)}
                    {percent !== null ? ` · ${percent} %` : ""}
                  </p>
                  {row.ratio !== null && <Progress value={Math.min(1, row.ratio)} tone={row.ratio >= 1 ? "success" : "brand"} label="Progression" />}
                  <p className="text-[12.5px] text-text-secondary">
                    {row.rewardMode === "NONE" ? "Sans prime" : `${formatCents(row.earnedCents ?? 0)} réalisés${row.potentialCents !== null ? ` · ${formatCents(row.potentialCents)} potentiels` : ""}`}
                  </p>
                </li>
              );
            })}
          </ul>

          <TableWrapper className="hidden md:block">
            <Table>
              <THead>
                <TR>
                  <TH>Officine</TH>
                  <TH>Laboratoire · challenge</TH>
                  <TH>Période</TH>
                  <TH>Statut</TH>
                  <TH numeric>Unités / objectif</TH>
                  <TH numeric>%</TH>
                  <TH numeric>Réalisé</TH>
                  <TH numeric>Potentiel</TH>
                </TR>
              </THead>
              <TBody>
                {sorted.map((row) => {
                  const percent = progressPercent(row);
                  return (
                    <TR key={row.id}>
                      <TD>
                        <span className="block text-[13px] font-medium text-text-primary">{row.pharmacyName}</span>
                        <span className="flex items-center gap-1.5 text-[12px] text-text-tertiary">
                          {row.pharmacyCity ?? "—"}
                          {row.pharmacyIsDemo && <Badge tone="neutral">Démo</Badge>}
                        </span>
                      </TD>
                      <TD className="max-w-[280px]">
                        <span className="block truncate text-[13px] text-text-primary">{row.laboratory}</span>
                        <span className="block truncate text-[12px] text-text-tertiary">
                          {row.title}
                          {row.universe ? ` · ${universeLabel(row.universe)}` : ""}
                        </span>
                      </TD>
                      <TD className="text-[12.5px] whitespace-nowrap text-text-secondary">{formatPeriod(row.startsOn, row.endsOn)}</TD>
                      <TD>
                        <StatusBadge status={row.effectiveStatus} />
                      </TD>
                      <TD numeric>
                        {row.units}
                        <span className="text-text-tertiary">{row.target !== null ? ` / ${row.target}${row.targetIsImplicit ? "*" : ""}` : " / —"}</span>
                      </TD>
                      <TD numeric className="font-medium">
                        {percent === null ? "—" : `${percent} %`}
                      </TD>
                      <TD numeric className="font-semibold">
                        {row.rewardMode === "NONE" ? "—" : formatCents(row.earnedCents ?? 0)}
                      </TD>
                      <TD numeric className="text-text-secondary">
                        {row.potentialCents === null ? "—" : formatCents(row.potentialCents)}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>
          <p className="text-[12px] text-text-tertiary">
            * objectif déduit du dernier palier. Les montants sont ceux saisis par l&apos;officine ; PharmaBoost ne les vérifie pas auprès des laboratoires.
          </p>
        </>
      )}
    </>
  );
}
