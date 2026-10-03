import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Cable, Clock3, FlaskConical, SearchX } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listClientPharmacies, type ClientPharmacyRow } from "@/server/services/admin/clients";
import { AdminPageHeader } from "@/components/admin/page-header";
import { KpiTile } from "@/components/admin/kpis";
import { FilterChips, SearchBox, hrefWith } from "@/components/admin/filters";
import { StatusBadge, SubscriptionStatusBadge } from "@/components/admin/status-badge";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { lgoLabel } from "@/core/stock/connectors";
import { formatEuros, formatFrenchDate } from "@/core/billing/subscription";
import { onboardingStage } from "@/core/onboarding/stage";
import { missingContractFields } from "@/core/contracts/requirements";
import { PHARMACY_STATUS_FILTERS, PHARMACY_STATUS_FILTER_LABELS, parsePharmacySort, parsePharmacyStatusFilter, pharmacyStatusLabel, searchParam } from "@/core/admin/clients";
import { CreatePharmacyButton } from "./pharmacy-form";
import { When } from "./client-ui";

export const metadata: Metadata = { title: "Officines clientes" };

/**
 * Les officines clientes : qui, quel abonnement, quel connecteur, quand
 * l'équipe s'est connectée pour la dernière fois. Des faits de compte et
 * d'installation uniquement — aucun compteur clinique, aucune donnée médicale.
 */
export default async function ClientPharmaciesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const params = await searchParams;
  const q = searchParam(params, "q");
  const statut = parsePharmacyStatusFilter(searchParam(params, "statut"));
  const tri = parsePharmacySort(searchParam(params, "tri"));
  const keep = { q, statut, tri: tri === "recent" ? null : tri };
  const now = new Date();

  // Les officines invitées qui n'ont pas encore d'espace : visibles dès l'invitation.
  const [enrolling, list] = await Promise.all([
    prisma.prospect.findMany({
      where: { pharmacyId: null, status: { not: "LOST" }, invitations: { some: {} } },
      orderBy: { updatedAt: "desc" },
      take: 30,
      include: {
        invitations: { orderBy: { createdAt: "desc" }, take: 1 },
        contracts: { orderBy: { version: "desc" }, take: 1, select: { status: true, signedArchivedAt: true } },
      },
    }),
    listClientPharmacies({ q, statut, tri, now }),
  ]);
  const { rows } = list;

  return (
    <>
      <AdminPageHeader
        space={{ label: "Clients", href: "/admin/pharmacies" }}
        title="Officines clientes"
        description="Créer un environnement, retrouver un titulaire, ouvrir la fiche 360° d'une officine."
        actions={<CreatePharmacyButton openFromAddress />}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Officines actives" value={list.allCounts.actives} hint={`${list.total} officine${list.total > 1 ? "s" : ""} au total, démonstrations comprises`} href="/admin/pharmacies?statut=actives" icon={<Building2 className="size-4" />} />
        <KpiTile label="En essai gratuit" value={list.allCounts.essai} hint="Abonnements en période d'essai" href="/admin/pharmacies?statut=essai" tone={list.allCounts.essai > 0 ? "info" : "default"} icon={<FlaskConical className="size-4" />} />
        <KpiTile label="Inactives depuis 14 jours" value={list.inactive} hint="Aucune connexion de l'équipe" href="/admin/activite?filtre=inactives" tone={list.inactive > 0 ? "warning" : "default"} icon={<Clock3 className="size-4" />} />
        <KpiTile label="Connecteurs à vérifier" value={list.connectorsToCheck} hint="En erreur, hors ligne ou en retard" href="/admin/technique?filtre=erreurs" tone={list.connectorsToCheck > 0 ? "danger" : "default"} icon={<Cable className="size-4" />} />
      </div>

      {enrolling.length > 0 && (
        <Card>
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <p className="text-[14px] font-semibold text-text-primary">Inscriptions en cours</p>
            <p className="text-[12px] text-text-tertiary">
              {enrolling.length} officine{enrolling.length > 1 ? "s" : ""} invitée{enrolling.length > 1 ? "s" : ""}
            </p>
          </div>
          <ul className="divide-y divide-border-subtle">
            {enrolling.map((p) => {
              const missing = missingContractFields(p);
              const stage = onboardingStage({ prospectStatus: p.status, contract: p.contracts[0] ?? null, invitation: p.invitations[0] ?? null, missingCount: missing.length });
              return (
                <li key={p.id}>
                  <Link href={`/admin/dossiers/${p.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-surface-sunken">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-medium text-text-primary">{p.name}</span>
                      <span className="block truncate text-[12px] text-text-tertiary">
                        {p.email}
                        {p.postCount ? ` · ${p.postCount} poste${p.postCount > 1 ? "s" : ""}` : ""}
                        {p.siret ? ` · SIRET ${p.siret}` : ""}
                      </span>
                    </span>
                    <Badge tone={stage.tone}>{stage.label}</Badge>
                    {missing.length > 0 && !p.invitations[0]?.completedAt ? <Badge tone="neutral">Dossier incomplet</Badge> : null}
                    {p.duplicateWarning ? <Badge tone="warning">Doublon possible</Badge> : null}
                    <ArrowRight className="size-4 text-text-tertiary" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchBox action="/admin/pharmacies" defaultValue={q} placeholder="Nom, ville, SIRET ou e-mail" keep={keep} />
          <FilterChips label="Trier" basePath="/admin/pharmacies" param="tri" current={tri === "recent" ? null : tri} keep={keep} options={[{ value: null, label: "Plus récentes" }, { value: "nom", label: "Nom" }, { value: "activite", label: "Dernière activité" }]} />
        </div>
        <FilterChips
          label="Filtrer par statut"
          basePath="/admin/pharmacies"
          param="statut"
          current={statut}
          keep={keep}
          options={[{ value: null, label: "Toutes", count: list.searched }, ...PHARMACY_STATUS_FILTERS.map((f) => ({ value: f, label: PHARMACY_STATUS_FILTER_LABELS[f], count: list.counts[f] }))]}
        />
      </section>

      {list.total === 0 ? (
        <Card>
          <EmptyState icon={<Building2 className="size-5" />} title="Aucune officine cliente pour l'instant" description="Créez la première : son environnement et son titulaire seront prêts immédiatement." action={<CreatePharmacyButton />} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<SearchX className="size-5" />}
            title="Aucune officine ne correspond"
            description={q ? `Rien pour « ${q} » avec ces filtres.` : "Aucune officine dans cette catégorie pour l'instant."}
            action={
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/pharmacies">Effacer les filtres</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {/* Téléphone : une carte par officine. Dès la tablette, le tableau (défilable). */}
          <ul className="space-y-2.5 md:hidden">
            {rows.map((row) => (
              <li key={row.id}>
                <Link href={`/admin/pharmacies/${row.id}`} className="block rounded-xl border border-border-subtle bg-surface-card p-4 transition-colors hover:border-brand-300">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-medium text-text-primary">{row.name}</span>
                      <span className="block text-[12px] text-text-tertiary">{[row.city, row.owner?.name].filter(Boolean).join(" · ") || "—"}</span>
                    </span>
                    <StatusBadge status={pharmacyStatusLabel(row)} />
                  </span>
                  <span className="mt-2.5 flex flex-wrap gap-1.5">
                    {row.subscriptionView ? <SubscriptionStatusBadge status={row.subscriptionView.status} /> : <Badge tone="neutral">Sans abonnement</Badge>}
                    <StatusBadge status={row.connector} />
                  </span>
                  <span className="mt-2 block text-[12px] text-text-tertiary">
                    Dernière connexion : <When date={row.teamLastLoginAt} empty="jamais" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <TableWrapper className="hidden md:block">
            <Table>
              <THead>
                <TR>
                  <TH>Officine</TH>
                  <TH>Titulaire</TH>
                  <TH>Abonnement</TH>
                  <TH>Connecteur</TH>
                  <TH>Dernière connexion</TH>
                  <TH>Statut</TH>
                  <TH>
                    <span className="sr-only">Ouvrir</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <PharmacyRow key={row.id} row={row} />
                ))}
              </TBody>
            </Table>
          </TableWrapper>
          <p className="text-[12.5px] text-text-tertiary">
            {rows.length} officine{rows.length > 1 ? "s" : ""} affichée{rows.length > 1 ? "s" : ""}
            {rows.length !== list.total ? ` sur ${list.total}` : ""}.{" "}
            {(q || statut) && (
              <Link href={hrefWith("/admin/pharmacies", {}, { tri: keep.tri })} className="font-medium text-brand-700 hover:underline dark:text-brand-400">
                Tout afficher
              </Link>
            )}
          </p>
        </>
      )}
    </>
  );
}

function PharmacyRow({ row }: { row: ClientPharmacyRow }) {
  const sub = row.subscriptionView;
  return (
    <TR interactive>
      <TD>
        <Link href={`/admin/pharmacies/${row.id}`} className="block font-medium text-text-primary hover:underline">
          {row.name}
        </Link>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-text-tertiary">
          {row.city ?? "Ville non renseignée"}
          {row.isDemo && <Badge tone="neutral">Démo</Badge>}
        </span>
      </TD>
      <TD>
        {row.owner ? (
          <>
            <span className="block text-[13px] text-text-primary">{row.owner.name}</span>
            <span className="block text-[12px] text-text-tertiary">{row.owner.email}</span>
          </>
        ) : (
          <Badge tone="warning">Aucun titulaire</Badge>
        )}
      </TD>
      <TD>
        {sub ? (
          <>
            <span className="flex flex-wrap items-center gap-1.5">
              <SubscriptionStatusBadge status={sub.status} />
              {sub.cancelAtPeriodEnd && <Badge tone="warning">Résiliation programmée</Badge>}
            </span>
            <span className="mt-1 block text-[12px] text-text-tertiary">
              {sub.planName} · {formatEuros(sub.priceCents)} HT/mois
              {sub.priceSource === "CATALOG_FALLBACK" ? " (catalogue)" : ""}
              {sub.catalogDiffers ? ` · catalogue actuel ${formatEuros(sub.catalogCents)}` : ""}
            </span>
            {sub.status === "TRIALING" && sub.trialEndsAt && <span className="block text-[12px] text-text-tertiary">Fin d&apos;essai le {formatFrenchDate(sub.trialEndsAt)}</span>}
          </>
        ) : (
          <span className="text-[12.5px] text-text-tertiary">Sans abonnement</span>
        )}
      </TD>
      <TD>
        <StatusBadge status={row.connector} />
        {row.connector.lgo && <span className="mt-1 block text-[12px] text-text-tertiary">{lgoLabel(row.connector.lgo)}</span>}
      </TD>
      <TD>
        <When date={row.teamLastLoginAt} empty="Jamais" className="text-[13px] text-text-primary" />
        <span className="block text-[12px] text-text-tertiary">
          {row.memberCount} compte{row.memberCount > 1 ? "s" : ""} actif{row.memberCount > 1 ? "s" : ""}
        </span>
      </TD>
      <TD>
        <StatusBadge status={pharmacyStatusLabel(row)} />
        <span className="mt-1 block text-[12px] text-text-tertiary">depuis le {formatFrenchDate(row.createdAt)}</span>
      </TD>
      <TD>
        <Link href={`/admin/pharmacies/${row.id}`} aria-label={`Ouvrir la fiche de ${row.name}`} className="flex justify-end rounded-md p-2 text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text-primary">
          <ArrowRight className="size-4" />
        </Link>
      </TD>
    </TR>
  );
}
