import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { prisma } from "@/server/db/client";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { PageHeader } from "@/components/ui/page";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { lgoLabel, stockFreshness } from "@/core/stock/connectors";
import { CreatePharmacyButton } from "./pharmacy-form";
import { StatusToggle } from "./status-toggle";

export const metadata: Metadata = { title: "Officines clientes" };

/**
 * Les officines clientes.
 *
 * Uniquement des faits de compte et d'installation : titulaire, effectif,
 * accueil terminé, stock importé (effectif et date, jamais le contenu), état du
 * moteur, abonnement. Aucune donnée médicale.
 */
export default async function ClientPharmaciesPage() {
  await requirePlatformSession();

  const [pharmacies, unclassifiedByPharmacy] = await Promise.all([
    prisma.pharmacy.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        city: true,
        isActive: true,
        createdAt: true,
        onboardingCompletedAt: true,
        stockSyncedAt: true,
        stockConnection: { select: { lgo: true, status: true, lastSyncAt: true, lastSeenAt: true, intervalSeconds: true } },
        memberships: {
          where: { isActive: true },
          select: {
            role: true,
            user: { select: { firstName: true, lastName: true, email: true, lastLoginAt: true } },
          },
        },
        // Des comptes, jamais des données médicales : des effectifs et des dates.
        _count: { select: { products: true, drugStocks: true, prescriptions: true, analysisRuns: true } },
        analysisRuns: { orderBy: { startedAt: "desc" }, take: 1, select: { status: true, outcome: true, startedAt: true } },
        organization: { select: { subscription: { select: { status: true, plan: { select: { name: true } } } } } },
      },
    }),
    prisma.product.groupBy({ by: ["pharmacyId"], where: { deletedAt: null, classifiedAt: null }, _count: true }),
  ]);
  const anomaliesOf = (pharmacyId: string) => unclassifiedByPharmacy.find((row) => row.pharmacyId === pharmacyId)?._count ?? 0;
  const engineLabel = (run: { status: string; outcome: string | null } | undefined) => {
    if (!run) return { label: "Jamais sollicité", tone: "neutral" as const };
    if (run.status === "FAILED" || run.outcome === "ENGINE_ERROR") return { label: "En erreur", tone: "danger" as const };
    if (run.outcome === "AI_UNAVAILABLE") return { label: "IA indisponible", tone: "warning" as const };
    if (run.outcome === "STOCK_NOT_CONFIGURED") return { label: "Sans stock", tone: "warning" as const };
    return { label: "Opérationnel", tone: "success" as const };
  };

  return (
    <>
      <PageHeader
        title="Officines clientes"
        description="Créer un environnement, suspendre un accès, retrouver un titulaire."
        actions={<CreatePharmacyButton />}
      />

      {pharmacies.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 className="size-5" />}
            title="Aucune officine cliente"
            description="Créez la première : son environnement et son titulaire seront prêts immédiatement."
          />
        </Card>
      ) : (
        <>
          {/* Téléphone : une carte par officine. Le tableau reste, à partir de
              la tablette, là où six colonnes tiennent sans se chevaucher. */}
          <ul className="space-y-2.5 md:hidden">
            {pharmacies.map((pharmacy) => {
              const owner = pharmacy.memberships.find((m) => m.role === "OWNER");
              const collaborators = pharmacy.memberships.filter((m) => m.role !== "OWNER");

              return (
                <li
                  key={pharmacy.id}
                  className="rounded-xl border border-border-subtle bg-surface-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={`/admin/pharmacies/${pharmacy.id}`}
                      className="min-w-0 flex-1 font-medium text-text-primary hover:underline"
                    >
                      {pharmacy.name}
                      {pharmacy.city && (
                        <span className="block text-[12px] font-normal text-text-tertiary">
                          {pharmacy.city}
                        </span>
                      )}
                    </Link>
                    <Badge tone={pharmacy.isActive ? "success" : "neutral"}>
                      {pharmacy.isActive ? "Active" : "Suspendue"}
                    </Badge>
                  </div>

                  <p className="mt-2 text-[12.5px] text-text-secondary">
                    {owner
                      ? `${owner.user.firstName} ${owner.user.lastName.toUpperCase()} · ${owner.user.email}`
                      : "Aucun titulaire"}
                  </p>
                  <p className="mt-0.5 text-[12px] text-text-tertiary">
                    {collaborators.length} collaborateur{collaborators.length > 1 ? "s" : ""} ·
                    créée le {formatDate(pharmacy.createdAt)}
                  </p>
                  <p className="mt-1.5 flex flex-wrap gap-1.5">
                    <Badge tone={pharmacy.onboardingCompletedAt ? "success" : "warning"}>{pharmacy.onboardingCompletedAt ? "Accueil terminé" : "Accueil en cours"}</Badge>
                    <Badge tone={pharmacy.stockSyncedAt ? "success" : "warning"}>
                      {pharmacy.stockSyncedAt ? `${pharmacy._count.products + pharmacy._count.drugStocks} réf. · sync. ${formatDate(pharmacy.stockSyncedAt)}` : "Stock jamais importé"}
                    </Badge>
                    <Badge tone={engineLabel(pharmacy.analysisRuns[0]).tone}>Moteur : {engineLabel(pharmacy.analysisRuns[0]).label}</Badge>
                  </p>

                  <div className="mt-3 flex items-center gap-2 border-t border-border-subtle pt-3">
                    <StatusToggle pharmacyId={pharmacy.id} isActive={pharmacy.isActive} />
                    <Link
                      href={`/admin/pharmacies/${pharmacy.id}`}
                      className="ml-auto flex items-center gap-1 text-[13px] font-medium text-brand-700 dark:text-brand-400"
                    >
                      Ouvrir
                      <ArrowRight className="size-3.5" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>

          <TableWrapper className="hidden md:block">
          <Table>
            <THead>
              <TR>
                <TH>Officine</TH>
                <TH>Titulaire</TH>
                <TH numeric>Équipe</TH>
                <TH>Accueil</TH>
                <TH>Stock</TH>
                <TH>Moteur</TH>
                <TH>Abonnement</TH>
                <TH>Statut</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {pharmacies.map((pharmacy) => {
                const owner = pharmacy.memberships.find((m) => m.role === "OWNER");

                return (
                  <TR key={pharmacy.id}>
                    <TD>
                      <Link
                        href={`/admin/pharmacies/${pharmacy.id}`}
                        className="block font-medium text-text-primary hover:underline"
                      >
                        {pharmacy.name}
                      </Link>
                      {pharmacy.city && (
                        <span className="block text-[12px] text-text-tertiary">
                          {pharmacy.city}
                        </span>
                      )}
                    </TD>
                    <TD>
                      {owner ? (
                        <>
                          <span className="block text-[13px] text-text-primary">
                            {owner.user.firstName} {owner.user.lastName.toUpperCase()}
                          </span>
                          <span className="block text-[12px] text-text-tertiary">
                            {owner.user.email}
                          </span>
                        </>
                      ) : (
                        <Badge tone="warning">Aucun titulaire</Badge>
                      )}
                    </TD>
                    <TD numeric>{pharmacy.memberships.length}</TD>
                    <TD>
                      <Badge tone={pharmacy.onboardingCompletedAt ? "success" : "warning"}>
                        {pharmacy.onboardingCompletedAt ? "Terminé" : "En cours"}
                      </Badge>
                    </TD>
                    <TD>
                      {pharmacy.stockSyncedAt ? (
                        <>
                          <span className="block text-[13px] text-text-primary tabular">
                            {pharmacy._count.products + pharmacy._count.drugStocks} réf.
                            {anomaliesOf(pharmacy.id) > 0 && (
                              <span className="text-warning-700"> · {anomaliesOf(pharmacy.id)} à classer</span>
                            )}
                          </span>
                          <span className="block text-[12px] text-text-tertiary">
                            {pharmacy.stockConnection && pharmacy.stockConnection.status !== "PENDING" && pharmacy.stockConnection.status !== "DISCONNECTED"
                              ? `${lgoLabel(pharmacy.stockConnection.lgo)} · ${stockFreshness({ lastSyncAt: pharmacy.stockConnection.lastSyncAt, lastSeenAt: pharmacy.stockConnection.lastSeenAt, intervalSeconds: pharmacy.stockConnection.intervalSeconds }).state === "FRESH" ? "à jour" : "à vérifier"}`
                              : `sync. ${formatDate(pharmacy.stockSyncedAt)} · fichier`}
                          </span>
                        </>
                      ) : (
                        <Badge tone="warning">Jamais importé</Badge>
                      )}
                    </TD>
                    <TD>
                      {(() => {
                        const engine = engineLabel(pharmacy.analysisRuns[0]);
                        return (
                          <>
                            <Badge tone={engine.tone}>{engine.label}</Badge>
                            <span className="mt-1 block text-[12px] text-text-tertiary">
                              {pharmacy._count.analysisRuns} analyse{pharmacy._count.analysisRuns > 1 ? "s" : ""}
                              {pharmacy.analysisRuns[0] && ` · ${formatDate(pharmacy.analysisRuns[0].startedAt)}`}
                            </span>
                          </>
                        );
                      })()}
                    </TD>
                    <TD>
                      {pharmacy.organization.subscription ? (
                        <>
                          <span className="block text-[13px] text-text-primary">{pharmacy.organization.subscription.plan.name}</span>
                          <span className="block text-[12px] text-text-tertiary">{pharmacy.organization.subscription.status.toLowerCase()}</span>
                        </>
                      ) : (
                        <span className="text-[12px] text-text-tertiary">—</span>
                      )}
                    </TD>
                    <TD>
                      <Badge tone={pharmacy.isActive ? "success" : "neutral"}>
                        {pharmacy.isActive ? "Active" : "Suspendue"}
                      </Badge>
                      <span className="mt-1 block text-[12px] text-text-tertiary">créée le {formatDate(pharmacy.createdAt)}</span>
                    </TD>
                    <TD>
                      <span className="flex items-center justify-end gap-1">
                        <StatusToggle pharmacyId={pharmacy.id} isActive={pharmacy.isActive} />
                        <Link
                          href={`/admin/pharmacies/${pharmacy.id}`}
                          aria-label={`Ouvrir ${pharmacy.name}`}
                          className="rounded-md p-2 text-text-tertiary transition-colors hover:bg-surface-sunken hover:text-text-primary"
                        >
                          <ArrowRight className="size-4" />
                        </Link>
                      </span>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
            </Table>
          </TableWrapper>
        </>
      )}
    </>
  );
}
