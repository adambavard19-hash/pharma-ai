import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Ban, CreditCard, Hourglass, Layers, ReceiptText, Wallet } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { prisma } from "@/server/db/client";
import { stripeConfigState } from "@/server/billing/stripe-client";
import {
  DEFAULT_SUBSCRIPTION_PERIOD,
  SUBSCRIPTION_FILTERS,
  countSubscriptionFilters,
  listSubscriptionRows,
  matchesQuery,
  matchesSubscriptionFilter,
  resolveSubscriptionFilter,
  subscriptionListMrrCents,
} from "@/server/services/admin/billing-admin";
import { formatEuros, formatFrenchDate, subscriptionStage } from "@/core/billing/subscription";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { KpiTile } from "@/components/admin/kpis";
import { FilterChips, PERIODS, SearchBox } from "@/components/admin/filters";
import { StatusBadge, SubscriptionStatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/feedback";
import { Table, TBody, TD, TH, THead, TR, TableWrapper } from "@/components/ui/table";
import { ContractPriceCell, DateText, RowLink, StatusWithDetail, StripeNotConfigured, readParam } from "./billing-ui";

export const metadata: Metadata = { title: "Abonnements" };

/**
 * Les abonnements de toutes les officines réelles : offre, tarif contractuel
 * (et son écart au catalogue), essai, statut, échéance, état du paiement.
 * Filtres et recherche par l'adresse, pour que chaque chiffre du cockpit se
 * vérifie d'un clic : `?filtre=nouveaux&periode=30j` et
 * `?filtre=resilies&periode=30j` reprennent les tuiles de période du cockpit.
 */
export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const params = await searchParams;
  const q = readParam(params, "q");
  const filter = resolveSubscriptionFilter(readParam(params, "filtre"));
  // La période des filtres datés (« Nouveaux », « Résiliés ») : celle du cockpit, ou aucune.
  const period = PERIODS.find((p) => p.value === readParam(params, "periode")) ?? null;
  const newPeriodLabel = (period ?? PERIODS.find((p) => p.value === DEFAULT_SUBSCRIPTION_PERIOD.value) ?? PERIODS[0]).label;
  const now = new Date();

  const [rows, activePlans] = await Promise.all([listSubscriptionRows(), prisma.plan.count({ where: { isActive: true } })]);
  const stripe = stripeConfigState();

  const searched = rows.filter((r) => matchesQuery(q, [r.pharmacyName, r.city, r.ownerName, r.ownerEmail, r.subscription?.planName]));
  const counts = countSubscriptionFilters(searched.map((r) => r.classInput), now, period);
  const visible = filter ? searched.filter((r) => matchesSubscriptionFilter(filter.key, r.classInput, now, period)) : searched;

  const allCounts = countSubscriptionFilters(rows.map((r) => r.classInput), now);
  const mrr = subscriptionListMrrCents(rows);
  const withSubscription = rows.filter((r) => r.subscription).length;

  // Les pastilles datées disent leur période : le chiffre se lit à côté de celui du cockpit.
  const chipLabel = (key: string, label: string) => (key === "nouveaux" ? `${label} sur ${newPeriodLabel}` : key === "resilies" && period ? `${label} sur ${period.label}` : label);
  const chipOptions: { value: string | null; label: string; count?: number }[] = [
    { value: null, label: "Toutes", count: searched.length },
    ...SUBSCRIPTION_FILTERS.map((f) => ({ value: f.key, label: chipLabel(f.key, f.label), count: counts[f.key] })),
  ];
  // Une ancienne adresse (« contrats-envoyes »…) reste lisible : sa pastille s'ajoute, active.
  if (filter?.legacy) chipOptions.push({ value: filter.key, label: `${filter.label} (ancienne vue)` });
  const dated = filter?.key === "nouveaux" || filter?.key === "resilies";
  const periodOptions =
    filter?.key === "resilies"
      ? [{ value: null, label: "Abonnements terminés" }, ...PERIODS.map((p) => ({ value: p.value, label: `Départs sur ${p.label}` }))]
      : PERIODS.map((p) => ({ value: p.value, label: p.label }));
  const periodCurrent = filter?.key === "nouveaux" ? (period ?? DEFAULT_SUBSCRIPTION_PERIOD).value : (period?.value ?? null);
  const periodHint =
    filter?.key === "nouveaux"
      ? `Abonnements créés sur ${newPeriodLabel}, aujourd'hui compris — la règle de la tuile « Nouveaux abonnements » du cockpit.`
      : filter?.key === "resilies" && period
        ? `Départs sur ${period.label} : fin chez Stripe ou demande de résiliation confirmée, une fois par officine, à la première des deux dates — la règle de la tuile « Résiliations » du cockpit.`
        : "Abonnements résiliés ou expirés, quelle que soit la date. Choisissez une période pour retrouver les départs comptés au cockpit.";

  return (
    <div className="space-y-6">
      <AdminPageHeader
        space={{ label: "Facturation", href: "/admin/abonnements" }}
        title="Abonnements"
        description="Chaque officine, son offre et son tarif contractuel, l'essai, l'échéance et l'état du paiement. Le catalogue ne change jamais un abonnement en cours."
        actions={
          <>
            <Button asChild variant="outline" size="sm" leadingIcon={<Layers className="size-4" />}>
              <Link href="/admin/abonnements/offres">Offres & tarifs</Link>
            </Button>
            <Button asChild variant="outline" size="sm" leadingIcon={<ReceiptText className="size-4" />}>
              <Link href="/admin/paiements">Paiements</Link>
            </Button>
            <Button asChild variant="outline" size="sm" leadingIcon={<Ban className="size-4" />}>
              <Link href="/admin/resiliations">Résiliations</Link>
            </Button>
          </>
        }
      />

      {!stripe.configured && <StripeNotConfigured detail={stripe.detail}>Les abonnements affichés sont ceux connus en base ; la relecture chez Stripe, la résiliation programmée et le lien d&apos;activation sont indisponibles.</StripeNotConfigured>}
      {activePlans === 0 && (
        <Alert tone="info" title="Aucune offre active">
          Créez l&apos;offre PharmaBoost (prix mensuel, durée d&apos;essai) dans{" "}
          <Link href="/admin/abonnements/offres" className="font-medium underline">
            Offres & tarifs
          </Link>{" "}
          avant de préparer un contrat.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiTile label="MRR contractuel" value={formatEuros(mrr)} hint="Actifs et en retard, hors fin programmée — tarifs contractuels HT" icon={<Wallet className="size-4" />} tone="brand" />
        <KpiTile label="Abonnements actifs" value={allCounts.actifs} hint={`${withSubscription} abonnement${withSubscription > 1 ? "s" : ""} au total`} href="/admin/abonnements?filtre=actifs" icon={<CreditCard className="size-4" />} />
        <KpiTile label="En essai" value={allCounts.essai} hint={allCounts["fin-essai"] > 0 ? `${allCounts["fin-essai"]} se termine${allCounts["fin-essai"] > 1 ? "nt" : ""} sous 7 jours` : "Aucune fin d'essai sous 7 jours"} href="/admin/abonnements?filtre=essai" icon={<Hourglass className="size-4" />} tone={allCounts["fin-essai"] > 0 ? "info" : "default"} />
        <KpiTile label="En retard de paiement" value={allCounts.retard} hint="Échec non régularisé ou impayé" href="/admin/impayes" icon={<AlertTriangle className="size-4" />} tone={allCounts.retard > 0 ? "danger" : "default"} />
        <KpiTile label="Résiliation demandée" value={allCounts.resiliation} hint="Demande ouverte ou fin programmée" href="/admin/abonnements?filtre=resiliation" icon={<Ban className="size-4" />} tone={allCounts.resiliation > 0 ? "warning" : "default"} />
      </div>

      <AdminSection padded={false}>
        <div className="flex flex-col gap-3 border-b border-border-subtle p-4 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips basePath="/admin/abonnements" param="filtre" options={chipOptions} current={filter?.key ?? null} keep={{ q, periode: period?.value ?? null }} label="Filtrer les abonnements" />
          <SearchBox action="/admin/abonnements" defaultValue={q} placeholder="Officine, ville, titulaire, offre…" keep={{ filtre: filter?.key ?? null, periode: period?.value ?? null }} />
        </div>
        {dated && filter && (
          <div className="flex flex-col gap-2 border-b border-border-subtle px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <FilterChips basePath="/admin/abonnements" param="periode" options={periodOptions} current={periodCurrent} keep={{ q, filtre: filter.key }} label="Période" />
            <p className="text-[12px] text-text-tertiary lg:max-w-[52%] lg:text-right">{periodHint}</p>
          </div>
        )}

        {visible.length === 0 ? (
          rows.length === 0 ? (
            <EmptyState
              icon={<CreditCard className="size-6" />}
              title="Aucune officine cliente pour l'instant"
              description="Les abonnements apparaissent ici dès qu'une officine est créée puis abonnée."
              action={
                <Button asChild size="sm">
                  <Link href="/admin/pharmacies?nouveau=officine">Créer une officine</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState icon={<CreditCard className="size-6" />} title="Aucun abonnement ne correspond" description={q ? `Aucun résultat pour « ${q} »${filter ? ` dans « ${filter.label} »` : ""}.` : "Aucune officine dans ce filtre pour l'instant."} action={<Button asChild size="sm" variant="outline"><Link href="/admin/abonnements">Tout afficher</Link></Button>} />
          )
        ) : (
          <TableWrapper className="rounded-none border-0">
            <Table>
              <THead>
                <TR>
                  <TH>Officine</TH>
                  <TH>Offre</TH>
                  <TH>Tarif contractuel</TH>
                  <TH>Début</TH>
                  <TH>Fin d&apos;essai</TH>
                  <TH>Statut</TH>
                  <TH>Prochaine échéance</TH>
                  <TH>Paiement</TH>
                  <TH className="w-10"><span className="sr-only">Ouvrir</span></TH>
                </TR>
              </THead>
              <TBody>
                {visible.map((row) => {
                  const sub = row.subscription;
                  const stage = sub ? null : subscriptionStage({ status: null, inviteSentAt: row.classInput.inviteSentAt && !row.classInput.inviteCompletedAt ? row.classInput.inviteSentAt : null, suspendedAt: null });
                  return (
                    <TR key={row.pharmacyId} interactive>
                      <TD>
                        <RowLink href={`/admin/abonnements/${row.pharmacyId}`}>{row.pharmacyName}</RowLink>
                        <p className="text-[12px] text-text-tertiary">{[row.city, row.ownerName].filter(Boolean).join(" · ") || "—"}</p>
                      </TD>
                      <TD>{sub ? sub.planName : <span className="text-text-tertiary">—</span>}</TD>
                      <TD>{sub ? <ContractPriceCell cents={sub.price.cents} source={sub.price.source} catalogCents={sub.catalogCents} differs={sub.differs} /> : <span className="text-text-tertiary">—</span>}</TD>
                      <TD><DateText date={sub?.startedAt} /></TD>
                      <TD><DateText date={sub?.trialEndsAt} /></TD>
                      <TD>
                        <div className="flex flex-wrap items-center gap-1">
                          {sub ? <SubscriptionStatusBadge status={sub.status} /> : stage && <StatusBadge status={stage} />}
                          {sub?.cancelAtPeriodEnd && <Badge tone="warning">Fin programmée</Badge>}
                          {row.openCancellation && <Badge tone="warning">Résiliation demandée</Badge>}
                          {filter?.key === "resilies" && period && row.classInput.departureAt && <Badge tone="neutral">Départ le {formatFrenchDate(row.classInput.departureAt)}</Badge>}
                          {!row.isActive && sub?.status !== "SUSPENDED" && <Badge tone="danger">Accès suspendu</Badge>}
                        </div>
                      </TD>
                      <TD><DateText date={sub?.nextInvoiceAt} /></TD>
                      <TD>{sub ? <StatusWithDetail status={row.payment} detail={row.payment.detail} /> : <span className="text-text-tertiary">—</span>}</TD>
                      <TD>
                        <Link href={`/admin/abonnements/${row.pharmacyId}`} className="flex size-8 items-center justify-center rounded-md text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text-primary" aria-label={`Ouvrir l'abonnement de ${row.pharmacyName}`}>
                          <ArrowRight className="size-4" aria-hidden="true" />
                        </Link>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>
        )}
        {visible.length > 0 && (
          <p className="border-t border-border-subtle px-4 py-2.5 text-[12px] text-text-tertiary">
            {visible.length} officine{visible.length > 1 ? "s" : ""} affichée{visible.length > 1 ? "s" : ""}. Hors officines de démonstration.
          </p>
        )}
      </AdminSection>
    </div>
  );
}
