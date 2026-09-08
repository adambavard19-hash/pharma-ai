import type { Metadata } from "next";
import Link from "next/link";
import { requireSalesSession } from "@/server/auth/sales-session";
import { listCommissionsFor } from "@/server/services/sales/commissions";
import { Card, CardContent } from "@/components/ui/card";
import { CommissionStatusBadge } from "@/components/sales/status-badge";
import { formatCents, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: { absolute: "Mes commissions — PharmaBoost" } };

export default async function SalesCommissionsPage() {
  const session = await requireSalesSession();
  const data = await listCommissionsFor(session.rep.id);
  const kpis = [["Ce mois", data.thisMonthCents], ["Acquises", data.earnedCents], ["En attente", data.pendingCents], ["Payées", data.paidCents], ["Total année", data.yearCents]] as const;
  return (
    <>
      <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-text-primary">Mes commissions</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {kpis.map(([label, cents]) => <Card key={label}><CardContent className="py-3.5"><p className="text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase">{label}</p><p className="mt-1 text-[22px] leading-none font-semibold tabular text-text-primary">{formatCents(cents)}</p></CardContent></Card>)}
      </div>
      <Card><CardContent className="pt-0">
        {data.rows.length === 0 ? <p className="py-6 text-[13.5px] text-text-secondary">Aucune commission pour l&apos;instant : elle apparaît à l&apos;envoi d&apos;un contrat.</p> : (
          <div className="overflow-x-auto"><table className="w-full text-[13.5px]">
            <thead><tr className="text-left text-[11.5px] font-semibold tracking-wide text-text-tertiary uppercase"><th className="py-2.5 pr-3">Pharmacie</th><th className="py-2.5 pr-3">Date signature</th><th className="py-2.5 pr-3 text-right">Montant</th><th className="py-2.5 pr-3">Statut</th><th className="py-2.5">Date paiement</th></tr></thead>
            <tbody className="divide-y divide-border-subtle">
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td className="py-2.5 pr-3"><Link href={`/extranet/dossiers/${row.prospect.id}`} className="font-medium text-text-primary hover:underline">{row.prospect.name}</Link></td>
                  <td className="py-2.5 pr-3 text-text-secondary">{row.prospect.contracts[0]?.finalizedAt ? formatDate(row.prospect.contracts[0].finalizedAt) : "—"}</td>
                  <td className="py-2.5 pr-3 text-right font-semibold tabular text-text-primary">{formatCents(row.amountCents)}</td>
                  <td className="py-2.5 pr-3"><CommissionStatusBadge status={row.status} /></td>
                  <td className="py-2.5 text-text-secondary">{row.paidAt ? formatDate(row.paidAt) : row.dueAt ? `prévu ${formatDate(row.dueAt)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </CardContent></Card>
    </>
  );
}
