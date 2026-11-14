import type { Metadata } from "next";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { bloodReadingAvailable } from "@/server/services/blood-test";
import { PageHeader } from "@/components/ui/page";
import { BloodTestReader } from "./blood-test-reader";

export const metadata: Metadata = { title: "Prise de sang" };

/**
 * « Prise de sang » (fondateur, 14 nov. 2026) : le patient vient faire lire ses résultats ; PharmaBoost repère ce que le
 * laboratoire signale hors normes et propose les compléments SANS ORDONNANCE du stock, selon les règles validées par Donna.
 * Rien n'est enregistré (pas d'hébergement HDS).
 */
export default async function BloodTestPage() {
  const session = await requirePermission(PERMISSIONS.PRESCRIPTION_CREATE);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Prise de sang" description="Les compléments sans ordonnance à proposer quand le laboratoire signale une vitamine ou un minéral bas." />
      <BloodTestReader available={bloodReadingAvailable() && !session.scope.isDemo} />
    </div>
  );
}
