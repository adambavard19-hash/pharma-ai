import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { prisma } from "@/server/db/client";
import { getProspectFor } from "@/server/services/sales/prospects";
import { defaultDemoInput, defaultFollowUpInput } from "@/core/sales/board";
import { ProspectDetail } from "@/components/sales/prospect-detail";
import { AdminActionsPanel } from "./admin-actions";
import { ContractPanel } from "@/components/sales/contract-panel";
import { contractPanelData } from "@/server/services/sales/contract-panel-data";
import { InvitationPanel } from "./invitation-panel";
import { DossierCommercialPanel } from "./commercial-panel";

export const metadata: Metadata = { title: "Dossier commercial" };

export default async function AdminProspectPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformSession();
  const { id } = await params;
  const [prospect, reps] = await Promise.all([getProspectFor(id, { kind: "ADMIN" }), prisma.salesRep.findMany({ where: { isActive: true }, orderBy: { lastName: "asc" }, select: { id: true, firstName: true, lastName: true } })]);
  if (!prospect) notFound();
  const panel = await contractPanelData(prospect);
  const now = new Date();
  return (
    <div className="space-y-4">
      <nav aria-label="Fil d'Ariane" className="flex flex-wrap items-center gap-1 text-[12.5px] text-text-tertiary">
        <Link href="/admin/pipeline" className="hover:text-text-primary">Commercial</Link>
        <ChevronRight className="size-3.5" aria-hidden="true" />
        <Link href="/admin/prospects" className="hover:text-text-primary">Prospects</Link>
        <ChevronRight className="size-3.5" aria-hidden="true" />
        <span className="max-w-[40ch] truncate text-text-secondary" aria-current="page">{prospect.name}</span>
      </nav>
      <ProspectDetail
        prospect={prospect}
        mode="admin"
        pharmacyHref={prospect.pharmacyId ? `/admin/pharmacies/${prospect.pharmacyId}` : null}
        actions={
          <>
            <DossierCommercialPanel
              prospect={{ id: prospect.id, name: prospect.name, status: prospect.status, demoAt: prospect.demoAt, demoDoneAt: prospect.demoDoneAt, nextActionAt: prospect.nextActionAt, nextActionLabel: prospect.nextActionLabel, repName: prospect.salesRep ? `${prospect.salesRep.firstName} ${prospect.salesRep.lastName}` : null }}
              tasks={prospect.tasks.filter((t) => !t.doneAt).map((t) => ({ id: t.id, label: t.label, dueAt: t.dueAt }))}
              now={now}
              defaultDemoAt={defaultDemoInput(now)}
              defaultDue={defaultFollowUpInput(now)}
            />
            <InvitationPanel prospectId={prospect.id} />
            <ContractPanel mode="admin" data={panel} />
            <AdminActionsPanel prospect={{ id: prospect.id, status: prospect.status, blocked: Boolean(prospect.blockedAt), salesRepId: prospect.salesRepId, pharmacyId: prospect.pharmacyId, contracts: prospect.contracts.map((c) => ({ id: c.id, version: c.version, status: c.status, providerEnvelopeId: c.providerEnvelopeId })), commissions: prospect.commissions.map((c) => ({ id: c.id, amountCents: c.amountCents, status: c.status, dueAt: c.dueAt?.toISOString().slice(0, 10) ?? "", note: c.note ?? "" })) }} reps={reps} />
          </>
        }
      />
    </div>
  );
}
