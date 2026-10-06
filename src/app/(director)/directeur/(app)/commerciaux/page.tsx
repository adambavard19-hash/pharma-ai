import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { requireDirectorSession } from "@/server/auth/director-session";
import { listAssignableReps, listTeam, listUnassignedProspects, type TeamRow } from "@/server/services/sales/director-team";
import { invitationKind, parseTeamStatus } from "@/core/sales/director/team";
import { describeCommissionRule } from "@/core/sales/commission";
import { AdminPageHeader, AdminSection } from "@/components/admin/page-header";
import { FilterChips, SearchBox } from "@/components/admin/filters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { AssignProspects } from "./_components/assign-prospects";
import { ActiveButton, InviteButton } from "./_components/rep-actions";

export const metadata: Metadata = { title: "Commerciaux" };

const BASE_PATH = "/directeur/commerciaux";

const first = (value: string | string[] | undefined): string | null => (Array.isArray(value) ? (value[0] ?? null) : (value ?? null));

/** Où en est son accès : jamais invité, invité sans connexion, ou déjà connecté. */
function InvitationBadge({ rep }: { rep: Pick<TeamRow, "invitedAt" | "lastLoginAt"> }) {
  const kind = invitationKind(rep);
  if (kind === "CONNECTED") return <Badge tone="success">Connecté</Badge>;
  if (kind === "SENT") return <Badge tone="info">Invitation envoyée le {formatDate(rep.invitedAt)}</Badge>;
  return <Badge tone="warning">Invitation non envoyée</Badge>;
}

/**
 * L'équipe commerciale : une ligne par commercial, avec ce qui compte (ses
 * dossiers ouverts, ses activations du mois, sa dernière connexion, l'état de
 * son invitation). Recherche par nom, e-mail ou zone (`?q=`), filtre actifs /
 * inactifs (`?statut=`). Les dossiers sans commercial s'attribuent depuis le
 * panneau du haut.
 */
export default async function TeamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireDirectorSession();
  const params = await searchParams;
  const q = (first(params.q) ?? "").trim().slice(0, 80);
  const status = parseTeamStatus(first(params.statut));
  const now = new Date();

  const [list, unassigned, assignable] = await Promise.all([listTeam({ q, status }, now), listUnassignedProspects(), listAssignableReps()]);
  const { rows, counts, grandTotal } = list;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Commerciaux"
        description={`${counts.active > 1 ? `${counts.active} commerciaux actifs` : `${counts.active} commercial actif`}${counts.inactive > 0 ? `, ${counts.inactive} désactivé${counts.inactive > 1 ? "s" : ""}` : ""}. Ajoutez, suivez et réaffectez depuis cette page.`}
        actions={
          <Button asChild leadingIcon={<Plus className="size-[18px]" />}>
            <Link href={`${BASE_PATH}/nouveau`}>Ajouter un commercial</Link>
          </Button>
        }
      />

      {unassigned.total > 0 && (
        <AdminSection title={`Dossiers sans commercial (${unassigned.total})`} description="Ces dossiers ouverts ne sont suivis par aucun commercial actif (nouveaux dossiers, ou dossiers d'un commercial désactivé). Choisissez-les, puis confiez-les à un commercial actif.">
          <AssignProspects
            mode="assign"
            nowIso={now.toISOString()}
            reps={assignable}
            prospects={unassigned.rows.map((row) => ({ id: row.id, name: row.name, city: row.city, status: row.status, createdAt: row.createdAt.toISOString(), formerRepName: row.formerRepName }))}
          />
          {unassigned.total > unassigned.rows.length && <p className="mt-3 text-[12.5px] text-text-tertiary">Les {unassigned.rows.length} plus récents sont affichés. Les autres apparaîtront une fois ceux-ci attribués.</p>}
        </AdminSection>
      )}

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <FilterChips
          basePath={BASE_PATH}
          param="statut"
          label="Filtrer l'équipe"
          current={status}
          keep={{ q: q || null }}
          options={[
            { value: null, label: "Tous", count: counts.all },
            { value: "actifs", label: "Actifs", count: counts.active },
            { value: "inactifs", label: "Désactivés", count: counts.inactive },
          ]}
        />
        <SearchBox action={BASE_PATH} defaultValue={q} placeholder="Nom, e-mail ou zone" keep={{ statut: status }} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface-card">
          {grandTotal === 0 ? (
            <EmptyState
              icon={<Users className="size-5" />}
              title="Aucun commercial pour l'instant"
              description="Ajoutez le premier : il reçoit un e-mail pour choisir son mot de passe et accéder à son espace."
              action={
                <Button asChild leadingIcon={<Plus className="size-4" />}>
                  <Link href={`${BASE_PATH}/nouveau`}>Ajouter un commercial</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Users className="size-5" />}
              title="Aucun commercial ne correspond"
              description={q ? `Rien ne correspond à « ${q} »${status ? ` parmi les commerciaux ${status === "actifs" ? "actifs" : "désactivés"}` : ""}.` : `Aucun commercial ${status === "actifs" ? "actif" : "désactivé"} pour l'instant.`}
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href={BASE_PATH}>Voir toute l&apos;équipe</Link>
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <>
          <ul className="space-y-2.5 md:hidden">
            {rows.map((rep) => (
              <li key={rep.id} className="space-y-3 rounded-xl border border-border-subtle bg-surface-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`${BASE_PATH}/${rep.id}`} className="block truncate text-[14px] font-semibold text-text-primary hover:underline">
                      {rep.firstName} {rep.lastName}
                    </Link>
                    <p className="truncate text-[12.5px] text-text-tertiary">{[rep.zone, describeCommissionRule({ type: rep.commissionType, value: rep.commissionValue })].filter(Boolean).join(" · ")}</p>
                  </div>
                  {!rep.isActive && <Badge tone="neutral">Désactivé</Badge>}
                </div>
                <p className="text-[12.5px] text-text-secondary">
                  {rep.openProspects} dossier{rep.openProspects > 1 ? "s" : ""} ouvert{rep.openProspects > 1 ? "s" : ""} · {rep.activationsThisMonth} activation{rep.activationsThisMonth > 1 ? "s" : ""} ce mois-ci
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <InvitationBadge rep={rep} />
                  <span className="text-[12px] text-text-tertiary">{rep.lastLoginAt ? `connecté le ${formatDate(rep.lastLoginAt)}` : "jamais connecté"}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {rep.isActive && invitationKind(rep) !== "CONNECTED" && <InviteButton salesRepId={rep.id} invited={rep.invitedAt !== null} />}
                  <ActiveButton salesRepId={rep.id} name={`${rep.firstName} ${rep.lastName}`} isActive={rep.isActive} />
                </div>
              </li>
            ))}
          </ul>

          <TableWrapper className="hidden md:block">
            <Table>
              <THead>
                <tr>
                  <TH>Commercial</TH>
                  <TH>Commission</TH>
                  <TH numeric>Dossiers ouverts</TH>
                  <TH numeric>Activations du mois</TH>
                  <TH>Dernière connexion</TH>
                  <TH>Invitation</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </tr>
              </THead>
              <TBody>
                {rows.map((rep) => (
                  <TR key={rep.id} interactive className={rep.isActive ? undefined : "opacity-75"}>
                    <TD className="max-w-[260px]">
                      <Link href={`${BASE_PATH}/${rep.id}`} className="block truncate font-medium text-text-primary hover:text-brand-700 hover:underline dark:hover:text-brand-400">
                        {rep.firstName} {rep.lastName}
                      </Link>
                      <span className="block truncate text-[12px] text-text-tertiary">{[rep.zone, rep.email].filter(Boolean).join(" · ")}</span>
                      {!rep.isActive && (
                        <Badge tone="neutral" className="mt-1">
                          Désactivé
                        </Badge>
                      )}
                    </TD>
                    <TD className="text-[13px] text-text-secondary">{describeCommissionRule({ type: rep.commissionType, value: rep.commissionValue })}</TD>
                    <TD numeric>{rep.openProspects}</TD>
                    <TD numeric>{rep.activationsThisMonth}</TD>
                    <TD className="text-[13px] whitespace-nowrap text-text-secondary">{rep.lastLoginAt ? formatDate(rep.lastLoginAt) : "Jamais"}</TD>
                    <TD>
                      <InvitationBadge rep={rep} />
                    </TD>
                    <TD>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {rep.isActive && invitationKind(rep) !== "CONNECTED" && <InviteButton salesRepId={rep.id} invited={rep.invitedAt !== null} />}
                        <ActiveButton salesRepId={rep.id} name={`${rep.firstName} ${rep.lastName}`} isActive={rep.isActive} />
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrapper>
          <p className="text-[12.5px] text-text-tertiary">Les activations du mois sont les officines passées « Activées » depuis le 1er du mois, sur les dossiers de chaque commercial.</p>
        </>
      )}
    </div>
  );
}
