import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireSalesSession } from "@/server/auth/sales-session";
import { listProspects } from "@/server/services/sales/prospects";
import { PROSPECT_STATUSES, PROSPECT_STATUS_LABELS } from "@/core/sales/pipeline";
import { Button } from "@/components/ui/button";
import { ProspectCard } from "@/components/sales/prospect-card";

export const metadata: Metadata = { title: { absolute: "Pipeline — PharmaBoost" } };

/**
 * Le pipeline : une colonne par étape, chaque pharmacie une carte. Sur mobile,
 * les colonnes défilent horizontalement, chacune tenant l'écran ; l'étape
 * change depuis la fiche, en un geste.
 */
export default async function SalesPipelinePage() {
  const session = await requireSalesSession();
  const prospects = await listProspects({ salesRepId: session.rep.id });
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-text-primary">Pipeline</h1><p className="text-[13px] text-text-secondary">{prospects.length} dossier{prospects.length > 1 ? "s" : ""}</p></div>
        <Button asChild size="sm" leadingIcon={<Plus className="size-4" />}><Link href="/extranet/dossiers/nouveau">Nouvelle pharmacie</Link></Button>
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {PROSPECT_STATUSES.map((status) => {
          const column = prospects.filter((p) => p.status === status);
          return (
            <section key={status} className="w-[85vw] shrink-0 snap-start sm:w-[280px]" aria-label={PROSPECT_STATUS_LABELS[status]}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="text-[12.5px] font-semibold tracking-wide text-text-secondary uppercase">{PROSPECT_STATUS_LABELS[status]}</h2>
                <span className="text-[12px] text-text-tertiary tabular">{column.length}</span>
              </div>
              <div className="space-y-2.5 rounded-2xl bg-surface-sunken/60 p-2 min-h-[120px]">
                {column.map((p) => (
                  <ProspectCard key={p.id} href={`/extranet/dossiers/${p.id}`} prospect={{ id: p.id, name: p.name, city: p.city, ownerName: p.ownerName, phone: p.phone, email: p.email, status: p.status, nextActionAt: p.nextActionAt, nextActionLabel: p.nextActionLabel }} />
                ))}
                {column.length === 0 && <p className="px-2 py-6 text-center text-[12.5px] text-text-tertiary">Aucun dossier</p>}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
