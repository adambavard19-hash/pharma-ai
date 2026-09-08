import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { prisma } from "@/server/db/client";
import { listProspects } from "@/server/services/sales/prospects";
import { listAdminNotifications } from "@/server/services/sales/notifications";
import { PROSPECT_STATUSES, PROSPECT_STATUS_LABELS } from "@/core/sales/pipeline";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ProspectStatusBadge, ContractStatusBadge } from "@/components/sales/status-badge";
import { formatDate, formatDateTime } from "@/lib/format";
import type { ProspectStatus } from "@/generated/prisma";

export const metadata: Metadata = { title: "Pipeline commercial" };

/** Toutes les pharmacies en cours, tous commerciaux, avec filtres par l'URL. */
export default async function AdminPipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePlatformSession();
  const q = await searchParams;
  const status = PROSPECT_STATUSES.find((s) => s === q.statut) as ProspectStatus | undefined;
  const [prospects, reps, notifications] = await Promise.all([
    listProspects({ salesRepId: q.commercial || undefined, status, city: q.ville || undefined, query: q.q || undefined, hasContract: q.contrat === "1", activated: q.activation === "1" }),
    prisma.salesRep.findMany({ orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
    listAdminNotifications(8),
  ]);
  const late = prospects.filter((p) => p.nextActionAt && p.nextActionAt < new Date() && !["ACTIVATED", "LOST"].includes(p.status));
  const field = "rounded-md border border-border-default bg-surface-card px-2.5 py-1.5 text-[13px] text-text-primary";
  return (
    <>
      <PageHeader title="Pipeline commercial" description={`${prospects.length} dossier(s)${late.length ? ` · ${late.length} en retard de relance` : ""}`} />
      <form className="flex flex-wrap items-end gap-2" method="get">
        <input name="q" defaultValue={q.q ?? ""} placeholder="Pharmacie, titulaire, ville" className={field} aria-label="Recherche" />
        <select name="commercial" defaultValue={q.commercial ?? ""} className={field} aria-label="Commercial"><option value="">Tous les commerciaux</option>{reps.map((r) => <option key={r.id} value={r.id}>{r.firstName} {r.lastName}</option>)}</select>
        <select name="statut" defaultValue={q.statut ?? ""} className={field} aria-label="Statut"><option value="">Tous les statuts</option>{PROSPECT_STATUSES.map((s) => <option key={s} value={s}>{PROSPECT_STATUS_LABELS[s]}</option>)}</select>
        <input name="ville" defaultValue={q.ville ?? ""} placeholder="Ville" className={field} aria-label="Ville" />
        <label className="flex items-center gap-1.5 text-[13px] text-text-secondary"><input type="checkbox" name="contrat" value="1" defaultChecked={q.contrat === "1"} /> Contrat envoyé</label>
        <label className="flex items-center gap-1.5 text-[13px] text-text-secondary"><input type="checkbox" name="activation" value="1" defaultChecked={q.activation === "1"} /> Activées</label>
        <button type="submit" className="rounded-md bg-brand-600 px-3.5 py-1.5 text-[13px] font-medium text-white">Filtrer</button>
        {Object.values(q).some(Boolean) && <Link href="/admin/pipeline" className="text-[13px] text-text-tertiary underline underline-offset-2">Effacer</Link>}
      </form>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card><CardContent className="pt-0">
          {prospects.length === 0 ? <p className="py-6 text-[13.5px] text-text-secondary">Aucun dossier ne correspond.</p> : (
            <ul className="divide-y divide-border-subtle">
              {prospects.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-[14px]">
                  <Link href={`/admin/dossiers/${p.id}`} className="font-medium text-text-primary hover:underline">{p.name}</Link>
                  {p.city && <span className="text-text-tertiary">{p.city}</span>}
                  <span aria-hidden="true" className="text-text-tertiary">·</span>
                  <span className="text-text-secondary">{p.salesRep.firstName}</span>
                  <span aria-hidden="true" className="text-text-tertiary">·</span>
                  <ProspectStatusBadge status={p.status} />
                  {p.contracts[0] && <ContractStatusBadge status={p.contracts[0].status} />}
                  {p.nextActionAt && <span className={"ml-auto text-[12.5px] " + (p.nextActionAt < new Date() ? "text-warning-700 dark:text-warning-500" : "text-text-tertiary")}>{p.nextActionLabel ?? "Relance"} · {formatDate(p.nextActionAt)}</span>}
                  {p.blockedAt && <span className="text-[12px] font-medium text-danger-700">suspendu</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent></Card>
        <Card><CardHeader title="Notifications" /><CardContent className="pt-0">
          <ul className="divide-y divide-border-subtle">{notifications.map((n) => <li key={n.id} className="py-2 text-[13px]"><p className="font-medium text-text-primary">{n.linkUrl ? <Link href={n.linkUrl} className="hover:underline">{n.title}</Link> : n.title}</p>{n.body && <p className="text-text-secondary">{n.body}</p>}<p className="text-[11.5px] text-text-tertiary">{formatDateTime(n.createdAt)}</p></li>)}{notifications.length === 0 && <li className="py-3 text-[13px] text-text-secondary">Rien à signaler.</li>}</ul>
        </CardContent></Card>
      </div>
    </>
  );
}
