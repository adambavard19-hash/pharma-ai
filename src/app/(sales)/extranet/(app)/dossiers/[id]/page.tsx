import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSalesSession } from "@/server/auth/sales-session";
import { getProspectFor } from "@/server/services/sales/prospects";
import { Button } from "@/components/ui/button";
import { ProspectDetail } from "@/components/sales/prospect-detail";
import { SalesActionsPanel } from "./actions-panel";
import { ContractPanel } from "@/components/sales/contract-panel";
import { contractPanelData } from "@/server/services/sales/contract-panel-data";

export const metadata: Metadata = { title: { absolute: "Dossier — PharmaBoost" } };

export default async function SalesProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSalesSession();
  // Isolation : un dossier d'un autre commercial n'existe pas ici.
  const prospect = await getProspectFor(id, { kind: "SALES", salesRepId: session.rep.id });
  if (!prospect) notFound();
  const panel = await contractPanelData(prospect);
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}><Link href="/extranet/pipeline">Pipeline</Link></Button>
      <ProspectDetail
        prospect={prospect}
        mode="sales"
        actions={<><SalesActionsPanel prospect={{ id: prospect.id, status: prospect.status, blocked: Boolean(prospect.blockedAt) }} /><ContractPanel mode="sales" data={panel} /></>}
      />
    </div>
  );
}
