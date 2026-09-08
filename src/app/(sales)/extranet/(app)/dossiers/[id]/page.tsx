import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireSalesSession } from "@/server/auth/sales-session";
import { getProspectFor } from "@/server/services/sales/prospects";
import { Button } from "@/components/ui/button";
import { ProspectDetail } from "@/components/sales/prospect-detail";
import { SalesActionsPanel } from "./actions-panel";

export const metadata: Metadata = { title: { absolute: "Dossier — PharmaBoost" } };

export default async function SalesProspectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSalesSession();
  // Isolation : un dossier d'un autre commercial n'existe pas ici.
  const prospect = await getProspectFor(id, { kind: "SALES", salesRepId: session.rep.id });
  if (!prospect) notFound();
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}><Link href="/extranet/pipeline">Pipeline</Link></Button>
      <ProspectDetail
        prospect={prospect}
        mode="sales"
        actions={<SalesActionsPanel prospect={{ id: prospect.id, status: prospect.status, blocked: Boolean(prospect.blockedAt), contracts: prospect.contracts.map((c) => ({ id: c.id, version: c.version, status: c.status })), pharmacyId: prospect.pharmacyId, monthlyPriceCents: prospect.monthlyPriceCents, ownerName: prospect.ownerName, email: prospect.email, addressLine1: prospect.addressLine1, city: prospect.city }} />}
      />
    </div>
  );
}
