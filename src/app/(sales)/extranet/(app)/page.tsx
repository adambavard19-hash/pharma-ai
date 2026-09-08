import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireSalesSession } from "@/server/auth/sales-session";
import { salesRepStats } from "@/server/services/sales/reps";
import { listProspects, listTasks } from "@/server/services/sales/prospects";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ProspectStatusBadge } from "@/components/sales/status-badge";
import { formatCents, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: { absolute: "Extranet commercial — PharmaBoost" } };

export default async function SalesHomePage() {
  const session = await requireSalesSession();
  const [stats, recent, tasks] = await Promise.all([salesRepStats(session.rep.id), listProspects({ salesRepId: session.rep.id }), listTasks(session.rep.id)]);
  const kpis = [
    { label: "Prospects en cours", value: String(stats.openProspects) },
    { label: "Contrats envoyés", value: String(stats.contractsSent) },
    { label: "Contrats signés", value: String(stats.contractsSigned) },
    { label: "Pharmacies activées", value: String(stats.activated) },
    { label: "Commissions acquises", value: formatCents(stats.commissionEarnedCents + stats.commissionPaidCents), tone: "brand" as const },
    { label: "Commissions en attente", value: formatCents(stats.commissionPendingCents) },
  ];
  const toCall = [...tasks.late, ...tasks.today];
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.02em] text-text-primary">Bonjour {session.rep.firstName}</h1>
          <p className="mt-1 text-[13.5px] text-text-secondary">{toCall.length > 0 ? `${toCall.length} relance${toCall.length > 1 ? "s" : ""} à faire aujourd'hui.` : "Aucune relance en attente aujourd'hui."}</p>
        </div>
        <Button asChild leadingIcon={<Plus className="size-[18px]" />}><Link href="/extranet/dossiers/nouveau">Nouvelle pharmacie</Link></Button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label}><CardContent className="py-3.5">
            <p className="text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">{kpi.label}</p>
            <p className={"mt-1 text-[24px] leading-none font-semibold tabular " + (kpi.tone === "brand" ? "text-brand-700 dark:text-brand-400" : "text-text-primary")}>{kpi.value}</p>
          </CardContent></Card>
        ))}
      </div>

      {toCall.length > 0 && (
        <Card>
          <CardHeader title="À faire aujourd'hui" description="Vos relances en retard et du jour." action={<Link href="/extranet/taches" className="text-[13px] text-brand-700 underline underline-offset-2 dark:text-brand-400">Tout voir</Link>} />
          <CardContent className="pt-0">
            <ul className="divide-y divide-border-subtle">
              {toCall.slice(0, 5).map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-3 py-2.5 text-[14px]">
                  <span className="min-w-0"><Link href={`/extranet/dossiers/${task.prospect.id}`} className="font-medium text-text-primary hover:underline">{task.prospect.name}</Link><span className="block truncate text-[12.5px] text-text-secondary">{task.label} · {formatDate(task.dueAt)}</span></span>
                  {task.prospect.phone && <a href={`tel:${task.prospect.phone.replace(/\s+/g, "")}`} className="shrink-0 rounded-lg bg-brand-600 px-3 py-1.5 text-[12.5px] font-medium text-white">Appeler</a>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader title="Mes dossiers récents" action={<Link href="/extranet/pipeline" className="text-[13px] text-brand-700 underline underline-offset-2 dark:text-brand-400">Pipeline</Link>} />
        <CardContent className="pt-0">
          {recent.length === 0 ? (
            <p className="py-4 text-[13.5px] text-text-secondary">Aucun dossier pour l&apos;instant. Commencez par « Nouvelle pharmacie ».</p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {recent.slice(0, 8).map((prospect) => (
                <li key={prospect.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[14px]">
                  <span className="font-medium text-text-primary">{prospect.name}</span>
                  <span aria-hidden="true" className="text-text-tertiary">·</span>
                  <ProspectStatusBadge status={prospect.status} />
                  <Link href={`/extranet/dossiers/${prospect.id}`} className="ml-auto text-[13px] font-medium text-brand-700 hover:underline dark:text-brand-400">Voir</Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
