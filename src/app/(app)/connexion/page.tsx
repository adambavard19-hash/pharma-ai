import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadConnectionOverview } from "@/server/services/connection-overview";
import { resolvePublicBaseUrl } from "@/server/public-url";
import { ONLINE_WITHIN_SECONDS } from "@/core/stock/connection-overview";
import { LGO_DEFINITIONS } from "@/core/stock/connectors";
import type { OverviewSnapshot } from "@/server/actions/stock-sync";
import { ConnectAssistant } from "./assistant";
import { ConnectionManager } from "./connection-manager";
import { CounterPostsCard } from "./counter-posts";

export const metadata: Metadata = { title: "Connecter ma pharmacie" };

/**
 * Connecter ma pharmacie — la page unique : le logiciel, le stock, le poste de
 * comptoir. Elle remplace « Mise en service », « Connecter mon logiciel » et
 * l'assistant d'accueil, qui disaient trois fois la même chose en trois endroits.
 *
 * Ce qu'on lit en dix secondes est en haut (l'assistant). Tout ce qui est
 * technique — les postes, le serveur, les dossiers, les lignes de commande —
 * est dans « Avancé », rien n'a été retiré.
 */
export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ avance?: string }> }) {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const { avance } = await searchParams;
  const loaded = await loadConnectionOverview(session.scope.pharmacyId);
  const serverUrl = resolvePublicBaseUrl().url;
  const { connection, posts } = loaded;
  const snapshot = JSON.parse(JSON.stringify({ overview: loaded.overview, lgo: loaded.lgo })) as OverviewSnapshot;
  const serverItem = loaded.overview.agent.items.find((item) => item.kind === "server");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-[30px] leading-9 font-semibold tracking-[-0.02em] text-text-primary">Connecter ma pharmacie</h1>
        <p className="text-[15px] leading-6 text-text-secondary">Un seul parcours guidé. Aucune connaissance informatique nécessaire.</p>
      </header>

      <ConnectAssistant lgos={LGO_DEFINITIONS} initial={snapshot} serverUrl={serverUrl} />

      <details id="avance" open={avance === "1"} className="group rounded-2xl border border-border-subtle bg-surface-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
          <span>
            <span className="block text-[16px] font-semibold text-text-primary">Avancé</span>
            <span className="block text-[13.5px] text-text-secondary">Postes, serveur, dossiers, lignes de commande : pour l&apos;informaticien.</span>
          </span>
          <ChevronDown className="size-4 text-text-tertiary transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="space-y-8 border-t border-border-subtle px-5 py-5">
          <section className="space-y-3">
            <h2 className="text-[15px] font-semibold text-text-primary">Postes de comptoir</h2>
            <CounterPostsCard
              posts={posts.map((post) => ({
                id: post.id,
                label: post.label,
                hostname: post.hostname,
                paired: Boolean(post.pairedAt),
                pairingExpiresAt: post.pairingExpiresAt?.toISOString() ?? null,
                lastSeenAt: post.lastSeenAt?.toISOString() ?? null,
                lastScanAt: post.lastScanAt?.toISOString() ?? null,
                scanCount: post.scanCount,
                version: post.version,
                exportPath: post.exportPath,
                lastExportAt: post.lastExportAt?.toISOString() ?? null,
                lastExportError: post.lastExportError,
              }))}
            />
          </section>
          <section className="space-y-3">
            <h2 className="text-[15px] font-semibold text-text-primary">Serveur de l&apos;officine</h2>
            <ConnectionManager
              serverUrl={serverUrl}
              lgo={loaded.lgo}
              connection={
                connection && serverItem
                  ? {
                      lgo: connection.lgo,
                      lgoLabel: connection.lgoLabel,
                      hostname: connection.hostname,
                      agentVersion: connection.agentVersion,
                      exportPath: connection.exportPath,
                      scansPath: connection.scansPath,
                      intervalSeconds: connection.intervalSeconds,
                      lastSeenAt: connection.lastSeenAt?.toISOString() ?? null,
                      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
                      lastSyncLines: connection.lastSyncLines,
                      lastError: connection.lastError,
                      online: serverItem.online,
                      seenAgeSeconds: serverItem.seenAgeSeconds,
                    }
                  : null
              }
            />
          </section>
          <section className="space-y-2">
            <h2 className="text-[15px] font-semibold text-text-primary">Autres outils</h2>
            <ul className="space-y-1.5 text-[14px]">
              <li><Link href="/stock/import" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">Importer un fichier avec l&apos;aperçu des colonnes</Link></li>
              <li><Link href="/stock/mise-a-jour" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">Mes derniers envois de stock</Link></li>
              <li><Link href="/stock/historique" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">Historique des mouvements de stock</Link></li>
              <li><Link href="/connexion/guide" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">Guide pas à pas, avec schémas</Link></li>
            </ul>
            <p className="text-[12.5px] text-text-tertiary">Un appareil est « en ligne » s&apos;il a donné signe de vie depuis moins de {ONLINE_WITHIN_SECONDS / 60} minutes.</p>
          </section>
        </div>
      </details>

      <p className="text-center text-[13.5px] text-text-secondary">
        Pour bien démarrer : <Link href="/bienvenue" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">compléter mon officine</Link> · <Link href="/equipe" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">inviter mon équipe</Link> · <Link href="/connexion/guide" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">guide pas à pas</Link>
      </p>
    </div>
  );
}
