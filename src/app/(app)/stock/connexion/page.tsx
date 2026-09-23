import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { getConnection, listCounterPosts } from "@/server/services/stock-sync";
import { CounterPostsCard } from "./counter-posts";
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
  const [connection, posts] = await Promise.all([getConnection(session.scope.pharmacyId), listCounterPosts(session.scope.pharmacyId)]);
  const serverUrl = resolvePublicBaseUrl().url;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm" leadingIcon={<ArrowLeft className="size-4" />}>
        <Link href="/stock">Retour au stock</Link>
      </Button>
      <p className="rounded-xl border border-brand-200 bg-brand-50/60 px-4 py-2.5 text-[13px] text-text-secondary dark:border-brand-800 dark:bg-brand-950/30">
        Première fois ? <Link href="/bienvenue?etape=2" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">L&apos;assistant pas à pas</Link> vous montre où cliquer dans votre logiciel, puis attend l&apos;agent avec vous.
      </p>
      <PageHeader
        title="Connecter mon logiciel"
        description="Un petit programme, PharmaBoost Connect, s'installe sur le serveur de l'officine. Il lit l'export de stock que votre logiciel produit et le synchronise en continu. Il n'écrit jamais dans votre logiciel."
      />
      <CounterPostsCard
        serverUrl={serverUrl}
        posts={posts.map((post) => ({ id: post.id, label: post.label, hostname: post.hostname, paired: Boolean(post.pairedAt), pairingExpiresAt: post.pairingExpiresAt?.toISOString() ?? null, lastSeenAt: post.lastSeenAt?.toISOString() ?? null, lastScanAt: post.lastScanAt?.toISOString() ?? null, scanCount: post.scanCount, version: post.version }))}
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
