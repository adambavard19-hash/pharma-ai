import type { Metadata } from "next";
import Link from "next/link";
import { requirePlatformSession } from "@/server/auth/platform-session";
import { prisma } from "@/server/db/client";
import { salesRepStats } from "@/server/services/sales/reps";
import { describeCommissionRule } from "@/core/sales/commission";
import { PageHeader } from "@/components/ui/page";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCents, formatDate, formatPercent } from "@/lib/format";
import { CreateSalesRepButton } from "./rep-form";

export const metadata: Metadata = { title: "Commerciaux" };

export default async function SalesRepsPage() {
  await requirePlatformSession();
  const reps = await prisma.salesRep.findMany({ orderBy: [{ isActive: "desc" }, { lastName: "asc" }] });
  const stats = await Promise.all(reps.map((rep) => salesRepStats(rep.id)));
  return (
    <>
      <PageHeader title="Commerciaux" description="Comptes, zones, règles de commission et résultats." actions={<CreateSalesRepButton />} />
      <Card><CardContent className="pt-0">
        {reps.length === 0 ? <p className="py-6 text-[13.5px] text-text-secondary">Aucun commercial. Créez le premier compte : il recevra une invitation par e-mail.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-[13.5px]">
            <thead><tr className="text-left text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase"><th className="py-2.5 pr-3">Commercial</th><th className="py-2.5 pr-3">Zone</th><th className="py-2.5 pr-3 text-right">Prospects</th><th className="py-2.5 pr-3 text-right">Conversion</th><th className="py-2.5 pr-3 text-right">Envoyés</th><th className="py-2.5 pr-3 text-right">Signés</th><th className="py-2.5 pr-3 text-right">Activées</th><th className="py-2.5 pr-3 text-right">Comm. dues</th><th className="py-2.5 pr-3 text-right">Comm. payées</th><th className="py-2.5">Statut</th></tr></thead>
            <tbody className="divide-y divide-border-subtle">
              {reps.map((rep, i) => (
                <tr key={rep.id}>
                  <td className="py-2.5 pr-3"><Link href={`/admin/commerciaux/${rep.id}`} className="font-medium text-text-primary hover:underline">{rep.firstName} {rep.lastName}</Link><span className="block text-[12px] text-text-tertiary">{rep.email} · {describeCommissionRule({ type: rep.commissionType, value: rep.commissionValue })}</span></td>
                  <td className="py-2.5 pr-3 text-text-secondary">{rep.zone ?? "—"}</td>
                  <td className="py-2.5 pr-3 text-right tabular">{stats[i].prospects}</td>
                  <td className="py-2.5 pr-3 text-right tabular">{formatPercent(stats[i].conversionRate)}</td>
                  <td className="py-2.5 pr-3 text-right tabular">{stats[i].contractsSent}</td>
                  <td className="py-2.5 pr-3 text-right tabular">{stats[i].contractsSigned}</td>
                  <td className="py-2.5 pr-3 text-right tabular">{stats[i].activated}</td>
                  <td className="py-2.5 pr-3 text-right tabular">{formatCents(stats[i].commissionEarnedCents)}</td>
                  <td className="py-2.5 pr-3 text-right tabular">{formatCents(stats[i].commissionPaidCents)}</td>
                  <td className="py-2.5"><Badge tone={rep.isActive ? "success" : "neutral"}>{rep.isActive ? "Actif" : "Inactif"}</Badge>{rep.invitedAt && !rep.lastLoginAt && <span className="block text-[11.5px] text-text-tertiary">invité le {formatDate(rep.invitedAt)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </CardContent></Card>
    </>
  );
}
