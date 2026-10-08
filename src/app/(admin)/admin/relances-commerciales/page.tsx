import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, BellRing, CalendarDays, CalendarRange, CheckCircle2 } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { FOLLOW_UP_ALL_LIMIT, FOLLOW_UP_LIMIT, followUpCounts, listRepOptions, loadFollowUps } from "@/server/services/admin/commercial";
import { defaultFollowUpInput, type DayBucket } from "@/core/sales/board";
import { KpiTile } from "@/components/admin/kpis";
import { FilterChips, hrefWith } from "@/components/admin/filters";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ProspectStatusBadge } from "@/components/sales/status-badge";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CommercialFilterForm, param } from "../pipeline/filter-form";
import { FollowUpButton, FollowUpDoneButton } from "./follow-up-dialog";
import { CommercialWorkspaceHeader } from "../_commercial/workspace-header";

export const metadata: Metadata = { title: "Relances commerciales" };

const VIEWS: { value: DayBucket; label: string }[] = [
  { value: "retard", label: "En retard" },
  { value: "aujourdhui", label: "Aujourd'hui" },
  { value: "a-venir", label: "À venir" },
];

/**
 * Les relances de tous les commerciaux, et la prochaine action des dossiers
 * qui n'ont pas de relance ouverte (dossiers de la console, demandes du site).
 * `?vue=retard|aujourdhui|a-venir` (sans vue : à traiter, c'est-à-dire en
 * retard et du jour) ; `?commercial=` (identifiant, ou `console`). Chaque vue
 * lit au plus 500 relances (`?tout=1` relève la borne) ; les compteurs
 * viennent de la base.
 */
export default async function SalesFollowUpsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const params = await searchParams;
  const now = new Date();
  const commercial = param(params.commercial);
  const view = VIEWS.find((v) => v.value === param(params.vue))?.value ?? null;
  const all = param(params.tout) === "1";
  const [{ items: rows, truncated }, counts, reps] = await Promise.all([loadFollowUps({ commercial, view }, now, all ? FOLLOW_UP_ALL_LIMIT : FOLLOW_UP_LIMIT), followUpCounts({ commercial }, now), listRepOptions()]);

  const count = (bucket: DayBucket) => counts[bucket];
  const keep = { vue: view, commercial, tout: all ? "1" : null };
  const defaultDue = defaultFollowUpInput(now);

  return (
    <>
      <CommercialWorkspaceHeader active="relances" description="Les relances prévues, tous commerciaux. Une relance fixée sur un dossier suivi par un commercial entre dans son agenda." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile label="En retard" value={count("retard")} hint="échéance passée" href="/admin/relances-commerciales?vue=retard" tone={count("retard") > 0 ? "warning" : "default"} icon={<AlarmClock className="size-4" />} />
        <KpiTile label="Aujourd'hui" value={count("aujourdhui")} href="/admin/relances-commerciales?vue=aujourdhui" tone={count("aujourdhui") > 0 ? "brand" : "default"} icon={<BellRing className="size-4" />} />
        <KpiTile label="À venir" value={count("a-venir")} href="/admin/relances-commerciales?vue=a-venir" icon={<CalendarRange className="size-4" />} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          basePath="/admin/relances-commerciales"
          param="vue"
          current={view}
          keep={keep}
          label="Échéance"
          options={[{ value: null, label: "À traiter", count: count("retard") + count("aujourdhui") }, ...VIEWS.map((v) => ({ value: v.value, label: v.label, count: count(v.value) }))]}
        />
        <CommercialFilterForm action="/admin/relances-commerciales" reps={reps} values={{ commercial }} fields={["commercial"]} keep={keep} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface-card">
          <EmptyState
            icon={view === "a-venir" ? <CalendarDays className="size-5" /> : <CheckCircle2 className="size-5" />}
            title={view === "a-venir" ? "Aucune relance à venir" : view === "aujourdhui" ? "Aucune relance aujourd'hui" : view === "retard" ? "Aucune relance en retard" : "Rien à traiter pour l'instant"}
            description={view === "a-venir" ? "Fixez une relance depuis ce bouton ou depuis la fiche d'un dossier." : "Les relances en retard et du jour apparaîtront ici."}
          />
        </div>
      ) : (
        <TableWrapper>
          <Table>
            <THead>
              <tr>
                <TH>Échéance</TH>
                <TH>Dossier</TH>
                <TH>Commercial</TH>
                <TH>Relance</TH>
                <TH>Retard</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {rows.map((item) => (
                <TR key={item.key} interactive>
                  <TD className={cn("whitespace-nowrap tabular-nums", item.bucket === "retard" ? "font-medium text-warning-700 dark:text-warning-500" : "text-text-primary")}>
                    {formatDate(item.dueAt)}
                    {item.bucket === "aujourdhui" && <span className="block text-[12px] font-normal text-brand-700 dark:text-brand-400">aujourd&apos;hui</span>}
                  </TD>
                  <TD className="max-w-[260px]">
                    <Link href={`/admin/dossiers/${item.prospectId}`} className="block truncate font-medium text-text-primary hover:text-brand-700 hover:underline dark:hover:text-brand-400">{item.prospectName}</Link>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-text-tertiary">
                      {item.city ?? "Ville non renseignée"}
                      <ProspectStatusBadge status={item.prospectStatus} />
                    </span>
                  </TD>
                  <TD className="text-text-secondary">{item.salesRep ? <Link href={`/admin/commerciaux/${item.salesRep.id}`} className="hover:text-text-primary hover:underline">{item.salesRep.name}</Link> : <span className="text-text-tertiary">Console</span>}</TD>
                  <TD className="max-w-[260px]">
                    <span className="block truncate text-text-primary">{item.label}</span>
                    <span className="block text-[12px] text-text-tertiary">{item.kind === "task" ? "Agenda du commercial" : "Prochaine action du dossier"}</span>
                  </TD>
                  <TD>{item.daysLate > 0 ? <Badge tone={item.daysLate > 7 ? "danger" : "warning"}>{item.daysLate} j de retard</Badge> : <span className="text-[13px] text-text-tertiary">—</span>}</TD>
                  <TD>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <FollowUpDoneButton taskId={item.taskId} prospectId={item.kind === "dossier" ? item.prospectId : null} />
                      <FollowUpButton fixedProspect={{ id: item.prospectId, name: item.prospectName }} defaultDue={defaultDue} label="Nouvelle relance" variant="ghost" size="sm" />
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      )}
      {truncated && (
        <p className="text-[12.5px] text-text-tertiary">
          Les {rows.length} premières relances, par échéance, sont affichées.{" "}
          {all ? (
            "Filtrez par commercial pour affiner."
          ) : (
            <Link href={hrefWith("/admin/relances-commerciales", keep, { tout: "1" })} className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">Voir tout</Link>
          )}
        </p>
      )}
    </>
  );
}
