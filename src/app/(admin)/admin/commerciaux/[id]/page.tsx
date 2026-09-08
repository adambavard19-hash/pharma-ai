import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { prisma } from "@/server/db/client";
import { salesRepStats } from "@/server/services/sales/reps";
import { listProspects } from "@/server/services/sales/prospects";
import { describeCommissionRule } from "@/core/sales/commission";
import { PageHeader, Grid } from "@/components/ui/page";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProspectStatusBadge } from "@/components/sales/status-badge";
import { formatCents, formatDateTime, formatPercent } from "@/lib/format";
import { EditSalesRepButton } from "../rep-form";
import { InviteButton } from "./invite-button";

export const metadata: Metadata = { title: "Commercial" };

export default async function SalesRepPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePlatformSession();
  const rep = await prisma.salesRep.findUnique({ where: { id } });
  if (!rep) notFound();
  const [stats, prospects, events] = await Promise.all([
    salesRepStats(rep.id),
    listProspects({ salesRepId: rep.id }),
    prisma.prospectEvent.findMany({ where: { prospect: { salesRepId: rep.id } }, orderBy: { createdAt: "desc" }, take: 15, include: { prospect: { select: { id: true, name: true } } } }),
  ]);
  return (
    <>
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}><Link href="/admin/commerciaux">Commerciaux</Link></Button>
      <PageHeader
        title={`${rep.firstName} ${rep.lastName}`}
        description={`${rep.email}${rep.phone ? ` · ${rep.phone}` : ""}${rep.zone ? ` · ${rep.zone}` : ""} · ${describeCommissionRule({ type: rep.commissionType, value: rep.commissionValue })}`}
        actions={<div className="flex flex-wrap gap-2"><Badge tone={rep.isActive ? "success" : "neutral"}>{rep.isActive ? "Actif" : "Inactif"}</Badge><InviteButton salesRepId={rep.id} invited={Boolean(rep.invitedAt)} /><EditSalesRepButton salesRepId={rep.id} initial={{ firstName: rep.firstName, lastName: rep.lastName, email: rep.email, phone: rep.phone ?? "", zone: rep.zone ?? "", commissionType: rep.commissionType, commissionValue: (rep.commissionValue / 100).toString().replace(".", ","), isActive: rep.isActive }} /></div>}
      />
      <Grid cols={4}>
        <StatCard label="Prospects" value={String(stats.prospects)} sublabel={`${stats.openProspects} en cours`} />
        <StatCard label="Taux de conversion" value={formatPercent(stats.conversionRate)} sublabel={`${stats.contractsSigned} signé(s) · ${stats.contractsSent} envoyé(s)`} />
        <StatCard label="Pharmacies activées" value={String(stats.activated)} sublabel={`${stats.lost} perdu(s)`} />
        <StatCard label="Commissions" value={formatCents(stats.commissionEarnedCents)} sublabel={`dues · ${formatCents(stats.commissionPaidCents)} payées`} emphasis="accent" />
      </Grid>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader title="Dossiers" /><CardContent className="pt-0">
          {prospects.length === 0 ? <p className="py-3 text-[13.5px] text-text-secondary">Aucun dossier.</p> : <ul className="divide-y divide-border-subtle">{prospects.map((p) => <li key={p.id} className="flex items-center gap-3 py-2.5 text-[14px]"><Link href={`/admin/dossiers/${p.id}`} className="min-w-0 flex-1 truncate font-medium text-text-primary hover:underline">{p.name}{p.city ? <span className="font-normal text-text-tertiary"> · {p.city}</span> : null}</Link><ProspectStatusBadge status={p.status} /></li>)}</ul>}
        </CardContent></Card>
        <Card><CardHeader title="Activité récente" /><CardContent className="pt-0">
          <ul className="divide-y divide-border-subtle">{events.map((e) => <li key={e.id} className="py-2 text-[13px]"><span className="text-text-tertiary tabular">{formatDateTime(e.createdAt)}</span> · <Link href={`/admin/dossiers/${e.prospect.id}`} className="font-medium text-text-primary hover:underline">{e.prospect.name}</Link> — <span className="text-text-secondary">{e.summary}</span></li>)}{events.length === 0 && <li className="py-3 text-[13.5px] text-text-secondary">Rien encore.</li>}</ul>
        </CardContent></Card>
      </div>
    </>
  );
}
