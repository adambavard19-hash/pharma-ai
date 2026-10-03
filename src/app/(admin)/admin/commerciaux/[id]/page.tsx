import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Building2, CalendarCheck2, Euro, FileSignature, FolderOpen, Repeat, Send, Timer, Wallet } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { prisma } from "@/server/db/client";
import { COMMERCIAL_PERIODS, repMetrics, repPortfolio, resolveCommercialPeriod } from "@/server/services/admin/commercial";
import { describeCommissionRule } from "@/core/sales/commission";
import { PROSPECT_STATUSES, PROSPECT_STATUS_LABELS } from "@/core/sales/pipeline";
import { contractualPrice } from "@/core/billing/contract-price";
import { formatEuros } from "@/core/billing/subscription";
import { isOverdue, trialDaysLeft } from "@/core/sales/board";
import type { TimelineEntry, TimelineKind } from "@/core/admin/timeline";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { KpiTile } from "@/components/admin/kpis";
import { FilterChips, hrefWith } from "@/components/admin/filters";
import { SubscriptionStatusBadge } from "@/components/admin/status-badge";
import { Timeline } from "@/components/admin/timeline";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CommissionStatusBadge, ContractStatusBadge, DemoBadge, TrialBadge } from "@/components/sales/status-badge";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { param } from "../../pipeline/filter-form";
import { EditSalesRepButton } from "../rep-form";
import { InviteButton } from "./invite-button";

export const metadata: Metadata = { title: "Commercial" };

const TABS = [
  { key: "dossiers", label: "Dossiers par étape" },
  { key: "clients", label: "Clients" },
  { key: "commissions", label: "Commissions" },
  { key: "activite", label: "Activité récente" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const COMMISSION_TYPE_LABELS: Record<string, string> = { FIXED: "Fixe", PERCENT: "Pourcentage", RECURRING: "Récurrente" };

/** Nature d'un événement de dossier, pour l'icône de la frise. */
function timelineKind(type: string): TimelineKind {
  if (type.startsWith("CONTRACT") || type === "SIGNED_PDF_ARCHIVED" || type === "SIGNATURE_ERROR") return "contrat";
  if (type === "NOTE") return "note";
  if (type === "EMAIL_SENT") return "email";
  if (type.startsWith("SUBSCRIPTION")) return "abonnement";
  if (type.startsWith("TASK") || type.startsWith("COMMISSION") || type === "ASSIGNED") return "commercial";
  return "dossier";
}

/**
 * Le portefeuille d'un commercial : ses résultats sur la période
 * (`?periode=`), puis ses dossiers par étape, ses clients, ses commissions et
 * l'activité récente de ses dossiers (`?onglet=`).
 */
export default async function SalesRepPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const { id } = await params;
  const query = await searchParams;
  const rep = await prisma.salesRep.findUnique({ where: { id } });
  if (!rep) notFound();
  const now = new Date();
  const period = resolveCommercialPeriod(param(query.periode));
  const tab: TabKey = TABS.find((t) => t.key === param(query.onglet))?.key ?? "dossiers";
  const [metrics, portfolio] = await Promise.all([repMetrics(rep.id, period, now), repPortfolio(rep.id)]);
  const base = `/admin/commerciaux/${rep.id}`;
  const keep = { periode: period.value === "30j" ? null : period.value, onglet: tab === "dossiers" ? null : tab };
  const periodHint = period.value === "tout" ? "depuis le début" : `sur ${period.label}`;
  const clients = portfolio.prospects.filter((p) => p.pharmacy);
  const counts: Record<TabKey, number> = { dossiers: portfolio.prospects.length, clients: clients.length, commissions: portfolio.commissions.length, activite: portfolio.events.length };

  return (
    <>
      <AdminPageHeader
        space={{ label: "Commercial", href: "/admin/pipeline" }}
        parent={{ label: "Commerciaux", href: "/admin/commerciaux" }}
        title={`${rep.firstName} ${rep.lastName}`}
        badge={<Badge tone={rep.isActive ? "success" : "neutral"}>{rep.isActive ? "Actif" : "Inactif"}</Badge>}
        description={[rep.email, rep.phone, rep.zone, describeCommissionRule({ type: rep.commissionType, value: rep.commissionValue }), rep.lastLoginAt ? `dernière connexion le ${formatDate(rep.lastLoginAt)}` : rep.invitedAt ? `invité le ${formatDate(rep.invitedAt)}, jamais connecté` : "jamais invité"].filter(Boolean).join(" · ")}
        actions={
          <>
            <InviteButton salesRepId={rep.id} invited={Boolean(rep.invitedAt)} />
            <EditSalesRepButton salesRepId={rep.id} initial={{ firstName: rep.firstName, lastName: rep.lastName, email: rep.email, phone: rep.phone ?? "", zone: rep.zone ?? "", commissionType: rep.commissionType, commissionValue: (rep.commissionValue / 100).toString().replace(".", ","), isActive: rep.isActive }} />
          </>
        }
      />

      <FilterChips basePath={base} param="periode" current={keep.periode} keep={keep} label="Période" options={COMMERCIAL_PERIODS.map((p) => ({ value: p.value === "30j" ? null : p.value, label: p.label }))} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Dossiers en cours" value={metrics.openProspects} hint={`sur ${metrics.prospects} attribués`} href={`/admin/prospects?commercial=${rep.id}`} icon={<FolderOpen className="size-4" />} />
        <KpiTile label="Démos réalisées" value={metrics.demosDone} hint={`${periodHint}${metrics.upcomingDemos ? ` · ${metrics.upcomingDemos} à venir` : ""}`} href={`/admin/demonstrations?commercial=${rep.id}`} icon={<CalendarCheck2 className="size-4" />} />
        <KpiTile label="Essais en cours" value={metrics.trials} hint="aujourd'hui" href={hrefWith(base, keep, { onglet: "clients" })} icon={<Timer className="size-4" />} />
        <KpiTile label="Contrats envoyés" value={metrics.contractsSent} hint={periodHint} icon={<Send className="size-4" />} />
        <KpiTile label="Signatures" value={metrics.signatures} hint={periodHint} tone={metrics.signatures > 0 ? "success" : "default"} icon={<FileSignature className="size-4" />} />
        <KpiTile label="Abonnements générés" value={metrics.subscriptionsCreated} hint={periodHint} icon={<Repeat className="size-4" />} />
        <KpiTile label="MRR attribué" value={formatEuros(metrics.mrrCents)} hint={`${metrics.clients} officine${metrics.clients > 1 ? "s" : ""} cliente${metrics.clients > 1 ? "s" : ""}`} tone="brand" href={hrefWith(base, keep, { onglet: "clients" })} icon={<Euro className="size-4" />} />
        <KpiTile label="Commissions acquises" value={formatEuros(metrics.commissions.earnedCents)} hint={`${formatEuros(metrics.commissions.payableCents)} à payer · ${formatEuros(metrics.commissions.paidCents)} payées`} href={hrefWith(base, keep, { onglet: "commissions" })} icon={<Wallet className="size-4" />} />
      </div>

      <nav className="flex gap-1 overflow-x-auto border-b border-border-subtle" aria-label="Portefeuille">
        {TABS.map((item) => {
          const active = item.key === tab;
          return (
            <Link
              key={item.key}
              href={hrefWith(base, keep, { onglet: item.key === "dossiers" ? null : item.key })}
              scroll={false}
              aria-current={active ? "page" : undefined}
              className={cn("-mb-px flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-[13.5px] font-medium whitespace-nowrap transition-colors", active ? "border-brand-600 text-brand-700 dark:text-brand-400" : "border-transparent text-text-secondary hover:border-border-default hover:text-text-primary")}
            >
              {item.label}
              <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] tabular-nums", active ? "bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300" : "bg-surface-sunken text-text-tertiary")}>{counts[item.key]}</span>
            </Link>
          );
        })}
      </nav>

      {tab === "dossiers" && <DossiersTab prospects={portfolio.prospects} now={now} />}

      {tab === "clients" &&
        (clients.length === 0 ? (
          <Empty icon={<Building2 className="size-5" />} title="Aucun client pour l'instant" description="Une officine apparaît ici quand son espace est créé à partir d'un dossier de ce commercial." />
        ) : (
          <TableWrapper>
            <Table>
              <THead>
                <tr>
                  <TH>Officine</TH>
                  <TH>Abonnement</TH>
                  <TH numeric>Tarif contractuel</TH>
                  <TH>Accès</TH>
                </tr>
              </THead>
              <TBody>
                {clients.map((p) => {
                  const pharmacy = p.pharmacy!;
                  const subscription = pharmacy.organization.subscription;
                  const price = subscription ? contractualPrice(subscription, subscription.plan) : null;
                  return (
                    <TR key={p.id} interactive>
                      <TD className="max-w-[280px]">
                        <Link href={`/admin/pharmacies/${pharmacy.id}`} className="block truncate font-medium text-text-primary hover:text-brand-700 hover:underline dark:hover:text-brand-400">{pharmacy.name}</Link>
                        <span className="block truncate text-[12px] text-text-tertiary">{pharmacy.city ?? "—"} · <Link href={`/admin/dossiers/${p.id}`} className="hover:underline">dossier</Link></span>
                      </TD>
                      <TD>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {subscription ? <SubscriptionStatusBadge status={subscription.status} /> : <span className="text-[13px] text-text-tertiary">Aucun abonnement</span>}
                          {subscription?.status === "TRIALING" && <TrialBadge daysLeft={trialDaysLeft(subscription.trialEndsAt, now)} />}
                          {subscription?.cancelAtPeriodEnd && <Badge tone="warning">Résiliation programmée</Badge>}
                        </div>
                        {subscription && <span className="mt-0.5 block text-[12px] text-text-tertiary">{subscription.plan.name}</span>}
                      </TD>
                      <TD numeric>
                        {price ? formatEuros(price.cents) : "—"}
                        {price?.source === "CATALOG_FALLBACK" && <span className="block text-[11.5px] text-text-tertiary">tarif catalogue</span>}
                      </TD>
                      <TD>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge tone={pharmacy.isActive ? "success" : "danger"}>{pharmacy.isActive ? "Active" : "Suspendue"}</Badge>
                          {pharmacy.isDemo && <Badge tone="neutral">Démonstration</Badge>}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>
        ))}

      {tab === "commissions" &&
        (portfolio.commissions.length === 0 ? (
          <Empty icon={<Wallet className="size-5" />} title="Aucune commission pour l'instant" description="Une commission naît à l'envoi d'un contrat (prévisionnelle) et devient acquise à sa signature." />
        ) : (
          <TableWrapper>
            <Table>
              <THead>
                <tr>
                  <TH>Dossier</TH>
                  <TH>Type</TH>
                  <TH numeric>Montant</TH>
                  <TH>Statut</TH>
                  <TH>Paiement</TH>
                </tr>
              </THead>
              <TBody>
                {portfolio.commissions.map((c) => (
                  <TR key={c.id} interactive>
                    <TD className="max-w-[260px]">
                      <Link href={`/admin/dossiers/${c.prospect.id}`} className="block truncate font-medium text-text-primary hover:text-brand-700 hover:underline dark:hover:text-brand-400">{c.prospect.name}</Link>
                      <span className="block truncate text-[12px] text-text-tertiary">créée le {formatDate(c.createdAt)}{c.note ? ` · ${c.note}` : ""}</span>
                    </TD>
                    <TD className="text-text-secondary">{COMMISSION_TYPE_LABELS[c.type] ?? c.type}</TD>
                    <TD numeric className="font-medium">{formatEuros(c.amountCents)}</TD>
                    <TD><CommissionStatusBadge status={c.status} /></TD>
                    <TD className="text-[13px] text-text-secondary">{c.paidAt ? `payée le ${formatDate(c.paidAt)}` : c.dueAt ? `prévue le ${formatDate(c.dueAt)}` : "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
        ))}

      {tab === "activite" && (
        <AdminSection title="Activité récente" description="Les derniers événements de ses dossiers, quel qu'en soit l'auteur.">
          <Timeline
            entries={portfolio.events.map((e): TimelineEntry => ({ id: `event:${e.id}`, at: e.createdAt, kind: timelineKind(e.type), title: e.summary, detail: e.prospect.name, actor: e.actorLabel, href: `/admin/dossiers/${e.prospect.id}` }))}
            emptyText="Aucune activité sur ses dossiers pour l'instant."
          />
        </AdminSection>
      )}
    </>
  );
}

type PortfolioProspect = Awaited<ReturnType<typeof repPortfolio>>["prospects"][number];

/** Les dossiers, rangés par étape dans l'ordre du pipeline ; les étapes vides sont omises. */
function DossiersTab({ prospects, now }: { prospects: PortfolioProspect[]; now: Date }) {
  if (prospects.length === 0) return <Empty icon={<FolderOpen className="size-5" />} title="Aucun dossier attribué" description="Confiez-lui un dossier depuis sa fiche (« Commercial assigné »)." />;
  const groups = PROSPECT_STATUSES.map((status) => ({ status, items: prospects.filter((p) => p.status === status) })).filter((g) => g.items.length > 0);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map((group) => (
        <AdminSection key={group.status} title={<span className="flex items-center gap-2">{PROSPECT_STATUS_LABELS[group.status]}<span className="rounded-full bg-surface-sunken px-1.5 text-[11.5px] font-medium text-text-secondary tabular-nums">{group.items.length}</span></span>} padded={false}>
          <ul className="divide-y divide-border-subtle">
            {group.items.map((p) => {
              const late = isOverdue(p.nextActionAt, now);
              return (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/dossiers/${p.id}`} className="block truncate text-[14px] font-medium text-text-primary hover:text-brand-700 hover:underline dark:hover:text-brand-400">{p.name}</Link>
                    <span className={cn("block truncate text-[12px]", late ? "font-medium text-warning-700 dark:text-warning-500" : "text-text-tertiary")}>
                      {p.city ?? "Ville non renseignée"}
                      {p.nextActionAt ? ` · ${p.nextActionLabel ?? "Relancer"} le ${formatDate(p.nextActionAt)}${late ? " (en retard)" : ""}` : ""}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <DemoBadge demoAt={p.demoAt} demoDoneAt={p.demoDoneAt} />
                    {p.contracts[0] && <ContractStatusBadge status={p.contracts[0].status} />}
                  </div>
                </li>
              );
            })}
          </ul>
        </AdminSection>
      ))}
    </div>
  );
}

function Empty({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-surface-card">
      <EmptyState icon={icon} title={title} description={description} />
    </div>
  );
}
