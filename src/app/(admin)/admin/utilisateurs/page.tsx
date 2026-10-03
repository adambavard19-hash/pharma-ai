import type { Metadata } from "next";
import Link from "next/link";
import { SearchX, Users } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { listPharmacyUsers } from "@/server/services/admin/clients";
import { AdminPageHeader } from "@/components/admin/page-header";
import { FilterChips, SearchBox } from "@/components/admin/filters";
import { StatusBadge } from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatFrenchDate } from "@/core/billing/subscription";
import { parsePage, parseUserRole, parseUserStatusFilter, ROLE_LABELS, searchParam, USER_ROLES, USER_STATUS_FILTERS, USER_STATUS_FILTER_LABELS, userAccessState } from "@/core/admin/clients";
import { Pagination, When } from "../pharmacies/client-ui";

export const metadata: Metadata = { title: "Utilisateurs des officines" };

/**
 * Tous les comptes des officines clientes : rôle, statut, dernière connexion.
 * Les gestes (renvoyer l'accès, suspendre) se font depuis la fiche de
 * l'officine, onglet Utilisateurs.
 */
export default async function PharmacyUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const params = await searchParams;
  const q = searchParam(params, "q");
  const role = parseUserRole(searchParam(params, "role"));
  const statut = parseUserStatusFilter(searchParam(params, "statut"));
  const requestedPage = parsePage(searchParam(params, "page"));
  const keep = { q, role: role?.toLowerCase() ?? null, statut };

  let data = await listPharmacyUsers({ q, role, statut, page: requestedPage });
  // Une page au-delà de la dernière (filtre resserré, lien ancien) ramène à la dernière page réelle.
  if (data.rows.length === 0 && data.total > 0 && requestedPage > data.pages) data = await listPharmacyUsers({ q, role, statut, page: data.pages });
  const page = Math.min(requestedPage, data.pages);
  const { rows } = data;

  return (
    <>
      <AdminPageHeader space={{ label: "Clients", href: "/admin/pharmacies" }} title="Utilisateurs" description="Les comptes des officines clientes, leur rôle et leur dernière connexion. Les gestes se font depuis la fiche de l'officine." />

      <section className="space-y-3">
        <SearchBox action="/admin/utilisateurs" defaultValue={q} placeholder="Nom, e-mail ou officine" keep={keep} />
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <FilterChips
            label="Filtrer par statut"
            basePath="/admin/utilisateurs"
            param="statut"
            current={statut}
            keep={keep}
            options={[{ value: null, label: "Tous", count: data.counts.all }, ...USER_STATUS_FILTERS.map((f) => ({ value: f, label: USER_STATUS_FILTER_LABELS[f], count: data.counts[f] }))]}
          />
          <FilterChips label="Filtrer par rôle" basePath="/admin/utilisateurs" param="role" current={role?.toLowerCase() ?? null} keep={keep} options={[{ value: null, label: "Tous les rôles" }, ...USER_ROLES.map((r) => ({ value: r.toLowerCase(), label: ROLE_LABELS[r] }))]} />
        </div>
      </section>

      {rows.length === 0 ? (
        <Card>
          {q || role || statut ? (
            <EmptyState
              icon={<SearchX className="size-5" />}
              title="Aucun compte ne correspond"
              description={q ? `Rien pour « ${q} » avec ces filtres.` : "Aucun compte dans cette catégorie pour l'instant."}
              action={
                <Button asChild size="sm" variant="outline">
                  <Link href="/admin/utilisateurs">Effacer les filtres</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState icon={<Users className="size-5" />} title="Aucun compte d'officine pour l'instant" description="Les comptes apparaissent dès qu'une officine est créée avec son titulaire." />
          )}
        </Card>
      ) : (
        <>
          <TableWrapper>
            <Table>
              <THead>
                <TR>
                  <TH>Compte</TH>
                  <TH>Officine</TH>
                  <TH>Rôle</TH>
                  <TH>Statut</TH>
                  <TH>Dernière connexion</TH>
                  <TH>Créé le</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((user) => {
                  const state = userAccessState(user);
                  return (
                    <TR key={user.id} interactive>
                      <TD>
                        <span className="block text-[13.5px] font-medium text-text-primary">
                          {user.firstName} {user.lastName.toUpperCase()}
                        </span>
                        <span className="block text-[12px] text-text-tertiary">{user.email}</span>
                      </TD>
                      <TD>
                        {user.memberships.length === 0 ? (
                          <span className="text-[12.5px] text-text-tertiary">Aucune officine</span>
                        ) : (
                          <ul className="space-y-1">
                            {user.memberships.map((m) => (
                              <li key={m.id} className="flex flex-wrap items-center gap-1.5">
                                <Link href={`/admin/pharmacies/${m.pharmacy.id}?onglet=utilisateurs`} className="text-[13px] text-text-primary hover:underline">
                                  {m.pharmacy.name}
                                </Link>
                                {!m.isActive && <Badge tone="danger">Accès suspendu</Badge>}
                                {!m.pharmacy.isActive && <Badge tone="warning">Officine suspendue</Badge>}
                                {m.pharmacy.isDemo && <Badge tone="neutral">Démo</Badge>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </TD>
                      <TD>
                        <span className="flex flex-wrap gap-1">
                          {[...new Set(user.memberships.map((m) => m.role))].map((r) => (
                            <Badge key={r} tone={r === "OWNER" ? "brand" : "neutral"}>
                              {ROLE_LABELS[r] ?? r}
                            </Badge>
                          ))}
                        </span>
                      </TD>
                      <TD>
                        <StatusBadge status={state} />
                      </TD>
                      <TD>
                        <When date={user.lastLoginAt} empty="Jamais" className="text-[13px]" />
                      </TD>
                      <TD className="text-[13px] text-text-secondary">{formatFrenchDate(user.createdAt)}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrapper>
          <Pagination basePath="/admin/utilisateurs" keep={keep} page={page} pages={data.pages} total={data.total} unit={["compte", "comptes"]} />
        </>
      )}
    </>
  );
}
