import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck2, CalendarClock, CalendarDays, CalendarX2 } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { PAST_DEMOS_ALL_LIMIT, countDemosDoneSince, listOpenProspectOptions, listRepOptions, loadDemos } from "@/server/services/admin/commercial";
import { defaultDemoInput, demoBucket, type DemoBucket } from "@/core/sales/board";
import { AdminPageHeader } from "@/components/admin/page-header";
import { KpiTile } from "@/components/admin/kpis";
import { FilterChips, hrefWith } from "@/components/admin/filters";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/feedback";
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ProspectStatusBadge } from "@/components/sales/status-badge";
import { formatDate, formatTime } from "@/lib/format";
import { TIME_ZONE } from "@/config/constants";
import { CommercialFilterForm, param } from "../pipeline/filter-form";
import { ScheduleDemoButton } from "./demo-dialog";
import { DemoActions } from "./demo-actions";

export const metadata: Metadata = { title: "Démonstrations" };

const VIEWS: { value: DemoBucket; label: string }[] = [
  { value: "aujourdhui", label: "Aujourd'hui" },
  { value: "a-venir", label: "À venir" },
  { value: "passees", label: "Passées" },
];

const weekday = new Intl.DateTimeFormat("fr-FR", { timeZone: TIME_ZONE, weekday: "short" });

/**
 * Les démonstrations : `?vue=aujourdhui|a-venir|passees` (sans vue : les
 * prochaines, aujourd'hui compris). `?nouveau=demo` ouvre la fenêtre de
 * programmation ; `?dossier=` y présélectionne un dossier. Les démos passées
 * sont bornées aux plus récentes ; `?tout=1` relève la borne.
 */
export default async function DemonstrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePlatformSession();
  const params = await searchParams;
  const now = new Date();
  const commercial = param(params.commercial);
  const view = VIEWS.find((v) => v.value === param(params.vue))?.value ?? null;
  const all = param(params.tout) === "1";
  const [demos, options, reps, doneLast30] = await Promise.all([loadDemos({ commercial }, now, all ? { pastLimit: PAST_DEMOS_ALL_LIMIT } : {}), listOpenProspectOptions(), listRepOptions(), countDemosDoneSince(new Date(now.getTime() - 30 * 24 * 3600 * 1000), commercial)]);

  const withBucket = (list: typeof demos.past) => list.filter((d) => d.demoAt).map((d) => ({ ...d, demoAt: d.demoAt as Date, bucket: demoBucket(d.demoAt as Date, now) }));
  const upcoming = withBucket(demos.upcoming);
  const past = withBucket(demos.past);
  const count = (bucket: DemoBucket) => (bucket === "passees" ? demos.pastCount : upcoming.filter((d) => d.bucket === bucket).length);
  const shown = view === "passees" ? past : view ? upcoming.filter((d) => d.bucket === view) : upcoming;
  const pastTruncated = view === "passees" && demos.pastCount > past.length;
  const defaultAt = defaultDemoInput(now);
  const keep = { vue: view, commercial, tout: all ? "1" : null };

  return (
    <>
      <AdminPageHeader
        space={{ label: "Commercial", href: "/admin/pipeline" }}
        title="Démonstrations"
        description="Les démos programmées et réalisées. Une démo programmée pour un dossier suivi par un commercial entre dans son agenda."
        // La clé suit `?nouveau=` (et `?dossier=`) : la fenêtre s'ouvre aussi quand on est déjà sur la page, et à chaque nouvel usage.
        actions={<ScheduleDemoButton key={`${param(params.nouveau) ?? "aucun"}:${param(params.dossier) ?? ""}`} prospects={options} defaultAt={defaultAt} defaultOpen={param(params.nouveau) === "demo"} initialProspectId={param(params.dossier)} />}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Aujourd'hui" value={count("aujourdhui")} href="/admin/demonstrations?vue=aujourdhui" tone={count("aujourdhui") > 0 ? "brand" : "default"} icon={<CalendarClock className="size-4" />} />
        <KpiTile label="À venir" value={count("a-venir")} hint="après aujourd'hui" href="/admin/demonstrations?vue=a-venir" icon={<CalendarDays className="size-4" />} />
        <KpiTile label="Réalisées sur 30 jours" value={doneLast30} hint="marquées réalisées" href="/admin/demonstrations?vue=passees" tone="success" icon={<CalendarCheck2 className="size-4" />} />
        <KpiTile label="À confirmer" value={demos.toConfirm} hint="date passée, non marquée réalisée" href="/admin/demonstrations?vue=passees" tone={demos.toConfirm > 0 ? "warning" : "default"} icon={<CalendarX2 className="size-4" />} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          basePath="/admin/demonstrations"
          param="vue"
          current={view}
          keep={keep}
          label="Période"
          options={[{ value: null, label: "Prochaines", count: count("aujourdhui") + count("a-venir") }, ...VIEWS.map((v) => ({ value: v.value, label: v.label, count: count(v.value) }))]}
        />
        <CommercialFilterForm action="/admin/demonstrations" reps={reps} values={{ commercial }} fields={["commercial"]} keep={keep} />
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-border-subtle bg-surface-card">
          <EmptyState
            icon={<CalendarDays className="size-5" />}
            title={view === "passees" ? "Aucune démonstration passée" : view === "aujourdhui" ? "Aucune démonstration aujourd'hui" : "Aucune démonstration programmée"}
            description="Programmez une démo depuis ce bouton, depuis la fiche d'un dossier, ou en glissant une carte en « Démo programmée » sur le pipeline."
            action={<ScheduleDemoButton prospects={options} defaultAt={defaultAt} variant="outline" size="sm" />}
          />
        </div>
      ) : (
        <TableWrapper>
          <Table>
            <THead>
              <tr>
                <TH>Date</TH>
                <TH>Dossier</TH>
                <TH>Commercial</TH>
                <TH>Étape</TH>
                <TH>Démonstration</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <TBody>
              {shown.map((demo) => (
                <TR key={demo.id} interactive>
                  <TD className="whitespace-nowrap">
                    <span className="font-medium text-text-primary tabular-nums">{formatTime(demo.demoAt)}</span>
                    <span className="block text-[12px] text-text-tertiary first-letter:uppercase">{weekday.format(demo.demoAt)} {formatDate(demo.demoAt)}</span>
                  </TD>
                  <TD className="max-w-[260px]">
                    <Link href={`/admin/dossiers/${demo.id}`} className="block truncate font-medium text-text-primary hover:text-brand-700 hover:underline dark:hover:text-brand-400">{demo.name}</Link>
                    <span className="block truncate text-[12px] text-text-tertiary">{[demo.ownerName, demo.city].filter(Boolean).join(" · ") || "—"}</span>
                  </TD>
                  <TD className="text-text-secondary">{demo.salesRep ? `${demo.salesRep.firstName} ${demo.salesRep.lastName}` : <span className="text-text-tertiary">Console</span>}</TD>
                  <TD><ProspectStatusBadge status={demo.status} /></TD>
                  <TD>
                    {demo.demoDoneAt ? <Badge tone="success">Réalisée le {formatDate(demo.demoDoneAt)}</Badge> : demo.bucket === "passees" ? <Badge tone="warning">À confirmer</Badge> : demo.bucket === "aujourdhui" ? <Badge tone="brand">Aujourd&apos;hui</Badge> : <Badge tone="info">Programmée</Badge>}
                  </TD>
                  <TD className="text-right">
                    <DemoActions prospect={{ id: demo.id, name: demo.name }} demoAt={demo.demoAt.toISOString()} done={Boolean(demo.demoDoneAt)} defaultAt={defaultAt} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrapper>
      )}
      {pastTruncated && (
        <p className="text-[12.5px] text-text-tertiary">
          Les {shown.length} démonstrations passées les plus récentes sont affichées, sur {demos.pastCount}.{" "}
          {all ? (
            "Filtrez par commercial pour affiner."
          ) : (
            <Link href={hrefWith("/admin/demonstrations", keep, { tout: "1" })} className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">Voir tout</Link>
          )}
        </p>
      )}
      {view !== "passees" && demos.upcomingTruncated && <p className="text-[12.5px] text-text-tertiary">Les {demos.upcoming.length} prochaines démonstrations sont affichées : filtrez par commercial pour affiner.</p>}
    </>
  );
}
