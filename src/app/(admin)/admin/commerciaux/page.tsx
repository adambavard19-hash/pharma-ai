import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck2, Euro, FileSignature, Repeat, Send, Timer, Users } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { COMMERCIAL_PERIODS, resolveCommercialPeriod, teamMetrics, type RepMetrics } from "@/server/services/admin/commercial";
import { describeCommissionRule } from "@/core/sales/commission";
import { formatEuros } from "@/core/billing/subscription";
import { AdminPageHeader } from "@/components/admin/page-header";
import { KpiTile } from "@/components/admin/kpis";
import { FilterChips } from "@/components/admin/filters";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { param } from "../pipeline/filter-form";
import { CreateSalesRepButton } from "./rep-form";
import { getStandardCommissionCents } from "@/server/services/standard-commission";
import { formatPriceEuros } from "@/core/pricing/official-offer";

export const metadata: Metadata = { title: "Commerciaux" };

/**
 * L'équipe commerciale et ses résultats sur une période
 * (`?periode=30j|3m|12m|tout`). Les démos réalisées (journal), contrats
 * envoyés, signatures et abonnements générés sont comptés dans la période ; les dossiers, essais en
 * cours, MRR et commissions sont l'état d'aujourd'hui. Aucun objectif : il
 * n'en existe pas en base. `?nouveau=commercial` ouvre la création d'un compte.
 */
export default async function SalesRepsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const params = await searchParams;
  const period = resolveCommercialPeriod(param(params.periode));
  const [{ reps, team, console: consoleMetrics }, standardCommissionCents] = await Promise.all([teamMetrics(period), getStandardCommissionCents()]);
  const defaultCommissionEuros = String(standardCommissionCents / 100).replace(".", ",");
  const activeCount = reps.filter((r) => r.rep.isActive).length;
  const periodHint = period.value === "tout" ? "depuis le début" : `sur ${period.label}`;

  return (
    <>
      <AdminPageHeader
        space={{ label: "Commercial", href: "/admin/pipeline" }}
        title="Commerciaux"
        description={`${activeCount} commercial${activeCount > 1 ? "aux" : ""} actif${activeCount > 1 ? "s" : ""} sur ${reps.length}. Portefeuilles, résultats et commissions. Commission standard : ${formatPriceEuros(standardCommissionCents)} par pharmacie activée (réglage dans Offres & tarifs).`}
        // La clé suit `?nouveau=` : la fenêtre s'ouvre aussi quand on est déjà sur la page, et à chaque nouvel usage.
        actions={<CreateSalesRepButton key={param(params.nouveau) ?? "aucun"} defaultOpen={param(params.nouveau) === "commercial"} defaultCommissionEuros={defaultCommissionEuros} />}
      />

      <FilterChips basePath="/admin/commerciaux" param="periode" current={period.value === "30j" ? null : period.value} label="Période" options={COMMERCIAL_PERIODS.map((p) => ({ value: p.value === "30j" ? null : p.value, label: p.label }))} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Démos réalisées" value={team.demosDone} hint={`${periodHint}${team.upcomingDemos ? ` · ${team.upcomingDemos} à venir` : ""}`} href="/admin/demonstrations" icon={<CalendarCheck2 className="size-4" />} />
        <KpiTile label="Contrats envoyés" value={team.contractsSent} hint={periodHint} href="/admin/contrats" icon={<Send className="size-4" />} />
        <KpiTile label="Signatures" value={team.signatures} hint={periodHint} href="/admin/contrats?statut=signes" tone={team.signatures > 0 ? "success" : "default"} icon={<FileSignature className="size-4" />} />
        <KpiTile label="Abonnements générés" value={team.subscriptionsCreated} hint={periodHint} href="/admin/abonnements" icon={<Repeat className="size-4" />} />
        <KpiTile label="Essais en cours" value={team.trials} hint="aujourd'hui" href="/admin/abonnements?filtre=essai" icon={<Timer className="size-4" />} />
        <KpiTile label="MRR attribué" value={formatEuros(team.mrrCents)} hint="tarifs contractuels, HT" tone="brand" icon={<Euro className="size-4" />} />
      </div>

      {reps.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface-card">
          <EmptyState icon={<Users className="size-5" />} title="Aucun commercial pour l'instant" description="Créez le premier compte : il recevra une invitation par e-mail pour définir son mot de passe." action={<CreateSalesRepButton defaultCommissionEuros={defaultCommissionEuros} />} />
        </div>
      ) : (
        <TableWrapper>
          <Table>
            <THead>
              <tr>
                <TH>Commercial</TH>
                <TH>Statut</TH>
                <TH numeric>Dossiers</TH>
                <TH numeric>Démos réalisées</TH>
                <TH numeric>Essais</TH>
                <TH numeric>Contrats</TH>
                <TH numeric>Signatures</TH>
                <TH numeric>Abonnements</TH>
                <TH numeric>MRR</TH>
                <TH numeric>Commissions</TH>
              </tr>
            </THead>
            <TBody>
              {reps.map(({ rep, metrics }) => (
                <TR key={rep.id} interactive>
                  <TD className="max-w-[260px]">
                    <Link href={`/admin/commerciaux/${rep.id}${period.value === "30j" ? "" : `?periode=${period.value}`}`} className="block truncate font-medium text-text-primary hover:text-brand-700 hover:underline dark:hover:text-brand-400">{rep.firstName} {rep.lastName}</Link>
                    <span className="block truncate text-[12px] text-text-tertiary">{[rep.zone, describeCommissionRule({ type: rep.commissionType, value: rep.commissionValue })].filter(Boolean).join(" · ")}</span>
                  </TD>
                  <TD>
                    <Badge tone={rep.isActive ? "success" : "neutral"}>{rep.isActive ? "Actif" : "Inactif"}</Badge>
                    <span className="mt-0.5 block text-[11.5px] text-text-tertiary">{rep.lastLoginAt ? `connecté le ${formatDate(rep.lastLoginAt)}` : rep.invitedAt ? `invité le ${formatDate(rep.invitedAt)}` : "jamais invité"}</span>
                  </TD>
                  <MetricCells metrics={metrics} prospectsHref={`/admin/prospects?commercial=${rep.id}`} />
                  <TD numeric className="text-[12.5px]">
                    <span className="block text-text-primary" title="Acquises">{formatEuros(metrics.commissions.earnedCents)} acquises</span>
                    <span className="block text-text-tertiary">{formatEuros(metrics.commissions.payableCents)} à payer · {formatEuros(metrics.commissions.paidCents)} payées</span>
                  </TD>
                </TR>
              ))}
              {consoleMetrics.prospects > 0 && (
                <TR className="bg-surface-sunken/40">
                  <TD>
                    <span className="font-medium text-text-secondary">Console</span>
                    <span className="block text-[12px] text-text-tertiary">Dossiers sans commercial</span>
                  </TD>
                  <TD><Badge tone="neutral">Équipe PharmaBoost</Badge></TD>
                  <MetricCells metrics={consoleMetrics} prospectsHref="/admin/prospects?commercial=console" />
                  <TD numeric className="text-[12.5px] text-text-tertiary">Sans commission</TD>
                </TR>
              )}
            </TBody>
          </Table>
        </TableWrapper>
      )}
      <p className="text-[12.5px] text-text-tertiary">
        Démos réalisées (selon le journal), contrats, signatures et abonnements : {periodHint}. Dossiers, essais, MRR et commissions : situation actuelle. Le MRR additionne les tarifs contractuels des abonnements payants des officines issues des dossiers, hors démonstration et résiliation programmée.
      </p>
    </>
  );
}

function MetricCells({ metrics, prospectsHref }: { metrics: RepMetrics; prospectsHref: string }) {
  return (
    <>
      <TD numeric>
        <Link href={prospectsHref} className="hover:text-brand-700 hover:underline">{metrics.openProspects}</Link>
        <span className="block text-[11.5px] text-text-tertiary">sur {metrics.prospects}</span>
      </TD>
      <TD numeric>{metrics.demosDone}{metrics.upcomingDemos > 0 && <span className="block text-[11.5px] text-text-tertiary">+{metrics.upcomingDemos} à venir</span>}</TD>
      <TD numeric>{metrics.trials}</TD>
      <TD numeric>{metrics.contractsSent}</TD>
      <TD numeric>{metrics.signatures}</TD>
      <TD numeric>{metrics.subscriptionsCreated}</TD>
      <TD numeric className="font-medium">{formatEuros(metrics.mrrCents)}</TD>
    </>
  );
}
