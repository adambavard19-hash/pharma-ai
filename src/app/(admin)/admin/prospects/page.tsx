import type { Metadata } from "next";
import Link from "next/link";
import { Columns3, FolderSearch } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { CONSOLE_REP, NO_REPLY_DAYS, ORIGIN_PARAMS, listProspectRows, listRepOptions, parseOriginParam, parseProspectFilter, prospectListCounts, type ProspectListFilter } from "@/server/services/admin/commercial";
import { isOverdue, parseStatusParam } from "@/core/sales/board";
import { PROSPECT_STATUSES, PROSPECT_STATUS_LABELS } from "@/core/sales/pipeline";
import { AdminPageHeader } from "@/components/admin/page-header";
import { FilterChips, hrefWith } from "@/components/admin/filters";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ContractStatusBadge, OriginBadge, ProspectStatusBadge } from "@/components/sales/status-badge";
import { formatDate, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CommercialFilterForm, param } from "../pipeline/filter-form";

export const metadata: Metadata = { title: "Prospects" };

/**
 * Tous les dossiers commerciaux, en tableau. Filtres du contrat des adresses :
 * `?filtre=sans-reponse|a-relancer`, `?statut=`, `?commercial=`, `?origine=`,
 * `?q=`. Chaque compteur est calculé avec les autres filtres en place.
 */
export default async function ProspectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const params = await searchParams;
  const now = new Date();
  const statut = parseStatusParam(param(params.statut));
  const origine = parseOriginParam(param(params.origine));
  const filter: ProspectListFilter = { filtre: parseProspectFilter(param(params.filtre)), statut, commercial: param(params.commercial), origine, q: param(params.q) };
  const keep = { filtre: filter.filtre, statut: statut ?? null, commercial: filter.commercial, origine: ORIGIN_PARAMS.find((o) => o.origin === origine)?.value ?? null, q: filter.q };

  const [{ rows, truncated }, counts, reps] = await Promise.all([listProspectRows(filter, now), prospectListCounts(filter, now), listRepOptions()]);
  const repName = (id: string) => {
    const rep = reps.find((r) => r.id === id);
    return rep ? `${rep.firstName} ${rep.lastName}` : "Commercial";
  };
  const anyFilter = Object.values(keep).some(Boolean);

  return (
    <>
      <AdminPageHeader
        space={{ label: "Commercial", href: "/admin/pipeline" }}
        title="Prospects"
        description="Tous les dossiers, du premier contact à l'activation. Cliquez un nom pour ouvrir la fiche."
        actions={
          <Button asChild variant="outline" leadingIcon={<Columns3 className="size-4" />}>
            <Link href="/admin/pipeline">Vue pipeline</Link>
          </Button>
        }
      />

      <div className="space-y-3">
        <FilterChips
          basePath="/admin/prospects"
          param="filtre"
          current={filter.filtre}
          keep={keep}
          label="À traiter"
          options={[
            { value: null, label: "Tous", count: counts.filtre.all },
            { value: "sans-reponse", label: `Sans réponse depuis ${NO_REPLY_DAYS} j`, count: counts.filtre["sans-reponse"] },
            { value: "a-relancer", label: "À relancer", count: counts.filtre["a-relancer"] },
          ]}
        />
        <FilterChips
          basePath="/admin/prospects"
          param="statut"
          current={statut}
          keep={keep}
          label="Étape"
          options={[{ value: null, label: "Toutes les étapes" }, ...PROSPECT_STATUSES.filter((s) => (counts.statut[s] ?? 0) > 0 || s === statut).map((s) => ({ value: s, label: PROSPECT_STATUS_LABELS[s], count: counts.statut[s] ?? 0 }))]}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <FilterChips
            basePath="/admin/prospects"
            param="origine"
            current={keep.origine}
            keep={keep}
            label="Origine"
            options={[{ value: null, label: "Toutes origines" }, ...ORIGIN_PARAMS.map((o) => ({ value: o.value, label: o.label, count: counts.origine[o.origin] ?? 0 }))]}
          />
        </div>
        <CommercialFilterForm action="/admin/prospects" reps={reps} values={{ q: filter.q, commercial: filter.commercial }} fields={["q", "commercial"]} keep={keep} repCounts={counts.commercial} />
        {filter.commercial && (
          <p className="text-[12.5px] text-text-tertiary">
            {counts.commercial[filter.commercial] ?? 0} dossier{(counts.commercial[filter.commercial] ?? 0) > 1 ? "s" : ""} pour {filter.commercial === CONSOLE_REP ? "la console" : repName(filter.commercial)}.
          </p>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface-card">
          <EmptyState
            icon={<FolderSearch className="size-5" />}
            title={anyFilter ? "Aucun dossier ne correspond" : "Aucun dossier pour l'instant"}
            description={anyFilter ? "Retirez un filtre ou modifiez la recherche." : "Les demandes du site et les dossiers créés depuis la console apparaîtront ici."}
            action={anyFilter ? <Button asChild variant="outline" size="sm"><Link href="/admin/prospects">Effacer les filtres</Link></Button> : undefined}
          />
        </div>
      ) : (
        <TableWrapper>
          <Table>
            <THead>
              <tr>
                <TH>Dossier</TH>
                <TH>Commercial</TH>
                <TH>Étape</TH>
                <TH>Origine</TH>
                <TH>Dernier contact</TH>
                <TH>Prochaine action</TH>
                <TH>Contrat</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((row) => {
                const late = row.status !== "ACTIVATED" && row.status !== "LOST" && isOverdue(row.nextActionAt, now);
                return (
                  <TR key={row.id} interactive>
                    <TD className="max-w-[280px]">
                      <Link href={`/admin/dossiers/${row.id}`} className="block truncate font-medium text-text-primary hover:text-brand-700 hover:underline dark:hover:text-brand-400">{row.name}</Link>
                      <span className="block truncate text-[12px] text-text-tertiary">{row.city ?? "Ville non renseignée"}{row.blockedAt ? " · suspendu" : ""}</span>
                    </TD>
                    <TD className="text-text-secondary">
                      {row.salesRep ? <Link href={hrefWith("/admin/prospects", keep, { commercial: row.salesRep.id })} className="hover:text-text-primary hover:underline">{row.salesRep.firstName} {row.salesRep.lastName}</Link> : <span className="text-text-tertiary">Console</span>}
                    </TD>
                    <TD><ProspectStatusBadge status={row.status} /></TD>
                    <TD><OriginBadge origin={row.origin} /></TD>
                    <TD className="text-[13px] text-text-secondary" title={row.lastContactAt ? formatDate(row.lastContactAt) : undefined}>{row.lastContactAt ? formatRelative(row.lastContactAt) : <span className="text-text-tertiary">Jamais</span>}</TD>
                    <TD className={cn("text-[13px]", late ? "font-medium text-warning-700 dark:text-warning-500" : "text-text-secondary")}>
                      {row.nextActionAt ? <>{row.nextActionLabel ?? "Relancer"} · {formatDate(row.nextActionAt)}{late ? " · en retard" : ""}</> : <span className="text-text-tertiary">—</span>}
                    </TD>
                    <TD>{row.contracts[0] ? <ContractStatusBadge status={row.contracts[0].status} /> : <span className="text-[13px] text-text-tertiary">—</span>}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </TableWrapper>
      )}
      {truncated && <p className="text-[12.5px] text-text-tertiary">Seuls les {rows.length} dossiers les plus récemment modifiés sont affichés : affinez avec un filtre ou la recherche.</p>}
    </>
  );
}
