import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { prisma } from "@/server/db/client";
import { getProspectFor } from "@/server/services/sales/prospects";
import { Button } from "@/components/ui/button";
import { ProspectDetail } from "@/components/sales/prospect-detail";
import { AdminActionsPanel } from "./admin-actions";

export const metadata: Metadata = { title: "Dossier commercial" };

export default async function AdminProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePlatformSession();
  const [prospect, reps] = await Promise.all([getProspectFor(id, { kind: "ADMIN" }), prisma.salesRep.findMany({ where: { isActive: true }, orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true } })]);
  if (!prospect) notFound();
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}><Link href="/admin/pipeline">Pipeline</Link></Button>
      <ProspectDetail
        prospect={prospect}
        mode="admin"
        pharmacyHref={prospect.pharmacyId ? `/admin/pharmacies/${prospect.pharmacyId}` : null}
        actions={<AdminActionsPanel prospect={{ id: prospect.id, status: prospect.status, blocked: Boolean(prospect.blockedAt), salesRepId: prospect.salesRepId, pharmacyId: prospect.pharmacyId, contracts: prospect.contracts.map((c) => ({ id: c.id, version: c.version, status: c.status })), commissions: prospect.commissions.map((c) => ({ id: c.id, amountCents: c.amountCents, status: c.status, dueAt: c.dueAt?.toISOString().slice(0, 10) ?? "", note: c.note ?? "" })) }} reps={reps} />}
      />
    </div>
  );
}
