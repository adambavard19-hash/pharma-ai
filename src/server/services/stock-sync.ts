import "server-only";
import { randomInt } from "node:crypto";
import { prisma } from "@/server/db/client";
import { generateToken, hashToken } from "@/server/security/tokens";
import { recordAudit } from "@/server/audit/log";
import { createNotification } from "./notifications";
import { analyseStockImport, commitStockImport } from "./stock-import";
import { LGO_DEFINITIONS, lgoLabel, stockFreshness, type LgoId, type StockFreshness } from "@/core/stock/connectors";
import type { RowDecision } from "@/core/stock-import";
import type { TenantScope } from "@/server/db/tenant";

/**
 * La liaison avec le logiciel de l'officine, côté PharmaBoost.
 *
 * Le titulaire choisit son LGO et reçoit un code à six chiffres, valable une
 * heure. L'agent installé sur le serveur de l'officine présente ce code une
 * seule fois et reçoit une clé ; PharmaBoost n'en garde que l'empreinte. Tout
 * ce que l'agent envoie ensuite est daté et attribué à cette officine et à
 * elle seule : le code ne peut pas être deviné, la clé ne peut pas être
 * rejouée pour une autre officine.
 */

export const PAIRING_TTL_MS = 60 * 60 * 1000;
export const AGENT_FILE_MAX_BYTES = 25 * 1024 * 1024;

export type ConnectionView = {
  id: string;
  lgo: string;
  lgoLabel: string;
  status: string;
  hostname: string | null;
  agentVersion: string | null;
  exportPath: string | null;
  scansPath: string | null;
  intervalSeconds: number;
  lastSeenAt: Date | null;
  lastSyncAt: Date | null;
  lastSyncLines: number | null;
  lastError: string | null;
  pairedAt: Date | null;
  pairingExpiresAt: Date | null;
  freshness: StockFreshness;
  ageSeconds: number | null;
  /** Âge du dernier signe de vie de l'agent, en secondes. */
  seenAgeSeconds: number | null;
};

export function isLgoId(value: string): value is LgoId {
  return LGO_DEFINITIONS.some((lgo) => lgo.id === value);
}

function view(row: {
  id: string; lgo: string; status: string; hostname: string | null; agentVersion: string | null; exportPath: string | null; scansPath: string | null;
  intervalSeconds: number; lastSeenAt: Date | null; lastSyncAt: Date | null; lastSyncLines: number | null; lastError: string | null; pairedAt: Date | null; pairingExpiresAt: Date | null;
}): ConnectionView {
  const now = new Date();
  const fresh = stockFreshness({ lastSyncAt: row.lastSyncAt, lastSeenAt: row.lastSeenAt, intervalSeconds: row.intervalSeconds, now });
  return {
    ...row,
    lgoLabel: lgoLabel(row.lgo),
    freshness: fresh.state,
    ageSeconds: fresh.ageSeconds,
    seenAgeSeconds: row.lastSeenAt ? Math.round((now.getTime() - row.lastSeenAt.getTime()) / 1000) : null,
  };
}

export async function getConnection(pharmacyId: string): Promise<ConnectionView | null> {
  const row = await prisma.stockConnection.findUnique({ where: { pharmacyId } });
  return row ? view(row) : null;
}

/** Émet (ou renouvelle) le code d'appairage. Le code n'est rendu qu'ici, une fois. */
export async function createPairing(scope: TenantScope, lgo: LgoId): Promise<{ code: string; expiresAt: Date }> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
  await prisma.stockConnection.upsert({
    where: { pharmacyId: scope.pharmacyId },
    create: { pharmacyId: scope.pharmacyId, lgo, status: "PENDING", pairingCodeHash: hashToken(code), pairingExpiresAt: expiresAt },
    update: { lgo, pairingCodeHash: hashToken(code), pairingExpiresAt: expiresAt, lastError: null },
  });
  await recordAudit({ action: "stock.connection_pairing_issued", entityType: "StockConnection", entityId: scope.pharmacyId, pharmacyId: scope.pharmacyId, userId: scope.userId, metadata: { lgo } });
  return { code, expiresAt };
}

/** L'agent présente le code : il reçoit sa clé, et le code meurt. */
export async function pairAgent(input: { code: string; lgo?: string | null; hostname?: string | null; version?: string | null; exportPath?: string | null; scansPath?: string | null }): Promise<
  { ok: true; agentKey: string; pharmacyName: string; intervalSeconds: number } | { ok: false; error: string }
> {
  const code = (input.code ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, error: "Code d'appairage invalide." };
  const connection = await prisma.stockConnection.findUnique({ where: { pairingCodeHash: hashToken(code) }, include: { pharmacy: { select: { name: true } } } });
  if (!connection || !connection.pairingExpiresAt || connection.pairingExpiresAt < new Date()) {
    return { ok: false, error: "Code inconnu ou expiré. Générez un nouveau code dans PharmaBoost." };
  }
  const agentKey = generateToken(32);
  await prisma.stockConnection.update({
    where: { id: connection.id },
    data: {
      status: "CONNECTED",
      pairingCodeHash: null,
      pairingExpiresAt: null,
      agentKeyHash: hashToken(agentKey),
      agentVersion: input.version ?? null,
      hostname: input.hostname ?? null,
      exportPath: input.exportPath ?? connection.exportPath,
      scansPath: input.scansPath ?? connection.scansPath,
      pairedAt: new Date(),
      lastSeenAt: new Date(),
      lastError: null,
    },
  });
  await recordAudit({ action: "stock.connection_paired", entityType: "StockConnection", entityId: connection.id, pharmacyId: connection.pharmacyId, metadata: { hostname: input.hostname ?? null, version: input.version ?? null } });
  await createNotification({
    pharmacyId: connection.pharmacyId,
    userId: null,
    type: "IMPORT_COMPLETED",
    severity: "SUCCESS",
    title: `${lgoLabel(connection.lgo)} connecté`,
    body: `L'agent PharmaBoost Connect est appairé${input.hostname ? ` sur ${input.hostname}` : ""}. Le stock se synchronisera automatiquement.`,
    linkUrl: "/stock/connexion",
  });
  return { ok: true, agentKey, pharmacyName: connection.pharmacy.name, intervalSeconds: connection.intervalSeconds };
}

export type AgentContext = { connectionId: string; scope: TenantScope; pharmacyIsDemo: boolean; intervalSeconds: number; exportPath: string | null; scansPath: string | null };

/** La clé de l'agent → l'officine, et le titulaire au nom duquel les écritures sont faites. */
export async function authenticateAgent(authorization: string | null): Promise<AgentContext | null> {
  const token = authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.length < 16) return null;
  const connection = await prisma.stockConnection.findUnique({
    where: { agentKeyHash: hashToken(token) },
    include: { pharmacy: { select: { id: true, organizationId: true, isDemo: true, isActive: true, memberships: { where: { role: "OWNER", isActive: true }, take: 1, select: { userId: true } } } } },
  });
  if (!connection || connection.status === "DISCONNECTED" || !connection.pharmacy.isActive) return null;
  const owner = connection.pharmacy.memberships[0];
  if (!owner) return null;
  return {
    connectionId: connection.id,
    scope: { pharmacyId: connection.pharmacy.id, organizationId: connection.pharmacy.organizationId, userId: owner.userId },
    pharmacyIsDemo: connection.pharmacy.isDemo,
    intervalSeconds: connection.intervalSeconds,
    exportPath: connection.exportPath,
    scansPath: connection.scansPath,
  };
}

/**
 * Signe de vie. `notice` est ce que l'agent constate sur place (dossier vide,
 * export refusé) : affiché tel quel au titulaire, effacé quand l'agent dit que
 * tout va bien. Absent du message, l'état précédent est conservé.
 */
export async function recordHeartbeat(agent: AgentContext, meta: { version?: string | null; hostname?: string | null; notice?: string | null }): Promise<void> {
  const notice = meta.notice === undefined ? undefined : meta.notice ? String(meta.notice).slice(0, 300) : null;
  await prisma.stockConnection.update({
    where: { id: agent.connectionId },
    data: { lastSeenAt: new Date(), agentVersion: meta.version ?? undefined, hostname: meta.hostname ?? undefined, status: "CONNECTED", lastError: notice },
  });
}

/**
 * Un export complet du LGO, reçu de l'agent, appliqué sans intervention :
 * CIP13 → catalogue national, EAN ou nom exact → produit existant, le reste
 * créé puis compris par le moteur. Une ligne invalide est comptée, jamais
 * inventée. Les colonnes sont reconnues d'après les en-têtes ; si l'essentiel
 * manque, l'export est refusé et l'erreur est visible dans PharmaBoost.
 */
export async function applyAgentSnapshot(agent: AgentContext, fileName: string, bytes: Uint8Array): Promise<
  { ok: true; lines: number; created: number; updated: number; invalid: number } | { ok: false; error: string }
> {
  try {
    const preview = await analyseStockImport({ scope: agent.scope, fileName: `[agent] ${fileName}`, bytes });
    if (preview.missing.length > 0) {
      const error = `Colonnes non reconnues dans l'export : ${preview.missing.join(", ")}. Vérifiez le format de l'export du logiciel.`;
      await prisma.stockConnection.update({ where: { id: agent.connectionId }, data: { lastError: error, status: "ERROR" } });
      return { ok: false, error };
    }
    // Sans personne pour trancher, une piste incertaine devient un produit à
    // part entière : au prochain export, son nom exact le retrouvera.
    const decisions: Record<string, RowDecision> = {};
    for (const row of preview.rows) if (row.status === "A_VERIFIER") decisions[String(row.line)] = { kind: "CREER_PRODUIT" };
    const outcome = await commitStockImport({ scope: agent.scope, pharmacyIsDemo: agent.pharmacyIsDemo, jobId: preview.jobId, decisions, createUnknownByDefault: true });
    await prisma.stockConnection.update({
      where: { id: agent.connectionId },
      data: { lastSyncAt: new Date(), lastSeenAt: new Date(), lastSyncLines: preview.summary.detected, lastError: null, status: "CONNECTED" },
    });
    return { ok: true, lines: preview.summary.detected, created: outcome.productsCreated, updated: outcome.productsUpdated + outcome.drugsUpserted, invalid: outcome.invalid };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synchronisation impossible.";
    await prisma.stockConnection.update({ where: { id: agent.connectionId }, data: { lastError: message, status: "ERROR" } }).catch(() => undefined);
    return { ok: false, error: message };
  }
}

export async function updateConnectionSettings(scope: TenantScope, patch: { intervalSeconds?: number; exportPath?: string | null; scansPath?: string | null }): Promise<void> {
  await prisma.stockConnection.update({ where: { pharmacyId: scope.pharmacyId }, data: patch });
}

/** Révoque la clé : l'agent ne peut plus rien envoyer tant qu'il n'est pas ré-appairé. */
export async function disconnectAgent(scope: TenantScope): Promise<void> {
  await prisma.stockConnection.update({
    where: { pharmacyId: scope.pharmacyId },
    data: { status: "DISCONNECTED", agentKeyHash: null, pairingCodeHash: null, pairingExpiresAt: null },
  });
  await recordAudit({ action: "stock.connection_revoked", entityType: "StockConnection", entityId: scope.pharmacyId, pharmacyId: scope.pharmacyId, userId: scope.userId });
}
