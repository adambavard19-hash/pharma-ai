import "server-only";
import { randomInt } from "node:crypto";
import { prisma } from "@/server/db/client";
import { generateToken, hashToken } from "@/server/security/tokens";
import { recordAudit } from "@/server/audit/log";
import { createNotification } from "./notifications";
import { analyseStockImport, commitStockImport } from "./stock-import";
import { LGO_DEFINITIONS, lgoLabel, stockFreshness, type LgoId, type StockFreshness } from "@/core/stock/connectors";
import { safeServerHostname } from "@/core/stock/install";
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

/**
 * Qui a demandé l'émission : un administrateur de la console (installation
 * sous AnyDesk) ou, sans acteur, le titulaire lui-même. L'audit nomme le bon.
 */
export type IssueActor = { platformAdminId: string };

const auditActor = (scope: TenantScope, actor?: IssueActor) => (actor ? { userId: null, platformAdminId: actor.platformAdminId } : { userId: scope.userId });

/** Émet (ou renouvelle) le code d'appairage. Le code n'est rendu qu'ici, une fois. */
export async function createPairing(scope: TenantScope, lgo: LgoId, actor?: IssueActor): Promise<{ code: string; expiresAt: Date }> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
  await prisma.stockConnection.upsert({
    where: { pharmacyId: scope.pharmacyId },
    create: { pharmacyId: scope.pharmacyId, lgo, status: "PENDING", pairingCodeHash: hashToken(code), pairingExpiresAt: expiresAt },
    update: { lgo, pairingCodeHash: hashToken(code), pairingExpiresAt: expiresAt, lastError: null },
  });
  await recordAudit({ action: "stock.connection_pairing_issued", entityType: "StockConnection", entityId: scope.pharmacyId, pharmacyId: scope.pharmacyId, ...auditActor(scope, actor), metadata: { lgo, ...(actor ? { by: "console" } : {}) } });
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
    // Ce que lit le titulaire : le dossier est prêt, c'est à lui d'y enregistrer son édition (rien ne part tout seul).
    title: "Dossier PharmaBoost prêt",
    body: "Le dossier PharmaBoost est prêt sur votre serveur. Enregistrez-y l'édition de votre stock pour le mettre à jour.",
    linkUrl: "/stock/mise-a-jour",
  });
  return { ok: true, agentKey, pharmacyName: connection.pharmacy.name, intervalSeconds: connection.intervalSeconds };
}

export type AgentContext = {
  /** La liaison serveur, ou `null` quand la clé est celle d'un poste de caisse. */
  connectionId: string | null;
  /** Le poste de caisse, quand la clé est la sienne. */
  postId: string | null;
  scope: TenantScope;
  pharmacyIsDemo: boolean;
  intervalSeconds: number;
  exportPath: string | null;
  scansPath: string | null;
};

const POST_PAIRING_TTL_MS = 1000 * 60 * 60;
/** Un lien d'installation vit une semaine : le titulaire le fait quand il a le poste sous la main. */
const POST_INSTALL_LINK_TTL_MS = 1000 * 60 * 60 * 24 * 7;

/** Un code d'appairage pour un poste de caisse : six chiffres, une heure, un seul usage. */
export async function createPostPairing(scope: TenantScope, label: string | null, actor?: IssueActor): Promise<{ code: string; expiresAt: Date; postId: string }> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + POST_PAIRING_TTL_MS);
  const post = await prisma.counterPost.create({
    data: { pharmacyId: scope.pharmacyId, hostname: "", label, pairingCodeHash: hashToken(code), pairingExpiresAt: expiresAt },
  });
  await recordAudit({ action: "stock.post_pairing_created", entityType: "CounterPost", entityId: post.id, pharmacyId: scope.pharmacyId, ...auditActor(scope, actor), metadata: { label, kind: "code", ...(actor ? { by: "console" } : {}) } });
  return { code, expiresAt, postId: post.id };
}

/** Le poste présente son code : il reçoit sa clé, une fois. */
/**
 * Le lien d'installation en une ligne : un jeton long, à usage unique, qui
 * tient dans une commande PowerShell. Le poste s'appaire avec ce jeton comme
 * avec un code à six chiffres ; il n'y a rien d'autre à taper.
 */
export async function createPostInstallLink(scope: TenantScope, label: string | null, actor?: IssueActor): Promise<{ token: string; expiresAt: Date; postId: string }> {
  const token = generateToken(18);
  const expiresAt = new Date(Date.now() + POST_INSTALL_LINK_TTL_MS);
  const post = await prisma.counterPost.create({
    data: { pharmacyId: scope.pharmacyId, hostname: "", label, pairingCodeHash: hashToken(token), pairingExpiresAt: expiresAt },
  });
  await recordAudit({ action: "stock.post_pairing_created", entityType: "CounterPost", entityId: post.id, pharmacyId: scope.pharmacyId, ...auditActor(scope, actor), metadata: { label, kind: "install-link", ...(actor ? { by: "console" } : {}) } });
  return { token, expiresAt, postId: post.id };
}

/**
 * Un lien d'installation encore valable ? Sans rien consommer : l'installateur le vérifie avant de télécharger.
 * Rend aussi le nom de machine du serveur relié (s'il y en a un, et s'il est sûr) : le poste en tire le chemin du dossier partagé.
 */
export async function peekPostInstallLink(token: string): Promise<{ pharmacyName: string; label: string | null; serverHostname: string | null; expiresAt: Date } | null> {
  if (!/^[A-Za-z0-9_-]{16,}$/.test(token)) return null;
  const post = await prisma.counterPost.findUnique({ where: { pairingCodeHash: hashToken(token) }, select: { label: true, pharmacyId: true, pairingExpiresAt: true, pharmacy: { select: { name: true } } } });
  if (!post || !post.pairingExpiresAt || post.pairingExpiresAt < new Date()) return null;
  const server = await prisma.stockConnection.findUnique({ where: { pharmacyId: post.pharmacyId }, select: { hostname: true, pairedAt: true } });
  return { pharmacyName: post.pharmacy.name, label: post.label, serverHostname: server?.pairedAt ? safeServerHostname(server.hostname) : null, expiresAt: post.pairingExpiresAt };
}

/**
 * Un code d'installation du serveur encore valable ? Sans rien consommer et
 * sans rien révéler de l'officine : seul le logiciel à configurer sort d'ici.
 */
export async function peekServerPairing(code: string): Promise<{ lgo: LgoId } | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const connection = await prisma.stockConnection.findUnique({ where: { pairingCodeHash: hashToken(code) }, select: { lgo: true, pairingExpiresAt: true } });
  if (!connection || !connection.pairingExpiresAt || connection.pairingExpiresAt < new Date()) return null;
  return { lgo: isLgoId(connection.lgo) ? connection.lgo : "autre" };
}

/**
 * L'officine pour laquelle la console prépare une installation : son titulaire
 * actif (au nom duquel l'agent écrira) et le logiciel déjà connu. Une officine
 * suspendue est refusée : son agent n'aurait de toute façon pas le droit d'écrire.
 */
export async function resolveInstallTarget(pharmacyId: string): Promise<
  { ok: true; scope: TenantScope; pharmacyName: string; lgo: LgoId | null } | { ok: false; reason: "NOT_FOUND" | "SUSPENDED" | "NO_OWNER" }
> {
  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: pharmacyId },
    select: {
      id: true, name: true, organizationId: true, isActive: true,
      memberships: { where: { role: "OWNER", isActive: true }, orderBy: { createdAt: "asc" }, take: 1, select: { userId: true } },
      stockConnection: { select: { lgo: true } },
    },
  });
  if (!pharmacy) return { ok: false, reason: "NOT_FOUND" };
  if (!pharmacy.isActive) return { ok: false, reason: "SUSPENDED" };
  const owner = pharmacy.memberships[0];
  if (!owner) return { ok: false, reason: "NO_OWNER" };
  const lgo = pharmacy.stockConnection?.lgo;
  return { ok: true, scope: { pharmacyId: pharmacy.id, organizationId: pharmacy.organizationId, userId: owner.userId }, pharmacyName: pharmacy.name, lgo: lgo && isLgoId(lgo) ? lgo : null };
}

/**
 * L'officine pour laquelle la console assiste, sans exiger qu'elle soit active : retirer un poste volé ou couper un
 * serveur doit rester possible sur une officine suspendue. Le « scope » n'ouvre ici que les fonctions de liaison
 * (aucune donnée de patient) et ne sert que de support ; l'audit nomme l'administrateur, pas le titulaire.
 */
export async function resolveSupportScope(pharmacyId: string): Promise<{ ok: true; scope: TenantScope; pharmacyName: string; lgo: LgoId | null } | { ok: false; reason: "NOT_FOUND" | "NO_OWNER" }> {
  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: pharmacyId },
    select: {
      id: true, name: true, organizationId: true,
      memberships: { where: { role: "OWNER", isActive: true }, orderBy: { createdAt: "asc" }, take: 1, select: { userId: true } },
      stockConnection: { select: { lgo: true } },
    },
  });
  if (!pharmacy) return { ok: false, reason: "NOT_FOUND" };
  const owner = pharmacy.memberships[0];
  if (!owner) return { ok: false, reason: "NO_OWNER" };
  const lgo = pharmacy.stockConnection?.lgo;
  return { ok: true, scope: { pharmacyId: pharmacy.id, organizationId: pharmacy.organizationId, userId: owner.userId }, pharmacyName: pharmacy.name, lgo: lgo && isLgoId(lgo) ? lgo : null };
}

/** Ce que la fiche officine montre de l'installation : le serveur, les postes, le dernier stock reçu. Des états, jamais un code. */
export type InstallState = {
  server: {
    lgo: string;
    lgoLabel: string;
    hostname: string | null;
    /** Le serveur s'est présenté avec son code et n'a pas été déconnecté depuis. */
    linked: boolean;
    pairedAt: Date | null;
    lastSeenAt: Date | null;
    /** Un code émis et pas encore utilisé, jusqu'à quand. */
    codeValidUntil: Date | null;
  } | null;
  posts: { id: string; label: string | null; hostname: string; linked: boolean; pairedAt: Date | null; lastSeenAt: Date | null; linkValidUntil: Date | null }[];
  stockSyncedAt: Date | null;
};

export async function pharmacyInstallState(pharmacyId: string, now: Date = new Date()): Promise<InstallState> {
  const [connection, posts, pharmacy] = await Promise.all([
    prisma.stockConnection.findUnique({ where: { pharmacyId }, select: { lgo: true, status: true, hostname: true, pairedAt: true, lastSeenAt: true, pairingExpiresAt: true } }),
    prisma.counterPost.findMany({ where: { pharmacyId, revokedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, label: true, hostname: true, pairedAt: true, lastSeenAt: true, pairingExpiresAt: true } }),
    prisma.pharmacy.findUnique({ where: { id: pharmacyId }, select: { stockSyncedAt: true } }),
  ]);
  const stillValid = (date: Date | null) => (date && date > now ? date : null);
  return {
    server: connection
      ? {
          lgo: connection.lgo,
          lgoLabel: lgoLabel(connection.lgo),
          hostname: connection.hostname,
          linked: Boolean(connection.pairedAt) && connection.status !== "DISCONNECTED",
          pairedAt: connection.pairedAt,
          lastSeenAt: connection.lastSeenAt,
          codeValidUntil: stillValid(connection.pairingExpiresAt),
        }
      : null,
    posts: posts.map((post) => ({ id: post.id, label: post.label, hostname: post.hostname, linked: Boolean(post.pairedAt), pairedAt: post.pairedAt, lastSeenAt: post.lastSeenAt, linkValidUntil: stillValid(post.pairingExpiresAt) })),
    stockSyncedAt: pharmacy?.stockSyncedAt ?? null,
  };
}

export async function pairCounterPost(input: { code: string; hostname?: string | null; version?: string | null }): Promise<{ ok: true; agentKey: string; pharmacyName: string; postLabel: string } | { ok: false; error: string }> {
  // Un code à six chiffres tapé à la main, ou le jeton d'un lien d'installation.
  const raw = (input.code ?? "").trim();
  const code = /^[A-Za-z0-9_-]{16,}$/.test(raw) ? raw : raw.replace(/\D/g, "");
  if (code.length !== 6 && code.length < 16) return { ok: false, error: "Code d'appairage invalide." };
  const post = await prisma.counterPost.findUnique({ where: { pairingCodeHash: hashToken(code) }, include: { pharmacy: { select: { name: true } } } });
  if (!post || !post.pairingExpiresAt || post.pairingExpiresAt < new Date()) return { ok: false, error: "Code de poste inconnu ou expiré. Générez un nouveau lien dans PharmaBoost (Mes connexions → Télécharger PharmaBoost)." };
  const agentKey = generateToken(32);
  await prisma.counterPost.update({
    where: { id: post.id },
    data: { keyHash: hashToken(agentKey), pairingCodeHash: null, pairingExpiresAt: null, pairedAt: new Date(), lastSeenAt: new Date(), hostname: input.hostname ?? "", version: input.version ?? null },
  });
  await recordAudit({ action: "stock.post_paired", entityType: "CounterPost", entityId: post.id, pharmacyId: post.pharmacyId, metadata: { hostname: input.hostname ?? null, version: input.version ?? null } });
  await createNotification({ pharmacyId: post.pharmacyId, userId: null, type: "IMPORT_COMPLETED", severity: "SUCCESS", title: `Poste de caisse ${post.label ?? input.hostname ?? ""} relié`, body: "La douchette de ce poste alimente maintenant le comptoir PharmaBoost.", linkUrl: "/connexion" });
  return { ok: true, agentKey, pharmacyName: post.pharmacy.name, postLabel: post.label ?? input.hostname ?? "" };
}

export async function revokeCounterPost(scope: TenantScope, postId: string, actor?: IssueActor): Promise<void> {
  await prisma.counterPost.updateMany({ where: { id: postId, pharmacyId: scope.pharmacyId }, data: { revokedAt: new Date(), keyHash: null, pairingCodeHash: null } });
  await recordAudit({ action: "stock.post_revoked", entityType: "CounterPost", entityId: postId, pharmacyId: scope.pharmacyId, ...auditActor(scope, actor), ...(actor ? { metadata: { by: "console" } } : {}) });
}

export async function listCounterPosts(pharmacyId: string) {
  return prisma.counterPost.findMany({ where: { pharmacyId, revokedAt: null }, orderBy: { createdAt: "asc" } });
}

/** La clé de l'agent → l'officine, et le titulaire au nom duquel les écritures sont faites. */
export async function authenticateAgent(authorization: string | null): Promise<AgentContext | null> {
  const token = authorization?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token.length < 16) return null;
  const pharmacySelect = { id: true, organizationId: true, isDemo: true, isActive: true, memberships: { where: { role: "OWNER" as const, isActive: true }, take: 1, select: { userId: true } } };
  const connection = await prisma.stockConnection.findUnique({
    where: { agentKeyHash: hashToken(token) },
    include: { pharmacy: { select: pharmacySelect } },
  });
  if (!connection) {
    // La clé d'un poste de caisse : même portée, mais elle n'ouvre que le comptoir (bips) et le signe de vie.
    const post = await prisma.counterPost.findUnique({ where: { keyHash: hashToken(token) }, include: { pharmacy: { select: pharmacySelect } } });
    if (!post || post.revokedAt || !post.pharmacy.isActive) return null;
    const postOwner = post.pharmacy.memberships[0];
    if (!postOwner) return null;
    return { connectionId: null, postId: post.id, scope: { pharmacyId: post.pharmacy.id, organizationId: post.pharmacy.organizationId, userId: postOwner.userId }, pharmacyIsDemo: post.pharmacy.isDemo, intervalSeconds: 300, exportPath: null, scansPath: null };
  }
  if (connection.status === "DISCONNECTED" || !connection.pharmacy.isActive) return null;
  const owner = connection.pharmacy.memberships[0];
  if (!owner) return null;
  return {
    connectionId: connection.id,
    postId: null,
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
  if (!agent.connectionId) return;
  const notice = meta.notice === undefined ? undefined : meta.notice ? String(meta.notice).slice(0, 300) : null;
  await prisma.stockConnection.update({
    where: { id: agent.connectionId! },
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
  // Un poste de caisse peut aussi envoyer l'export, quand le dossier du LGO
  // lui est visible : le résultat s'écrit alors sur le poste, pas sur la
  // liaison serveur.
  const markError = async (error: string) => {
    if (agent.connectionId) await prisma.stockConnection.update({ where: { id: agent.connectionId }, data: { lastError: error, status: "ERROR" } }).catch(() => undefined);
    else if (agent.postId) await prisma.counterPost.update({ where: { id: agent.postId }, data: { lastExportError: error } }).catch(() => undefined);
  };
  try {
    const preview = await analyseStockImport({ scope: agent.scope, fileName: `[agent] ${fileName}`, bytes });
    if (preview.missing.length > 0) {
      const error = `Colonnes non reconnues dans l'export : ${preview.missing.join(", ")}. Vérifiez le format de l'export du logiciel.`;
      await markError(error);
      return { ok: false, error };
    }
    // Sans personne pour trancher, une piste incertaine devient un produit à
    // part entière : au prochain export, son nom exact le retrouvera.
    const decisions: Record<string, RowDecision> = {};
    for (const row of preview.rows) if (row.status === "A_VERIFIER") decisions[String(row.line)] = { kind: "CREER_PRODUIT" };
    const outcome = await commitStockImport({ scope: agent.scope, pharmacyIsDemo: agent.pharmacyIsDemo, jobId: preview.jobId, decisions, createUnknownByDefault: true });
    if (agent.connectionId) {
      await prisma.stockConnection.update({
        where: { id: agent.connectionId },
        data: { lastSyncAt: new Date(), lastSeenAt: new Date(), lastSyncLines: preview.summary.detected, lastError: null, status: "CONNECTED" },
      });
    } else if (agent.postId) {
      await prisma.counterPost.update({ where: { id: agent.postId }, data: { lastExportAt: new Date(), lastExportError: null } });
    }
    return { ok: true, lines: preview.summary.detected, created: outcome.productsCreated, updated: outcome.productsUpdated + outcome.drugsUpserted, invalid: outcome.invalid };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Synchronisation impossible.";
    await markError(message);
    return { ok: false, error: message };
  }
}

export async function updateConnectionSettings(scope: TenantScope, patch: { intervalSeconds?: number; exportPath?: string | null; scansPath?: string | null }, actor?: IssueActor): Promise<void> {
  await prisma.stockConnection.update({ where: { pharmacyId: scope.pharmacyId }, data: patch });
  // Le chemin lui-même n'est pas écrit dans le journal : il dit seulement que les réglages ont changé, et par qui.
  if (actor) await recordAudit({ action: "stock.connection_settings_changed", entityType: "StockConnection", entityId: scope.pharmacyId, pharmacyId: scope.pharmacyId, userId: null, platformAdminId: actor.platformAdminId, metadata: { fields: Object.keys(patch), by: "console" } });
}

/** Révoque la clé : l'agent ne peut plus rien envoyer tant qu'il n'est pas ré-appairé. */
export async function disconnectAgent(scope: TenantScope, actor?: IssueActor): Promise<void> {
  await prisma.stockConnection.update({
    where: { pharmacyId: scope.pharmacyId },
    data: { status: "DISCONNECTED", agentKeyHash: null, pairingCodeHash: null, pairingExpiresAt: null },
  });
  await recordAudit({ action: "stock.connection_revoked", entityType: "StockConnection", entityId: scope.pharmacyId, pharmacyId: scope.pharmacyId, ...auditActor(scope, actor), ...(actor ? { metadata: { by: "console" } } : {}) });
}

/** Le dossier d'export du LGO, tel que ce poste le voit (« \\SERVEUR\PharmaBoost\Export »). Vide : ce poste n'envoie pas de stock. */
export async function setPostExportPath(scope: TenantScope, postId: string, exportPath: string | null, actor?: IssueActor): Promise<void> {
  const post = await prisma.counterPost.findFirst({ where: { id: postId, pharmacyId: scope.pharmacyId, revokedAt: null }, select: { id: true } });
  if (!post) throw new Error("Poste introuvable dans cette officine.");
  await prisma.counterPost.update({ where: { id: postId }, data: { exportPath, lastExportError: null } });
  await recordAudit({ action: "stock.post_export_path_set", entityType: "CounterPost", entityId: postId, pharmacyId: scope.pharmacyId, ...auditActor(scope, actor), metadata: { exportPath, ...(actor ? { by: "console" } : {}) } });
}

/** « Mettre à jour maintenant » : le poste relit l'export à son prochain signe de vie (moins d'une minute). */
export async function requestPostSync(scope: TenantScope, postId: string, actor?: IssueActor): Promise<void> {
  const post = await prisma.counterPost.findFirst({ where: { id: postId, pharmacyId: scope.pharmacyId, revokedAt: null }, select: { id: true, exportPath: true } });
  if (!post) throw new Error("Poste introuvable dans cette officine.");
  if (!post.exportPath) throw new Error("Indiquez d'abord le dossier d'export du stock pour ce poste.");
  await prisma.counterPost.update({ where: { id: postId }, data: { syncRequestedAt: new Date() } });
  await recordAudit({ action: "stock.post_sync_requested", entityType: "CounterPost", entityId: postId, pharmacyId: scope.pharmacyId, ...auditActor(scope, actor), ...(actor ? { metadata: { by: "console" } } : {}) });
}

