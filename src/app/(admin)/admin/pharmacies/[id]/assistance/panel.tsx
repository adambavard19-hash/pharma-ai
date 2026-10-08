import Link from "next/link";
import { loadConnectionOverview } from "@/server/services/connection-overview";
import { loadRobotSetup } from "@/server/services/robot-setup";
import { installerStatus } from "@/server/services/installer-file";
import { AdminSection } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { ONLINE_WITHIN_SECONDS } from "@/core/stock/connection-overview";
import { formatNumber } from "@/lib/format";
import { ConnectionSummary } from "@/app/(app)/connexion/summary";
import { AssistancePairingCode } from "./pairing-code";
import { AssistancePosts } from "./posts";
import { AssistanceRobot } from "./robot";
import { AssistanceServer } from "./server";
import { AssistanceTest } from "./test";

/**
 * L'espace d'assistance de la fiche officine : tout le technique de la connexion — l'installateur Windows, l'état
 * détaillé, le test de connexion, les comptoirs (dossiers d'export, relecture, retrait, code), le serveur et le robot.
 * Le pharmacien n'en voit rien : sa page « Installer PharmaBoost » n'a que trois blocs. Ici, un administrateur
 * de la plateforme, connecté à la console, agit au nom de l'assistance ; chaque geste est journalisé sous son nom.
 */
export async function AssistancePanel({ pharmacyId }: { pharmacyId: string }) {
  const [loaded, robot, installer] = await Promise.all([loadConnectionOverview(pharmacyId), loadRobotSetup(pharmacyId), installerStatus()]);
  const { overview, connection, posts } = loaded;
  const serverItem = overview.agent.items.find((item) => item.kind === "server");
  const postsOnline = overview.agent.items.filter((item) => item.kind === "post" && item.online).length;

  return (
    <AdminSection title="Assistance : connexion de l'officine" description="Réservé à l'assistance PharmaBoost. Le pharmacien ne voit ni dossier, ni code, ni réglage.">
      <div className="space-y-8">
        <section className="space-y-2">
          <h3 className="text-[15px] font-semibold text-text-primary">Installateur Windows</h3>
          {installer.available ? (
            <p className="text-[13.5px] leading-5 text-text-secondary">
              <Badge tone="success">Disponible</Badge> Version {installer.version}, PharmaBoost Connect {installer.agent}, {formatNumber(installer.bytes)} octets, empreinte SHA-256 <code className="font-mono text-[12px]">{installer.sha256.slice(0, 16)}…</code> vérifiée.{" "}
              {installer.signed ? "Signé." : <strong className="text-warning-800 dark:text-warning-400">Non signé : Windows peut afficher un avertissement.</strong>} Jamais lancé sur un Windows réel depuis ce poste de développement.
            </p>
          ) : (
            <p className="text-[13.5px] leading-5 text-danger-700 dark:text-danger-400">
              <Badge tone="danger">Indisponible</Badge> {installer.reason} Le bouton « Télécharger PharmaBoost » est remplacé par un message chez les pharmaciens.
            </p>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-[15px] font-semibold text-text-primary">État</h3>
          <ConnectionSummary overview={overview} canOpen={false} />
          <p className="text-[12.5px] text-text-tertiary">Un appareil est « en ligne » s&apos;il a donné signe de vie depuis moins de {ONLINE_WITHIN_SECONDS / 60} minutes.</p>
        </section>

        <section className="space-y-3">
          <h3 className="text-[15px] font-semibold text-text-primary">Test de connexion</h3>
          <AssistanceTest pharmacyId={pharmacyId} salesFollowed={overview.sales.state === "FOLLOWED" || overview.sales.state === "WAITING_SCAN"} scanCount={overview.sales.scanCount} />
        </section>

        <section className="space-y-3">
          <h3 className="text-[15px] font-semibold text-text-primary">Postes de comptoir</h3>
          <AssistancePosts
            pharmacyId={pharmacyId}
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
          <AssistancePairingCode pharmacyId={pharmacyId} />
        </section>

        <section className="space-y-3">
          <h3 className="text-[15px] font-semibold text-text-primary">Serveur de l&apos;officine</h3>
          <AssistanceServer
            pharmacyId={pharmacyId}
            connection={
              connection && serverItem
                ? {
                    lgoLabel: connection.lgoLabel,
                    hostname: connection.hostname,
                    agentVersion: connection.agentVersion,
                    exportPath: connection.exportPath,
                    scansPath: connection.scansPath,
                    intervalSeconds: connection.intervalSeconds,
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
          <h3 className="text-[15px] font-semibold text-text-primary">Robot</h3>
          <AssistanceRobot pharmacyId={pharmacyId} robot={robot} lgo={loaded.lgo} postsOnline={postsOnline} />
        </section>

        <section className="space-y-2">
          <h3 className="text-[15px] font-semibold text-text-primary">Outils</h3>
          <ul className="space-y-1.5 text-[14px]">
            <li><Link href="/admin/depots-stock" className="font-medium text-brand-700 hover:underline dark:text-brand-400">Stocks reçus (décider d&apos;un fichier en attente)</Link></li>
          </ul>
        </section>
      </div>
    </AdminSection>
  );
}
