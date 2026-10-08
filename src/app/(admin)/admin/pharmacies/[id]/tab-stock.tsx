import { Inbox } from "lucide-react";
import { listDepositsForConsole } from "@/server/services/stock-deposits";
import { AdminSection } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import type { Pharmacy360 } from "@/server/services/admin/pharmacy-360";
import Link from "next/link";
import { DepositFileRow } from "../../depots-stock/_components/deposit-file-row";
import { DepositForPharmacy } from "../../depots-stock/_components/deposit-for-pharmacy";
import { FreshnessBadge } from "../../depots-stock/_components/status";
import { When } from "../client-ui";
import { EmptyLine } from "./shared";

/**
 * Le stock de CETTE officine : quand il est arrivé, comment, et les derniers fichiers reçus. L'équipe n'a un geste à faire que
 * si un fichier attend sa décision (trop petit pour être appliqué seul) ou est illisible — ou pour déposer le stock à la place
 * du titulaire. La liste de toutes les officines reste disponible dans « Stocks reçus ».
 */
export async function StockSection({ base, now }: { base: Pharmacy360; now: Date }) {
  const { pharmacy } = base;
  const deposits = await listDepositsForConsole({ pharmacyId: pharmacy.id, limit: 6 });
  return (
    <AdminSection
      id="stock"
      title="Stock reçu"
      description="Le stock se met à jour tout seul à la réception : vous n'intervenez que si un fichier vous attend, ou pour le déposer à la place du titulaire."
      action={<DepositForPharmacy pharmacyId={pharmacy.id} pharmacyName={pharmacy.name} />}
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <FreshnessBadge syncedAt={pharmacy.stockSyncedAt} now={now} />
        <p className="text-[13.5px] text-text-primary">
          Dernier stock reçu : <When date={pharmacy.stockSyncedAt} empty="aucun pour l'instant" />
        </p>
      </div>
      {deposits.length === 0 ? (
        <div className="mt-3 flex items-start gap-2">
          <Inbox className="mt-0.5 size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
          <EmptyLine>Aucun fichier reçu pour l&apos;instant. Le titulaire peut l&apos;envoyer depuis son espace, ou vous le déposez ici.</EmptyLine>
        </div>
      ) : (
        <>
          <ul className="-mb-4 mt-2 divide-y divide-border-subtle">
            {deposits.map((deposit) => (
              <DepositFileRow key={deposit.id} deposit={deposit} showPharmacy={false} />
            ))}
          </ul>
          <div className="mt-4 border-t border-border-subtle pt-3">
            <Button asChild variant="ghost" size="sm">
              <Link href="/admin/depots-stock?etat=tous">Les fichiers de toutes les officines</Link>
            </Button>
          </div>
        </>
      )}
    </AdminSection>
  );
}
