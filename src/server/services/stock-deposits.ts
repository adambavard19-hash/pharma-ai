import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/server/db/client";
import type { Prisma, StockDeposit } from "@/generated/prisma";
import { getStorageProvider } from "@/server/ai/registry";
import { recordAudit, type AuditAction } from "@/server/audit/log";
import { rateLimited } from "@/server/http/rate-limit";
import { createNotification } from "./notifications";
import { notifyAdmins } from "./sales/notifications";
import { analyseStockImport, commitStockImport } from "./stock-import";
import { lgoLabel } from "@/core/stock/connectors";
import { FIELD_LABELS as IMPORT_FIELD_LABELS, UnreadableFileError, type RowDecision } from "@/core/stock-import";
import {
  DEPOSIT_ABANDONED_MS,
  DEPOSIT_ACCEPTED,
  DEPOSIT_ACCEPTED_LABEL,
  DEPOSIT_DAILY_LIMIT,
  DEPOSIT_DOUBLE_SEND_MS,
  DEPOSIT_FAILED_REPLAY_MS,
  DEPOSIT_IN_FLIGHT_MS,
  DEPOSIT_INTERRUPTED_MESSAGE,
  DEPOSIT_SOURCE_LABELS,
  DEPOSIT_STALLED_MS,
  DEPOSIT_SUPERSEDED_ERROR,
  DEPOSIT_SUPERSEDED_MESSAGE,
  DEPOSIT_HOLD_MIN_KNOWN,
  assessDeposit,
  type DepositAssessment,
  cleanDepositFileName,
  depositMaxBytes,
  depositMaxLabel,
  depositMimeType,
  depositStorageKey,
  describeDepositResult,
  isDepositStalled,
  isDepositStorageKey,
  retentionCutoff,
} from "@/core/stock-deposit/rules";
import { DEPOSIT_DECISIONS, DEPOSIT_SOURCES, type DepositDecision, type DepositSource, type DepositStatus, type DepositView, type StockPreview } from "@/core/stock-deposit/types";
import type { TenantScope } from "@/server/db/tenant";

/**
 * Les dépôts de stock : un seul moteur pour les trois chemins (le dossier
 * PharmaBoost lu par le petit facteur, le bouton « Envoyer mon fichier »,
 * le dépôt par l'équipe depuis la console).
 *
 * Le fichier est gardé 90 jours dans le stockage privé, lu, puis le stock de
 * l'officine est mis à jour sans clic de l'équipe. Un fichier est toujours le
 * stock COMPLET : ce que l'officine avait par import et que le fichier ne
 * mentionne plus passe à zéro. C'est pourquoi un fichier qui pourrait en
 * remettre à zéro à tort attend la décision de l'équipe, et le stock ne bouge
 * pas : fichier lu en partie (pages illisibles, plafond atteint), trop de
 * lignes illisibles, ou fichier qui couvre moins de 80 % du stock connu (par
 * exemple seulement les nouveautés).
 *
 * Un envoi appliqué remplace les plus anciens restés en attente ou en échec ;
 * un envoi resté « en cours » trop longtemps est signalé, relançable, puis
 * refermé par le passage quotidien.
 */

export type PharmacyStockRow = {
  pharmacyId: string;
  name: string;
  stockSyncedAt: Date | null;
  lastDepositAt: Date | null;
  lastSource: DepositSource | null;
  lines: number | null;
  connected: boolean;
  lgoLabel: string | null;
};

export type ReceiveResult = { ok: true; deposit: DepositView; duplicate: boolean } | { ok: false; error: string };

type DepositOutcome = { ok: true; deposit: DepositView } | { ok: false; error: string };

type DepositRow = StockDeposit & { pharmacy?: { name: string } | null };

const DAY_MS = 24 * 60 * 60 * 1000;
/** Une même ligne d'erreur est lisible par le titulaire ; au-delà, c'est du bruit. */
const MAX_NOTE = 240;
/** Un lot de purge tient dans le temps d'un passage quotidien. */
const PURGE_BATCH = 200;
const PURGE_MAX_BATCHES = 10;

// ---------------------------------------------------------------- Lecture

function asSource(value: string): DepositSource {
  return (DEPOSIT_SOURCES as readonly string[]).includes(value) ? (value as DepositSource) : "WEB";
}

function toView(row: DepositRow, now: Date = new Date()): DepositView {
  return {
    id: row.id,
    pharmacyId: row.pharmacyId,
    ...(row.pharmacy ? { pharmacyName: row.pharmacy.name } : {}),
    fileName: row.fileName,
    fileSize: row.fileSize,
    status: row.status,
    source: asSource(row.source),
    lines: row.lines,
    created: row.created,
    updated: row.updated,
    invalid: row.invalid,
    zeroed: row.zeroed,
    knownLines: row.knownLines,
    message: row.message,
    receivedAt: row.receivedAt,
    appliedAt: row.appliedAt,
    decidedAt: row.decidedAt,
    hasFile: row.storageKey !== null && row.fileDeletedAt === null,
    stalled: isDepositStalled(row, now),
  };
}

/** Ce que l'équipe doit trancher ou relancer : en attente, en échec, ou « en cours » depuis trop longtemps. */
function attentionWhere(now: Date): Prisma.StockDepositWhereInput {
  return { OR: [{ status: { in: ["HELD", "FAILED"] } }, { status: "RECEIVED", receivedAt: { lt: new Date(now.getTime() - DEPOSIT_STALLED_MS) } }] };
}

/** Les derniers envois d'une officine, les plus récents d'abord (écran du titulaire). */
export async function listPharmacyDeposits(pharmacyId: string, limit = 5): Promise<DepositView[]> {
  const rows = await prisma.stockDeposit.findMany({ where: { pharmacyId }, orderBy: { receivedAt: "desc" }, take: limit });
  return rows.map((row) => toView(row));
}

/** Tous les envois, toutes officines : réservé à la console. `ATTENTION` = ce que l'équipe doit trancher ou relancer. */
export async function listDepositsForConsole(filter: { status?: DepositStatus | "ATTENTION"; pharmacyId?: string; limit?: number } = {}): Promise<DepositView[]> {
  const rows = await prisma.stockDeposit.findMany({
    where: {
      ...(filter.status === "ATTENTION" ? attentionWhere(new Date()) : filter.status ? { status: filter.status } : {}),
      ...(filter.pharmacyId ? { pharmacyId: filter.pharmacyId } : {}),
    },
    orderBy: { receivedAt: "desc" },
    take: filter.limit ?? 100,
    include: { pharmacy: { select: { name: true } } },
  });
  return rows.map((row) => toView(row));
}

/**
 * Le stock de chaque officine réelle et active : la plus ancienne en tête,
 * celles qui n'ont jamais rien envoyé avant toutes les autres.
 */
export async function consoleStockOverview(): Promise<PharmacyStockRow[]> {
  const pharmacies = await prisma.pharmacy.findMany({
    where: { isActive: true, isDemo: false },
    select: {
      id: true,
      name: true,
      stockSyncedAt: true,
      stockConnection: { select: { status: true, lgo: true } },
      stockDeposits: { where: { status: "APPLIED" }, orderBy: { receivedAt: "desc" }, take: 1, select: { receivedAt: true, source: true, lines: true } },
    },
  });
  const rows = pharmacies.map<PharmacyStockRow>((pharmacy) => {
    const last = pharmacy.stockDeposits[0] ?? null;
    return {
      pharmacyId: pharmacy.id,
      name: pharmacy.name,
      stockSyncedAt: pharmacy.stockSyncedAt,
      lastDepositAt: last?.receivedAt ?? null,
      lastSource: last ? asSource(last.source) : null,
      lines: last?.lines ?? null,
      connected: pharmacy.stockConnection?.status === "CONNECTED",
      lgoLabel: pharmacy.stockConnection ? lgoLabel(pharmacy.stockConnection.lgo) : null,
    };
  });
  return rows.sort((a, b) => {
    if (a.stockSyncedAt === null && b.stockSyncedAt !== null) return -1;
    if (a.stockSyncedAt !== null && b.stockSyncedAt === null) return 1;
    const byAge = (a.stockSyncedAt?.getTime() ?? 0) - (b.stockSyncedAt?.getTime() ?? 0);
    return byAge !== 0 ? byAge : a.name.localeCompare(b.name, "fr");
  });
}

export async function countDepositsNeedingAttention(): Promise<number> {
  return prisma.stockDeposit.count({ where: attentionWhere(new Date()) });
}

/** Le titulaire actif d'une officine : le scope au nom duquel l'équipe dépose ou tranche. `null` sans titulaire actif. */
export async function ownerScopeForPharmacy(pharmacyId: string): Promise<{ scope: TenantScope; pharmacyIsDemo: boolean; pharmacyName: string } | null> {
  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id: pharmacyId },
    select: {
      id: true,
      name: true,
      organizationId: true,
      isDemo: true,
      memberships: { where: { role: "OWNER", isActive: true }, orderBy: { createdAt: "asc" }, take: 1, select: { userId: true } },
    },
  });
  const owner = pharmacy?.memberships[0];
  if (!pharmacy || !owner) return null;
  return { scope: { pharmacyId: pharmacy.id, organizationId: pharmacy.organizationId, userId: owner.userId }, pharmacyIsDemo: pharmacy.isDemo, pharmacyName: pharmacy.name };
}

// ---------------------------------------------------------------- Le fichier gardé

type StoredFile = { ok: true; bytes: Uint8Array } | { ok: false; reason: "NO_FILE" | "FILE_MISSING" | "STORAGE_UNAVAILABLE" };

/** Relit le fichier d'un dépôt. La clé doit être celle de CE dépôt : une clé altérée n'ouvre jamais le fichier d'une autre officine. */
async function readStoredFile(row: Pick<StockDeposit, "id" | "pharmacyId" | "storageKey">): Promise<StoredFile> {
  const key = row.storageKey;
  if (!key || !isDepositStorageKey(key, row.pharmacyId, row.id)) return { ok: false, reason: "NO_FILE" };
  let bytes: Uint8Array | null;
  try {
    bytes = await getStorageProvider().read(key);
  } catch {
    return { ok: false, reason: "STORAGE_UNAVAILABLE" };
  }
  return bytes ? { ok: true, bytes } : { ok: false, reason: "FILE_MISSING" };
}

/**
 * Le fichier d'origine d'un dépôt, pour le télécharger depuis la console. C'est
 * un fichier du titulaire : chaque téléchargement est tracé au nom de
 * l'administrateur (jamais le contenu).
 */
export async function getDepositFile(id: string, adminId: string): Promise<{ ok: true; bytes: Uint8Array; fileName: string } | { ok: false; reason: "NOT_FOUND" | "NO_FILE" | "FILE_MISSING" | "STORAGE_UNAVAILABLE" }> {
  const row = await prisma.stockDeposit.findUnique({ where: { id }, select: { id: true, pharmacyId: true, storageKey: true, fileName: true } });
  if (!row) return { ok: false, reason: "NOT_FOUND" };
  const file = await readStoredFile(row);
  if (!file.ok) return file;
  await recordAudit({ action: "stock.deposit_downloaded", entityType: "StockDeposit", entityId: row.id, pharmacyId: row.pharmacyId, platformAdminId: adminId, metadata: { sizeBytes: file.bytes.byteLength } });
  return { ok: true, bytes: file.bytes, fileName: row.fileName };
}

const FILE_REASONS = {
  NO_FILE: "Le fichier n'est plus conservé (supprimé après 90 jours) : demandez au titulaire de le renvoyer.",
  FILE_MISSING: "Le fichier est introuvable dans le stockage : demandez au titulaire de le renvoyer.",
  STORAGE_UNAVAILABLE: "Le stockage des fichiers est indisponible : réessayez dans quelques minutes.",
} as const;

/** Efface les fichiers de plus de 90 jours : le fichier part, la ligne d'historique reste. */
export async function purgeExpiredDepositFiles(now: Date): Promise<{ purged: number }> {
  const cutoff = retentionCutoff(now);
  let purged = 0;
  let storage: ReturnType<typeof getStorageProvider> | null = null;
  for (let batch = 0; batch < PURGE_MAX_BATCHES; batch += 1) {
    const expired = await prisma.stockDeposit.findMany({
      where: { storageKey: { not: null }, receivedAt: { lt: cutoff } },
      select: { id: true, storageKey: true },
      orderBy: { receivedAt: "asc" },
      take: PURGE_BATCH,
    });
    if (expired.length === 0) break;
    storage ??= getStorageProvider();
    const done: string[] = [];
    for (const row of expired) {
      try {
        await storage.delete(row.storageKey as string);
        done.push(row.id);
      } catch (error) {
        // Un fichier qui résiste reste référencé : il sera retenté au prochain passage.
        console.error(`[stock-deposit] suppression du fichier ${row.id} impossible : ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (done.length > 0) await prisma.stockDeposit.updateMany({ where: { id: { in: done } }, data: { storageKey: null, fileDeletedAt: now } });
    purged += done.length;
    // Rien n'a pu être supprimé dans ce lot : recommencer ne ferait que reboucler.
    if (done.length < expired.length) break;
  }
  if (purged > 0) await recordAudit({ action: "stock.deposit_files_purged", entityType: "StockDeposit", metadata: { purged } });
  return { purged };
}

// ---------------------------------------------------------------- Recevoir

/**
 * Reçoit un fichier de stock, quel qu'en soit le chemin, et le traite.
 *
 * Refus nets avant toute écriture : format, fichier vide, trop gros (8 Mo ; 25 Mo
 * pour le dossier PharmaBoost du serveur), autre fichier déjà en cours de
 * lecture, trop d'envois dans la journée, stockage indisponible. Le même
 * fichier renvoyé dans les deux minutes est un double clic : le dépôt existant
 * est rendu, rien n'est refait. Un export que l'agent renvoie toutes les 5
 * minutes alors qu'il est resté en échec est rendu de la même façon pendant 24 h.
 */
export async function receiveStockDeposit(params: {
  scope: TenantScope;
  pharmacyIsDemo: boolean;
  fileName: string;
  bytes: Uint8Array;
  source: DepositSource;
  adminId?: string | null;
}): Promise<ReceiveResult> {
  const { scope, bytes, source } = params;
  const adminId = params.adminId ?? null;
  const fileName = cleanDepositFileName(params.fileName ?? "");

  if (!DEPOSIT_ACCEPTED.test(fileName)) return { ok: false, error: `Format non accepté. Envoyez un fichier ${DEPOSIT_ACCEPTED_LABEL}.` };
  if (bytes.byteLength === 0) return { ok: false, error: "Le fichier est vide." };
  if (bytes.byteLength > depositMaxBytes(source)) return { ok: false, error: `Le fichier dépasse ${depositMaxLabel(source)}.` };

  const fileSha256 = createHash("sha256").update(bytes).digest("hex");
  const now = Date.now();
  // Un fichier resté en échec peut être renvoyé aussitôt : la panne a pu passer.
  const recent = await prisma.stockDeposit.findFirst({
    where: { pharmacyId: scope.pharmacyId, fileSha256, status: { not: "FAILED" }, receivedAt: { gte: new Date(now - DEPOSIT_DOUBLE_SEND_MS) } },
    orderBy: { receivedAt: "desc" },
  });
  if (recent) return { ok: true, deposit: toView(recent), duplicate: true };

  // … sauf pour l'agent, qui renvoie le même export toutes les 5 minutes tant qu'il est refusé :
  // le même fichier resté en échec n'ajoute ni ligne, ni fichier gardé, ni notification.
  if (source === "AGENT") {
    const failed = await prisma.stockDeposit.findFirst({
      where: { pharmacyId: scope.pharmacyId, fileSha256, status: "FAILED", receivedAt: { gte: new Date(now - DEPOSIT_FAILED_REPLAY_MS) } },
      orderBy: { receivedAt: "desc" },
    });
    if (failed) return { ok: true, deposit: toView(failed), duplicate: true };
  }

  // Deux fichiers de la même officine ne se lisent pas en même temps : le second verrait un stock à moitié écrit.
  const inFlight = await prisma.stockDeposit.findFirst({
    where: { pharmacyId: scope.pharmacyId, status: "RECEIVED", receivedAt: { gte: new Date(now - DEPOSIT_IN_FLIGHT_MS) } },
    orderBy: { receivedAt: "desc" },
  });
  if (inFlight) {
    if (inFlight.fileSha256 === fileSha256) return { ok: true, deposit: toView(inFlight), duplicate: true };
    return { ok: false, error: "Un envoi est déjà en cours de lecture. Réessayez dans une minute." };
  }

  // La limite est comptée par origine : un agent qui boucle ne bloque ni le titulaire ni l'équipe.
  if (rateLimited(`stock-deposit:${scope.pharmacyId}:${source}`, DEPOSIT_DAILY_LIMIT, DAY_MS)) {
    return { ok: false, error: "Trop d'envois aujourd'hui. Réessayez demain, ou prévenez votre conseiller PharmaBoost." };
  }

  // Le fichier est gardé AVANT toute lecture : sans stockage, rien n'est appliqué.
  const id = randomUUID();
  const storageKey = depositStorageKey(scope.pharmacyId, id, fileName);
  try {
    await getStorageProvider().put(storageKey, bytes, depositMimeType(fileName));
  } catch (error) {
    console.error(`[stock-deposit] stockage du fichier impossible : ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, error: "Le stockage des fichiers est indisponible pour l'instant. Rien n'a été modifié : réessayez dans quelques minutes." };
  }

  let row: StockDeposit;
  try {
    row = await prisma.stockDeposit.create({
      data: {
        id,
        pharmacyId: scope.pharmacyId,
        // Le membre n'est nommé que s'il a lui-même envoyé le fichier.
        userId: source === "WEB" ? scope.userId : null,
        fileName,
        fileSize: bytes.byteLength,
        fileSha256,
        storageKey,
        status: "RECEIVED",
        source,
        ...(adminId ? { decidedById: adminId, decidedAt: new Date() } : {}),
      },
    });
  } catch (error) {
    // Un fichier que rien ne référence n'a pas à rester.
    await quietly("nettoyage du fichier", () => getStorageProvider().delete(storageKey));
    throw error;
  }
  await recordAudit({
    action: "stock.deposit_received",
    entityType: "StockDeposit",
    entityId: id,
    pharmacyId: scope.pharmacyId,
    userId: source === "WEB" ? scope.userId : null,
    platformAdminId: adminId,
    metadata: { source, sizeBytes: bytes.byteLength },
  });

  const done = await processDeposit({ row, scope, pharmacyIsDemo: params.pharmacyIsDemo, bytes, decided: false, zeroAbsent: true, adminId });
  await announce(done, { scope, adminId, notifyTeam: true });
  return { ok: true, deposit: toView(done), duplicate: false };
}

// ---------------------------------------------------------------- Prévisualiser

export type PreviewResult = { ok: true; preview: StockPreview } | { ok: false; error: string };

const PREVIEW_HOURLY_LIMIT = 30;

/**
 * Lit un fichier de stock et dit ce qu'il contient, SANS rien appliquer : combien de produits, combien reconnus ou
 * nouveaux, combien de lignes illisibles, combien de produits en rayon passeraient à zéro, et si le fichier serait
 * appliqué ou retenu pour l'équipe. Les contrôles sont ceux de l'envoi réel (`evaluateFile`) ; l'analyse n'est qu'une
 * lecture : le stock, les produits et les dépôts ne changent pas, et l'analyse temporaire est supprimée.
 *
 * C'est l'étape « Vérifier » de la mise à jour : la personne voit ce qui va se passer, puis confirme (ou pas).
 */
export async function previewStockDeposit(params: { scope: TenantScope; fileName: string; bytes: Uint8Array }): Promise<PreviewResult> {
  const { scope, bytes } = params;
  const fileName = cleanDepositFileName(params.fileName ?? "");
  if (!DEPOSIT_ACCEPTED.test(fileName)) return { ok: false, error: `Format non accepté. Envoyez un fichier ${DEPOSIT_ACCEPTED_LABEL}.` };
  if (bytes.byteLength === 0) return { ok: false, error: "Le fichier est vide." };
  if (bytes.byteLength > depositMaxBytes("WEB")) return { ok: false, error: `Le fichier dépasse ${depositMaxLabel("WEB")}.` };
  if (rateLimited(`stock-preview:${scope.pharmacyId}`, PREVIEW_HOURLY_LIMIT, 60 * 60 * 1000)) {
    return { ok: false, error: "Trop de vérifications pour le moment. Réessayez dans une heure, ou prévenez votre conseiller PharmaBoost." };
  }

  let jobId: string | null = null;
  try {
    const analysed = await analyseStockImport({ scope, fileName, bytes });
    jobId = analysed.jobId;
    if (analysed.missing.length > 0) {
      const labels: Record<string, string> = IMPORT_FIELD_LABELS;
      const names = analysed.missing.map((field) => labels[field] ?? field).join(", ");
      return { ok: false, error: `Colonnes non reconnues : ${names}. Envoyez l'édition d'inventaire complète de votre logiciel.` };
    }
    const evaluation = await evaluateFile(scope.pharmacyId, analysed, { zeroAbsent: true, enforce: true, showAbsent: true });
    if (evaluation.validLines === 0) return { ok: false, error: "Aucune ligne de stock lisible dans ce fichier : vérifiez qu'il contient bien les quantités en stock." };
    const count = (...statuses: string[]) => analysed.rows.filter((line) => statuses.includes(line.status)).length;
    return {
      ok: true,
      preview: {
        fileName,
        products: evaluation.validLines,
        recognized: count("MEDICAMENT", "PRODUIT_EXISTANT"),
        created: count("A_VERIFIER", "NON_RECONNU"),
        invalid: evaluation.invalid,
        knownStock: evaluation.knownLines,
        absent: evaluation.absentLines,
        verdict: evaluation.verdict.verdict,
        reason: evaluation.verdict.verdict === "HOLD" ? evaluation.verdict.reason : null,
        warnings: analysed.warnings ?? [],
      },
    };
  } catch (error) {
    console.error(`[stock-preview] lecture du fichier en échec : ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, error: readableError(error, READ_FALLBACK) };
  } finally {
    // L'analyse n'est qu'une lecture : elle ne reste pas parmi les imports « en attente ».
    if (jobId) {
      const id = jobId;
      await quietly("suppression de l'analyse", () => prisma.importJob.deleteMany({ where: { id, pharmacyId: scope.pharmacyId, status: "PENDING" } }));
    }
  }
}

// ---------------------------------------------------------------- Trancher, relancer

/** L'équipe tranche un fichier resté en attente : l'appliquer en entier, l'appliquer sans remise à zéro, ou l'écarter. */
export async function decideHeldDeposit(id: string, adminId: string, decision: DepositDecision): Promise<DepositOutcome> {
  if (!(DEPOSIT_DECISIONS as readonly string[]).includes(decision)) return { ok: false, error: "Décision inconnue." };
  const row = await prisma.stockDeposit.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Dépôt introuvable." };
  if (row.status !== "HELD") return { ok: false, error: "Ce fichier a déjà été traité." };
  const decidedAt = new Date();

  if (decision === "REJECT") {
    const claimed = await prisma.stockDeposit.updateMany({ where: { id, status: "HELD" }, data: { status: "REJECTED", decidedById: adminId, decidedAt } });
    if (claimed.count === 0) return { ok: false, error: "Ce fichier a déjà été traité." };
    await recordAudit({ action: "stock.deposit_decided", entityType: "StockDeposit", entityId: id, pharmacyId: row.pharmacyId, platformAdminId: adminId, metadata: { decision } });
    await quietly("notification du titulaire", () =>
      createNotification({
        pharmacyId: row.pharmacyId,
        type: "SYSTEM",
        severity: "WARNING",
        title: "Fichier de stock écarté",
        body: "L'équipe PharmaBoost n'a pas appliqué votre dernier fichier : votre stock n'a pas changé. Envoyez votre stock complet (tous les produits en stock).",
        linkUrl: "/stock/mise-a-jour",
      }),
    );
    return { ok: true, deposit: toView({ ...row, status: "REJECTED", decidedById: adminId, decidedAt }) };
  }

  const ready = await prepareReplay(row, adminId, "HELD", decidedAt);
  if (!ready.ok) return ready;
  const done = await processDeposit({ row: ready.row, scope: ready.owner.scope, pharmacyIsDemo: ready.owner.pharmacyIsDemo, bytes: ready.bytes, decided: true, zeroAbsent: decision === "APPLY_FULL", adminId });
  await recordAudit({ action: "stock.deposit_decided", entityType: "StockDeposit", entityId: id, pharmacyId: row.pharmacyId, platformAdminId: adminId, metadata: { decision, status: done.status } });
  await syncConnectionAfterReplay(done);
  await announce(done, { scope: ready.owner.scope, adminId, notifyTeam: false, pharmacyName: ready.owner.pharmacyName });
  return { ok: true, deposit: toView(done) };
}

/** Relit le fichier gardé d'un dépôt en échec (ou resté « en cours » trop longtemps) et refait tout, comme à la réception. */
export async function retryDeposit(id: string, adminId: string): Promise<DepositOutcome> {
  const row = await prisma.stockDeposit.findUnique({ where: { id } });
  if (!row) return { ok: false, error: "Dépôt introuvable." };
  const stalled = isDepositStalled(row, new Date());
  if (row.status !== "FAILED" && !stalled) return { ok: false, error: "Seul un fichier en échec, ou resté trop longtemps en cours de lecture, peut être relancé." };

  const ready = await prepareReplay(row, adminId, stalled ? "RECEIVED" : "FAILED", new Date());
  if (!ready.ok) return ready;
  await recordAudit({ action: "stock.deposit_retried", entityType: "StockDeposit", entityId: id, pharmacyId: row.pharmacyId, platformAdminId: adminId });
  const done = await processDeposit({ row: ready.row, scope: ready.owner.scope, pharmacyIsDemo: ready.owner.pharmacyIsDemo, bytes: ready.bytes, decided: false, zeroAbsent: true, adminId });
  await syncConnectionAfterReplay(done);
  await announce(done, { scope: ready.owner.scope, adminId, notifyTeam: false, pharmacyName: ready.owner.pharmacyName });
  return { ok: true, deposit: toView(done) };
}

type Replay = { ok: true; row: StockDeposit; bytes: Uint8Array; owner: NonNullable<Awaited<ReturnType<typeof ownerScopeForPharmacy>>> } | { ok: false; error: string };

/**
 * Ce qu'il faut avant de rejouer un fichier gardé : aucun envoi plus récent déjà
 * appliqué (un vieux fichier n'écrase pas un stock à jour), un titulaire actif,
 * le fichier lisible, puis la place prise d'un seul geste (HELD, FAILED ou
 * RECEIVED bloqué → RECEIVED) : deux administrateurs qui cliquent en même temps
 * n'appliquent pas le fichier deux fois.
 */
async function prepareReplay(row: StockDeposit, adminId: string, from: "HELD" | "FAILED" | "RECEIVED", decidedAt: Date): Promise<Replay> {
  const newer = await prisma.stockDeposit.findFirst({ where: { pharmacyId: row.pharmacyId, status: "APPLIED", receivedAt: { gt: row.receivedAt } }, select: { id: true } });
  if (newer) return { ok: false, error: DEPOSIT_SUPERSEDED_ERROR };
  const owner = await ownerScopeForPharmacy(row.pharmacyId);
  if (!owner) return { ok: false, error: "Cette officine n'a pas de titulaire actif : le stock ne peut pas être appliqué." };
  const file = await readStoredFile(row);
  if (!file.ok) return { ok: false, error: FILE_REASONS[file.reason] };
  // Un dépôt « en cours » reste « en cours » : la place se prend en changeant sa date de décision (celle qu'on vient de lire).
  const claimed = await prisma.stockDeposit.updateMany({
    where: { id: row.id, status: from, ...(from === "RECEIVED" ? { decidedAt: row.decidedAt } : {}) },
    data: { status: "RECEIVED", decidedById: adminId, decidedAt },
  });
  if (claimed.count === 0) return { ok: false, error: "Ce fichier a déjà été traité." };
  return { ok: true, row: { ...row, status: "RECEIVED", decidedById: adminId, decidedAt }, bytes: file.bytes, owner };
}

/**
 * Le stock vient d'être appliqué par l'équipe (décision ou relance) : la
 * liaison du serveur le sait aussi — dernière synchronisation, erreur d'avant
 * effacée — sinon la page Connexion dit « jamais » et le stock reste « périmé ».
 */
async function syncConnectionAfterReplay(done: StockDeposit): Promise<void> {
  if (done.status !== "APPLIED") return;
  await quietly("mise à jour de la liaison", async () => {
    await prisma.stockConnection.updateMany({ where: { pharmacyId: done.pharmacyId }, data: { lastSyncAt: new Date(), lastSyncLines: done.lines ?? 0, lastError: null } });
    await prisma.stockConnection.updateMany({ where: { pharmacyId: done.pharmacyId, status: "ERROR" }, data: { status: "CONNECTED" } });
  });
}

/**
 * Un envoi appliqué remplace les plus anciens de la même officine restés en
 * attente, en échec ou bloqués : ils ne se rejouent plus (ils écraseraient un
 * stock à jour) et ne restent pas dans « À trancher ».
 */
async function closeSupersededDeposits(applied: StockDeposit): Promise<void> {
  await quietly("fermeture des envois remplacés", () =>
    prisma.stockDeposit.updateMany({
      where: {
        pharmacyId: applied.pharmacyId,
        receivedAt: { lt: applied.receivedAt },
        OR: [{ status: { in: ["HELD", "FAILED"] } }, { status: "RECEIVED", receivedAt: { lt: new Date(Date.now() - DEPOSIT_STALLED_MS) } }],
      },
      data: { status: "REJECTED", message: DEPOSIT_SUPERSEDED_MESSAGE },
    }),
  );
}

/**
 * Passage quotidien : un dépôt resté « en cours » plus de 15 minutes a été
 * interrompu (hébergeur, redéploiement). Il passe en échec — l'équipe peut le
 * relancer, le fichier est gardé — ou, si un envoi plus récent a déjà mis le
 * stock à jour, il est écarté. Les analyses de stock restées « en attente » aussi
 * longtemps sont fermées : le fichier entier n'a pas à dormir dans leur contenu.
 */
export async function closeStalledDeposits(now: Date): Promise<{ failed: number; superseded: number; jobsClosed: number }> {
  const cutoff = new Date(now.getTime() - DEPOSIT_ABANDONED_MS);
  // Un dépôt que l'équipe vient de reprendre (relance) n'est pas abandonné, même si sa date de réception est ancienne.
  const unclaimed: Prisma.StockDepositWhereInput = { OR: [{ decidedAt: null }, { decidedAt: { lt: cutoff } }] };
  const stalled = await prisma.stockDeposit.findMany({
    where: { status: "RECEIVED", receivedAt: { lt: cutoff }, ...unclaimed },
    select: { id: true, pharmacyId: true, receivedAt: true },
    orderBy: { receivedAt: "asc" },
    take: PURGE_BATCH,
  });
  let failed = 0;
  let superseded = 0;
  for (const row of stalled) {
    const newer = await prisma.stockDeposit.findFirst({ where: { pharmacyId: row.pharmacyId, status: "APPLIED", receivedAt: { gt: row.receivedAt } }, select: { id: true } });
    const claimed = await prisma.stockDeposit.updateMany({
      where: { id: row.id, status: "RECEIVED", ...unclaimed },
      data: newer ? { status: "REJECTED", message: DEPOSIT_SUPERSEDED_MESSAGE } : { status: "FAILED", message: DEPOSIT_INTERRUPTED_MESSAGE },
    });
    if (claimed.count > 0) {
      if (newer) superseded += 1;
      else failed += 1;
    }
  }
  const jobs = await prisma.importJob.updateMany({
    where: { kind: "STOCK", status: "PENDING", createdAt: { lt: cutoff } },
    data: { status: "FAILED", finishedAt: now, payload: {} as never },
  });
  return { failed, superseded, jobsClosed: jobs.count };
}

// ---------------------------------------------------------------- Le traitement

/** Lignes de stock que l'officine tient d'un import : ce qu'un fichier complet doit retrouver. */
async function countKnownStockLines(pharmacyId: string): Promise<number> {
  const [drugs, products] = await Promise.all([
    prisma.pharmacyDrugStock.count({ where: { pharmacyId, source: "IMPORT", quantity: { gt: 0 } } }),
    prisma.product.count({ where: { pharmacyId, deletedAt: null, stockItem: { quantity: { gt: 0 } }, stockMovements: { some: { type: "IMPORT" } } } }),
  ]);
  return drugs + products;
}

type AnalysedFile = { rows: { status: string; targetId: string | null }[]; summary: { invalid: number }; incomplete: boolean; incompleteReason?: string };

/**
 * Ce que vaut un fichier analysé, AVANT d'écrire quoi que ce soit : combien de lignes valides, combien d'illisibles,
 * combien de produits connus, et le verdict — appliquer, ou attendre l'équipe. C'est le seul endroit où ce verdict se
 * décide : l'envoi réel et l'aperçu montré avant la confirmation lisent la même réponse.
 *
 * `enforce: false` (l'équipe a déjà tranché) ne calcule rien de plus que les comptes. `showAbsent` demande les produits
 * absents même quand le fichier est déjà retenu : l'aperçu les montre toujours.
 */
async function evaluateFile(pharmacyId: string, preview: AnalysedFile, options: { zeroAbsent: boolean; enforce: boolean; showAbsent: boolean }) {
  const validLines = preview.rows.filter((line) => line.status !== "INVALIDE").length;
  const invalid = preview.summary.invalid;
  const knownLines = await countKnownStockLines(pharmacyId);
  const base = { validLines, knownLines, invalidLines: invalid, incompleteReason: preview.incomplete ? preview.incompleteReason ?? INCOMPLETE_FALLBACK : null };
  let verdict: DepositAssessment = options.enforce ? assessDeposit(base) : { verdict: "APPLY" };
  let absentLines: number | null = null;
  const worthCounting = options.zeroAbsent && knownLines > 0 && (options.showAbsent || (options.enforce && verdict.verdict === "APPLY" && knownLines >= DEPOSIT_HOLD_MIN_KNOWN));
  if (worthCounting) {
    absentLines = await countAbsentLines(pharmacyId, preview.rows, knownLines);
    // Un fichier qui passe les trois premiers contrôles est encore compté : combien de produits connus resteraient à zéro ?
    if (options.enforce && verdict.verdict === "APPLY") verdict = assessDeposit({ ...base, absentLines });
  }
  return { validLines, invalid, knownLines, absentLines, verdict };
}

/**
 * Combien de produits connus (déjà importés, en rayon) ne figurent PAS dans le fichier : ceux que « stock complet » mettrait
 * à zéro. Même règle que la remise à zéro elle-même, mais en lecture seule, avant d'écrire quoi que ce soit.
 */
async function countAbsentLines(pharmacyId: string, rows: { status: string; targetId: string | null }[], knownLines: number): Promise<number> {
  const presentationIds = rows.filter((row) => row.status === "MEDICAMENT" && row.targetId).map((row) => row.targetId as string);
  const productIds = rows.filter((row) => row.status === "PRODUIT_EXISTANT" && row.targetId).map((row) => row.targetId as string);
  const [drugsInFile, productsInFile] = await Promise.all([
    presentationIds.length > 0 ? prisma.pharmacyDrugStock.count({ where: { pharmacyId, source: "IMPORT", quantity: { gt: 0 }, presentationId: { in: presentationIds } } }) : 0,
    productIds.length > 0 ? prisma.product.count({ where: { pharmacyId, deletedAt: null, id: { in: productIds }, stockItem: { quantity: { gt: 0 } }, stockMovements: { some: { type: "IMPORT" } } } }) : 0,
  ]);
  return Math.max(0, knownLines - (drugsInFile ?? 0) - (productsInFile ?? 0));
}

/** Un message du moteur n'est montré tel quel que s'il parle du fichier ; une panne technique reste dans les journaux. */
function readableError(error: unknown, fallback: string): string {
  const text = error instanceof Error ? error.message.trim() : "";
  return text && text.length <= 400 && /fichier|PDF|ligne|colonne|inventaire/i.test(text) && !/prisma/i.test(text) ? text : fallback;
}

const READ_FALLBACK = "Le fichier n'a pas pu être lu. Envoyez l'édition d'inventaire complète de votre logiciel (CSV, Excel ou PDF).";
const WRITE_FALLBACK = "Le stock n'a pas pu être mis à jour : rien n'a été modifié. L'équipe PharmaBoost a été prévenue.";
const INCOMPLETE_FALLBACK = "Une partie du fichier n'a pas pu être lue";

/** Une analyse qui n'aboutit pas ne reste jamais « en attente » : le fichier lui-même vit dans le stockage, pas dans l'analyse. */
async function closeImportJob(jobId: string | null): Promise<void> {
  if (!jobId) return;
  await quietly("clôture de l'analyse", () => prisma.importJob.updateMany({ where: { id: jobId, status: "PENDING" }, data: { status: "FAILED", finishedAt: new Date(), payload: {} as never } }));
}

/**
 * Un fichier qui n'est pas un stock (colonnes qu'on ne reconnaît pas, rien de
 * lisible) ne reste pas : « Relancer » ne le réparerait jamais, et c'est peut-être
 * un fichier envoyé par erreur. Rend ce qu'il faut écrire sur le dépôt ; si la
 * suppression échoue, le fichier reste référencé et la purge de 90 jours le retentera.
 */
async function discardStoredFile(row: StockDeposit): Promise<Prisma.StockDepositUncheckedUpdateInput> {
  // La clé est celle que le moteur a lui-même écrite, ou relue et vérifiée (`readStoredFile`) avant le rejeu.
  if (!row.storageKey) return {};
  try {
    await getStorageProvider().delete(row.storageKey);
    return { storageKey: null, fileDeletedAt: new Date() };
  } catch (error) {
    console.error(`[stock-deposit] suppression du fichier ${row.id} impossible : ${error instanceof Error ? error.message : String(error)}`);
    return {};
  }
}

/**
 * Lit le fichier d'un dépôt, décide, applique. Ne lève jamais : tout échec
 * devient un dépôt « FAILED » avec un message lisible, et rien n'est écrit à
 * moitié (l'écriture du stock est une seule transaction).
 *
 * `decided` : l'équipe a déjà tranché, les garde-fous (fichier incomplet, lignes
 * illisibles, fichier trop petit) ne s'appliquent plus — c'est sa décision.
 * `zeroAbsent` : fichier = stock complet, les absents passent à zéro.
 * `adminId` : l'administrateur de la console qui agit au nom du titulaire, nommé
 * dans le journal de l'import.
 */
async function processDeposit(params: { row: StockDeposit; scope: TenantScope; pharmacyIsDemo: boolean; bytes: Uint8Array; decided: boolean; zeroAbsent: boolean; adminId: string | null }): Promise<StockDeposit> {
  const { row, scope } = params;
  const settle = (data: Prisma.StockDepositUncheckedUpdateInput) => prisma.stockDeposit.update({ where: { id: row.id }, data });
  let jobId: string | null = null;
  try {
    const preview = await analyseStockImport({ scope, fileName: row.fileName, bytes: params.bytes });
    jobId = preview.jobId;

    if (preview.missing.length > 0) {
      await closeImportJob(jobId);
      const labels: Record<string, string> = IMPORT_FIELD_LABELS;
      const names = preview.missing.map((field) => labels[field] ?? field).join(", ");
      return await settle({ status: "FAILED", importJobId: jobId, message: `Colonnes non reconnues : ${names}. Envoyez l'édition d'inventaire complète de votre logiciel.`, ...(await discardStoredFile(row)) });
    }

    const validLines = preview.rows.filter((line) => line.status !== "INVALIDE").length;
    const invalid = preview.summary.invalid;
    if (validLines === 0) {
      await closeImportJob(jobId);
      return await settle({ status: "FAILED", importJobId: jobId, lines: 0, invalid, message: "Aucune ligne de stock lisible dans ce fichier : vérifiez qu'il contient bien les quantités en stock.", ...(await discardStoredFile(row)) });
    }

    // Les mêmes contrôles que l'aperçu montre avant l'envoi (voir `previewStockDeposit`) : un seul endroit les décide.
    const { knownLines, verdict } = await evaluateFile(scope.pharmacyId, preview, { zeroAbsent: params.zeroAbsent, enforce: !params.decided, showAbsent: false });
    if (!params.decided) {
      if (verdict.verdict === "HOLD") {
        await closeImportJob(jobId);
        return await settle({ status: "HELD", importJobId: jobId, lines: validLines, invalid, knownLines, message: verdict.reason });
      }
    }

    // Sans personne pour trancher, une piste incertaine devient un produit à part entière : au prochain fichier, son nom exact le retrouvera.
    const decisions: Record<string, RowDecision> = {};
    for (const line of preview.rows) if (line.status === "A_VERIFIER") decisions[String(line.line)] = { kind: "CREER_PRODUIT" };
    const outcome = await commitStockImport({
      scope,
      pharmacyIsDemo: params.pharmacyIsDemo,
      jobId,
      decisions,
      createUnknownByDefault: true,
      zeroAbsent: params.zeroAbsent,
      ...(params.adminId ? { actor: { platformAdminId: params.adminId } } : {}),
    });
    const applied = await settle({
      status: "APPLIED",
      importJobId: jobId,
      lines: validLines,
      created: outcome.productsCreated,
      updated: outcome.productsUpdated + outcome.drugsUpserted,
      invalid: outcome.invalid,
      zeroed: outcome.zeroed,
      knownLines,
      message: null,
      appliedAt: new Date(),
    });
    await closeSupersededDeposits(applied);
    return applied;
  } catch (error) {
    console.error(`[stock-deposit] traitement du dépôt ${row.id} en échec : ${error instanceof Error ? error.message : String(error)}`);
    await closeImportJob(jobId);
    const message = readableError(error, jobId ? WRITE_FALLBACK : READ_FALLBACK);
    // Un fichier dont rien ne sera jamais lisible ne reste pas ; une panne passagère, si : « Relancer » la répare.
    const dropped = error instanceof UnreadableFileError ? await discardStoredFile(row) : {};
    try {
      return await settle({ status: "FAILED", importJobId: jobId, message, ...dropped });
    } catch (settleError) {
      // La base elle-même ne répond plus : le dépôt reste « en cours » en base, le passage quotidien le refermera.
      console.error(`[stock-deposit] dépôt ${row.id} : état impossible à écrire : ${settleError instanceof Error ? settleError.message : String(settleError)}`);
      return { ...row, status: "FAILED", importJobId: jobId, message, ...(dropped.storageKey === null ? { storageKey: null } : {}) };
    }
  }
}

// ---------------------------------------------------------------- Prévenir

/** L'issue d'un dépôt : journal d'audit (jamais le contenu du fichier), équipe, titulaire. Aucun échec ici ne fait échouer le dépôt. */
async function announce(row: StockDeposit, ctx: { scope: TenantScope; adminId: string | null; notifyTeam: boolean; pharmacyName?: string }): Promise<void> {
  const view = toView(row);
  const action: AuditAction | null = row.status === "APPLIED" ? "stock.deposit_applied" : row.status === "HELD" ? "stock.deposit_held" : row.status === "FAILED" ? "stock.deposit_failed" : null;
  if (action) {
    await recordAudit({
      action,
      entityType: "StockDeposit",
      entityId: row.id,
      pharmacyId: row.pharmacyId,
      userId: row.source === "WEB" ? ctx.scope.userId : null,
      platformAdminId: ctx.adminId,
      metadata: { source: row.source, lines: row.lines, created: row.created, updated: row.updated, invalid: row.invalid, zeroed: row.zeroed, knownLines: row.knownLines },
    });
  }

  const needsAttention = row.status === "HELD" || row.status === "FAILED";
  // Un dépôt de l'officine de démonstration ne réveille pas l'équipe PharmaBoost.
  if (ctx.notifyTeam && !ctx.scope.isDemo) {
    await quietly("notification de l'équipe", async () => {
      const name = ctx.pharmacyName ?? (await prisma.pharmacy.findUnique({ where: { id: row.pharmacyId }, select: { name: true } }))?.name ?? "Officine";
      const detail = needsAttention ? row.message ?? "" : describeDepositResult(view);
      await notifyAdmins({
        type: "STOCK_DEPOSIT",
        title: `${name} — stock reçu`,
        body: truncate(`${DEPOSIT_SOURCE_LABELS[view.source]} · ${row.fileName}${detail ? ` · ${detail}` : ""}`),
        linkUrl: "/admin/depots-stock",
        severity: needsAttention ? "WARNING" : "INFO",
      });
    });
  }

  // Le succès est déjà annoncé au titulaire par l'import lui-même.
  if (needsAttention) {
    await quietly("notification du titulaire", () =>
      createNotification({
        pharmacyId: row.pharmacyId,
        userId: ctx.scope.userId,
        type: row.status === "FAILED" ? "IMPORT_FAILED" : "SYSTEM",
        severity: "WARNING",
        title: row.status === "FAILED" ? "Votre fichier de stock n'a pas pu être lu" : "Votre fichier de stock est en vérification",
        body: truncate(row.status === "FAILED" ? `${row.message ?? "Fichier non lu."} Votre stock n'a pas changé.` : "Votre fichier demande une vérification : l'équipe PharmaBoost s'en occupe, votre stock n'a pas changé."),
        linkUrl: "/stock/mise-a-jour",
      }),
    );
  }
}

function truncate(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_NOTE ? `${flat.slice(0, MAX_NOTE - 1)}…` : flat;
}

async function quietly(step: string, run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    console.error(`[stock-deposit] ${step} impossible : ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Ce que le stock reçu laisse à faire sans retenir le titulaire : comprendre
 * les produits nouveaux, chercher leurs photos. À lancer dans `after()`.
 */
export async function continueAfterStockDeposit(scope: TenantScope): Promise<void> {
  const { classifyPharmacyProducts } = await import("./product-classification");
  await classifyPharmacyProducts({ scope, maxAiBatches: 60 }).catch((error) => console.error("[stock-deposit] classification différée impossible", error));
  const { fetchMissingProductImages } = await import("./product-images");
  await fetchMissingProductImages({ pharmacyId: scope.pharmacyId, limit: 200 }).catch((error) => console.error("[stock-deposit] photos différées impossibles", error));
}
