import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getConnection } from "@/server/services/stock-sync";
import { LGO_DEFINITIONS } from "@/core/stock/connectors";
import { PageHeader } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { resolvePublicBaseUrl } from "@/server/public-url";
import { ConnectionManager } from "./connection-manager";

export const metadata: Metadata = { title: "Connecter mon logiciel" };

/**
 * Relier le logiciel de gestion de l'officine à PharmaBoost.
 *
 * Le titulaire choisit son LGO, reçoit un code, installe l'agent sur le
 * serveur de l'officine avec ce code. À partir de là, le stock se synchronise
 * seul et le comptoir sait toujours de quand il date.
 */
export default async function StockConnectionPage() {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const connection = await getConnection(session.scope.pharmacyId);
  const serverUrl = resolvePublicBaseUrl().url;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/stock">Retour au stock</Link>
      </Button>
      <PageHeader
        title="Connecter mon logiciel"
        description="Un petit programme, PharmaBoost Connect, s'installe sur le serveur de l'officine. Il lit l'export de stock que votre logiciel produit et le synchronise en continu. Il n'écrit jamais dans votre logiciel."
      />
      <ConnectionManager
        lgos={LGO_DEFINITIONS}
        serverUrl={serverUrl}
        connection={
          connection
            ? {
                ...connection,
                lastSeenAt: connection.lastSeenAt?.toISOString() ?? null,
                lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
                pairedAt: connection.pairedAt?.toISOString() ?? null,
                pairingExpiresAt: connection.pairingExpiresAt?.toISOString() ?? null,
              }
            : null
        }
      />
    </div>
  );
}
