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
import { CreatePharmacyButton } from "./pharmacy-form";
import { StatusToggle } from "./status-toggle";

export const metadata: Metadata = { title: "Officines clientes" };

/**
 * Les officines clientes.
 *
 * Uniquement des faits de compte : nom, titulaire, effectif, statut, date de
 * signature. Aucune donnée d'exploitation — ni patients, ni ventes, ni stock.
 */
export default async function ClientPharmaciesPage() {
  await requirePlatformSession();

  const pharmacies = await prisma.pharmacy.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      city: true,
      isActive: true,
      createdAt: true,
      memberships: {
        where: { isActive: true },
        select: {
          role: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      },
    },
  });

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
                <TH numeric>Collaborateurs</TH>
                <TH>Statut</TH>
                <TH>Créée le</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {pharmacies.map((pharmacy) => {
                const owner = pharmacy.memberships.find((m) => m.role === "OWNER");
                const collaborators = pharmacy.memberships.filter((m) => m.role !== "OWNER");

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
                    <TD numeric>{collaborators.length}</TD>
                    <TD>
                      <Badge tone={pharmacy.isActive ? "success" : "neutral"}>
                        {pharmacy.isActive ? "Active" : "Suspendue"}
                      </Badge>
                    </TD>
                    <TD>{formatDate(pharmacy.createdAt)}</TD>
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
