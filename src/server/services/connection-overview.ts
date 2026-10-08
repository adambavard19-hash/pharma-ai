import "server-only";
import { prisma } from "@/server/db/client";
import { buildConnectionOverview, type ConnectionOverview } from "@/core/stock/connection-overview";
import { getConnection, listCounterPosts, type ConnectionView } from "./stock-sync";
import { listPharmacyDeposits } from "./stock-deposits";
import { linesOfLastStock } from "@/app/(app)/stock/mise-a-jour/view";

/**
 * Tout ce que la page « Connecter ma pharmacie » sait de la connexion, lu une
 * fois et rendu par UNE fonction (`buildConnectionOverview`) : le serveur, le
 * poste de comptoir et le stock reçu y sont trois états séparés.
 *
 * Le nombre de lignes du stock vient du dépôt qui l'a produit, à défaut de la
 * dernière synchronisation du programme quand elle date du même moment : un
 * chiffre qui ne correspond plus au stock affiché n'est pas montré.
 */

const SAME_EVENT_MS = 10 * 60 * 1000;

export type LoadedConnection = {
  overview: ConnectionOverview;
  /** La liaison avec le serveur, pour les réglages avancés ; `null` tant qu'aucun logiciel n'est choisi. */
  connection: ConnectionView | null;
  posts: Awaited<ReturnType<typeof listCounterPosts>>;
  lgo: string | null;
  stockSyncedAt: Date | null;
};

export async function loadConnectionOverview(pharmacyId: string, now: Date = new Date()): Promise<LoadedConnection> {
  const [connection, posts, pharmacy, deposits, lastImport, drugReferences, productReferences] = await Promise.all([
    getConnection(pharmacyId),
    listCounterPosts(pharmacyId),
    prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { stockSyncedAt: true } }),
    listPharmacyDeposits(pharmacyId, 5),
    prisma.importJob.findFirst({ where: { pharmacyId, kind: "STOCK", status: "COMPLETED" }, orderBy: { finishedAt: "desc" }, select: { finishedAt: true } }),
    // Les références réellement en rayon : celles que le comptoir peut conseiller (médicaments + parapharmacie).
    prisma.pharmacyDrugStock.count({ where: { pharmacyId, quantity: { gt: 0 } } }),
    prisma.product.count({ where: { pharmacyId, deletedAt: null, isActive: true, stockItem: { is: { quantity: { gt: 0 } } } } }),
  ]);
  // Comme la page Stock : à défaut de date de réception, la fin du dernier import terminé.
  const stockSyncedAt = pharmacy?.stockSyncedAt ?? lastImport?.finishedAt ?? null;
  let stockLines = linesOfLastStock(stockSyncedAt, deposits);
  if (stockLines === null && stockSyncedAt && connection?.lastSyncAt && connection.lastSyncLines !== null && Math.abs(connection.lastSyncAt.getTime() - stockSyncedAt.getTime()) <= SAME_EVENT_MS) {
    stockLines = connection.lastSyncLines;
  }
  // Les lignes illisibles du fichier qui a produit le stock affiché : même règle que le nombre de lignes.
  const applied = deposits.find((deposit) => deposit.status === "APPLIED");
  const appliedAt = applied ? (applied.appliedAt ?? applied.receivedAt) : null;
  const stockIgnored = applied && appliedAt && stockSyncedAt && Math.abs(appliedAt.getTime() - stockSyncedAt.getTime()) <= SAME_EVENT_MS ? applied.invalid : null;
  const stockReferences = stockSyncedAt ? drugReferences + productReferences : null;
  // Un fichier qui n'a pas été appliqué ne se signale que s'il est le DERNIER envoi : un envoi réussi depuis le remplace.
  const latest = deposits[0] ?? null;
  const stockProblem = latest && (latest.status === "HELD" || latest.status === "FAILED" || latest.status === "REJECTED") ? latest.status : null;

  const overview = buildConnectionOverview({
    now,
    lgo: connection?.lgo ?? null,
    connection: connection && {
      status: connection.status,
      pairedAt: connection.pairedAt,
      lastSeenAt: connection.lastSeenAt,
      lastSyncAt: connection.lastSyncAt,
      lastSyncLines: connection.lastSyncLines,
      lastError: connection.lastError,
      hostname: connection.hostname,
      agentVersion: connection.agentVersion,
      pairingExpiresAt: connection.pairingExpiresAt,
    },
    posts: posts.map((post) => ({
      id: post.id,
      label: post.label,
      hostname: post.hostname,
      pairedAt: post.pairedAt,
      lastSeenAt: post.lastSeenAt,
      lastScanAt: post.lastScanAt,
      scanCount: post.scanCount,
      version: post.version,
      pairingExpiresAt: post.pairingExpiresAt,
      exportPath: post.exportPath,
      lastExportAt: post.lastExportAt,
    })),
    stockSyncedAt,
    stockLines,
    stockProblem,
    stockReferences,
    stockIgnored,
  });
  return { overview, connection, posts, lgo: connection?.lgo ?? null, stockSyncedAt };
}

/**
 * Le choix du logiciel, gardé tel quel : une ligne de liaison « en attente » sans code ni programme. Rien n'est
 * installé, rien n'est annoncé : l'aperçu la lit comme « pas encore installé ». Une liaison existante garde son
 * statut, sa clé et ses réglages ; seul le logiciel change.
 */
export async function chooseLgo(pharmacyId: string, lgo: string): Promise<void> {
  await prisma.stockConnection.upsert({
    where: { pharmacyId },
    create: { pharmacyId, lgo, status: "PENDING" },
    update: { lgo },
  });
}
