import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { requirePermission } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { loadConnectionOverview } from "@/server/services/connection-overview";
import { loadRobotSetup } from "@/server/services/robot-setup";
import { resolvePublicBaseUrl } from "@/server/public-url";
import { ONLINE_WITHIN_SECONDS } from "@/core/stock/connection-overview";
import { LGO_DEFINITIONS } from "@/core/stock/connectors";
import type { OverviewSnapshot } from "@/server/actions/stock-sync";
import { AssistanceCode } from "./assistance-code";
import { ConnectionManager } from "./connection-manager";
import { CounterPostsCard } from "./counter-posts";
import { DiagnosticTest } from "./diagnostic-test";
import { RobotDiagnostic } from "./robot-diagnostic";
import { ConnectionSetup } from "./setup";
import { ConnectionSummary } from "./summary";

export const metadata: Metadata = { title: "Ma connexion" };

/**
 * Ma connexion — une seule page, trois étapes : installer sur mes comptoirs, envoyer mon stock, connecter mon
 * robot (facultatif). Elle remplace « Mise en service », « Connecter mon logiciel » et l'assistant d'accueil.
 *
 * Tout ce qui est technique — l'état détaillé, le test de connexion, les postes, le serveur, les dossiers, le
 * robot — est dans « Diagnostic technique », replié : c'est pour l'assistance, pas pour installer. Rien n'a été
 * retiré. (« ?avance=1 » ouvre le diagnostic : les anciennes adresses y arrivent.)
 */
export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ avance?: string; diagnostic?: string }> }) {
  const session = await requirePermission(PERMISSIONS.PRODUCT_IMPORT);
  const { avance, diagnostic } = await searchParams;
  const [loaded, robot] = await Promise.all([loadConnectionOverview(session.scope.pharmacyId), loadRobotSetup(session.scope.pharmacyId)]);
  const serverUrl = resolvePublicBaseUrl().url;
  const { connection, posts, overview } = loaded;
  const snapshot = JSON.parse(JSON.stringify({ overview, lgo: loaded.lgo })) as OverviewSnapshot;
  const serverItem = overview.agent.items.find((item) => item.kind === "server");
  const postsOnline = overview.agent.items.filter((item) => item.kind === "post" && item.online).length;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 pb-20">
      <ConnectionSetup initial={snapshot} lgos={LGO_DEFINITIONS} robot={robot} userEmail={session.user.email} />

      <details id="diagnostic" open={avance === "1" || diagnostic === "1"} className="group rounded-2xl border border-border-subtle bg-surface-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none">
          <span>
            <span className="block text-[16px] font-semibold text-text-primary">Diagnostic technique</span>
            <span className="block text-[13.5px] text-text-secondary">Pour l&apos;assistance PharmaBoost. Rien à faire ici pour installer.</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-text-tertiary transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="space-y-8 border-t border-border-subtle px-4 py-5 sm:px-5">
          <section className="space-y-3">
            <h2 className="text-[15px] font-semibold text-text-primary">État</h2>
            <ConnectionSummary overview={overview} canOpen={false} />
            <p className="text-[12.5px] text-text-tertiary">Un appareil est « en ligne » s&apos;il a donné signe de vie depuis moins de {ONLINE_WITHIN_SECONDS / 60} minutes.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-[15px] font-semibold text-text-primary">Test de connexion</h2>
            <DiagnosticTest salesFollowed={overview.sales.state === "FOLLOWED" || overview.sales.state === "WAITING_SCAN"} scanCount={overview.sales.scanCount} />
          </section>

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
            <AssistanceCode />
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

          <section className="space-y-3">
            <h2 className="text-[15px] font-semibold text-text-primary">Robot</h2>
            <RobotDiagnostic robot={robot} lgo={loaded.lgo} postsOnline={postsOnline} />
          </section>

          <section className="space-y-2">
            <h2 className="text-[15px] font-semibold text-text-primary">Autres outils</h2>
            <ul className="space-y-1.5 text-[14px]">
              <li><Link href="/stock/import" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">Importer un fichier avec l&apos;aperçu des colonnes</Link></li>
              <li><Link href="/stock/mise-a-jour" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">Mes derniers envois de stock</Link></li>
              <li><Link href="/stock/historique" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">Historique des mouvements de stock</Link></li>
              <li><Link href="/connexion/guide" className="font-medium text-brand-700 underline underline-offset-2 dark:text-brand-400">Guide pas à pas, avec schémas</Link></li>
            </ul>
          </section>
        </div>
      </details>
    </div>
  );
}
