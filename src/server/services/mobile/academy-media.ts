import "server-only";
import { prisma } from "@/server/db/client";
import { getStorageProvider } from "@/server/ai/registry";
import { checkUpload, isHostedPoster, mediaPath, mimeOfKey, posterKey, sniffMime, videoKey, videoMaxBytes } from "@/core/academy/media";
import { contentVisibleWhere, type AcademyViewer } from "@/core/academy/visibility";
import { afterEdit } from "@/core/academy/review";

/**
 * Les vidéos et images d'attente de l'Académie, à travers le port de stockage (S3, base ou dossier local, selon le
 * registre). La console les dépose ; l'application les lit par `/api/academie/media/<contenu>/<video|poster>`, qui
 * vérifie la session ET le droit de voir ce contenu. La clé est lue dans la fiche du contenu, jamais dans l'adresse.
 *
 * Limites d'hébergement à connaître : le port relit un fichier en entier (pas de lecture partielle) ; un petit cache
 * en mémoire évite de le relire à chaque plage demandée par le lecteur vidéo. En production, préférer S3 au stockage
 * en base pour des vidéos de plusieurs dizaines de Mo, et vérifier la taille de requête acceptée par l'hébergeur.
 */

export function academyVideoMaxBytes(): number {
  return videoMaxBytes(process.env.ACADEMY_VIDEO_MAX_MB);
}

export type StoreResult = { ok: true; url: string } | { ok: false; error: string };

/** Dépose une vidéo ou une image d'attente pour un contenu PharmaBoost (console). Renvoie le contenu en brouillon. */
export async function storeAcademyMedia(contentId: string, kind: "video" | "poster", file: { type: string; size: number; bytes: Uint8Array }, now = new Date()): Promise<StoreResult> {
  const content = await prisma.trainingContent.findFirst({ where: { id: contentId, pharmacyId: null }, select: { id: true, videoAssetKey: true } });
  if (!content) return { ok: false, error: "Contenu introuvable." };
  const check = checkUpload(kind, file, academyVideoMaxBytes());
  if (!check.ok) return check;
  const sniffed = sniffMime(file.bytes.subarray(0, 64));
  const family = kind === "video" ? "video/" : "image/";
  if (!sniffed || !sniffed.startsWith(family) || (kind === "poster" && sniffed !== check.mime)) {
    return { ok: false, error: kind === "video" ? "Ce fichier n'est pas une vidéo MP4 ou WebM lisible." : "Ce fichier n'est pas une image JPEG, PNG ou WebP." };
  }

  const storage = getStorageProvider();
  if (kind === "video") {
    const key = videoKey(contentId, sniffed === "video/webm" ? "webm" : "mp4", now.getTime());
    await storage.put(key, file.bytes, sniffed);
    await prisma.trainingContent.update({ where: { id: contentId }, data: { videoAssetKey: key, ...afterEdit() } });
    if (content.videoAssetKey && content.videoAssetKey !== key) await storage.delete(content.videoAssetKey).catch(() => undefined);
    if (content.videoAssetKey) forget(content.videoAssetKey);
    return { ok: true, url: mediaPath(contentId, "video", key.split("/").pop()) };
  }
  const key = posterKey(contentId);
  await storage.put(key, file.bytes, sniffed);
  forget(key);
  const url = mediaPath(contentId, "poster", now.getTime());
  await prisma.trainingContent.update({ where: { id: contentId }, data: { posterUrl: url } });
  return { ok: true, url };
}

/** Retire la vidéo hébergée (le contenu retombe sur son lien intégré, s'il en a un) : retour au brouillon. */
export async function removeAcademyVideo(contentId: string): Promise<boolean> {
  const content = await prisma.trainingContent.findFirst({ where: { id: contentId, pharmacyId: null }, select: { videoAssetKey: true } });
  if (!content) return false;
  await prisma.trainingContent.update({ where: { id: contentId }, data: { videoAssetKey: null, ...afterEdit() } });
  if (content.videoAssetKey) {
    await getStorageProvider().delete(content.videoAssetKey).catch(() => undefined);
    forget(content.videoAssetKey);
  }
  return true;
}

// --- Lecture -----------------------------------------------------------------------------------------------

/** Qui demande : une personne de l'application (règle de visibilité) ou l'équipe PharmaBoost (aperçu de la console). */
export type MediaRequester = { type: "viewer"; viewer: AcademyViewer } | { type: "admin" };

export type MediaFile = { bytes: Uint8Array; mime: string; key: string };

const CACHE_LIMIT = 256 * 1024 * 1024;
const cache = new Map<string, Uint8Array>();
let cached = 0;

function forget(key: string) {
  const value = cache.get(key);
  if (value) {
    cache.delete(key);
    cached -= value.length;
  }
}

function remember(key: string, bytes: Uint8Array) {
  if (bytes.length > CACHE_LIMIT / 4) return;
  while (cached + bytes.length > CACHE_LIMIT && cache.size > 0) {
    const [oldest, value] = cache.entries().next().value as [string, Uint8Array];
    cache.delete(oldest);
    cached -= value.length;
  }
  cache.set(key, bytes);
  cached += bytes.length;
}

/** Le fichier, si la personne a le droit de voir ce contenu. `null` sinon (même réponse qu'un contenu inconnu). */
export async function readAcademyMedia(requester: MediaRequester, contentId: string, kind: "video" | "poster", now = new Date()): Promise<MediaFile | null> {
  const where = requester.type === "admin" ? { id: contentId, pharmacyId: null } : { AND: [contentVisibleWhere(requester.viewer, now), { id: contentId }] };
  const content = await prisma.trainingContent.findFirst({ where, select: { id: true, videoAssetKey: true, posterUrl: true } });
  if (!content) return null;
  let key: string | null = null;
  if (kind === "video") key = content.videoAssetKey;
  else if (isHostedPoster(content.posterUrl, content.id)) key = posterKey(content.id);
  if (!key) return null;

  let bytes = cache.get(key) ?? null;
  if (bytes) {
    // Plus récent en fin de file (éviction des plus anciens d'abord).
    cache.delete(key);
    cache.set(key, bytes);
  } else {
    bytes = await getStorageProvider().read(key);
    if (!bytes) return null;
    remember(key, bytes);
  }
  const mime = kind === "video" ? mimeOfKey(key) : (sniffMime(bytes.subarray(0, 64)) ?? "application/octet-stream");
  return { bytes, mime, key };
}
