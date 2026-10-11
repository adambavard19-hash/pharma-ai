/**
 * Les vidéos et images d'attente hébergées par PharmaBoost (port de stockage : S3, base ou dossier local).
 *
 * Les clés sont construites ici, jamais reçues d'un client : la route de lecture retrouve la clé dans la fiche du
 * contenu, après avoir vérifié que la personne a le droit de voir ce contenu. Deviner une clé ne sert à rien.
 */

export const VIDEO_TYPES = { "video/mp4": "mp4", "video/webm": "webm" } as const;
export const POSTER_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
export type VideoMime = keyof typeof VIDEO_TYPES;
export type PosterMime = keyof typeof POSTER_TYPES;

export const DEFAULT_VIDEO_MAX_MB = 200;
export const POSTER_MAX_MB = 5;
/** Une micro-vidéo dure 3 minutes au plus (60 à 180 s recommandées). */
export const MICRO_VIDEO_MAX_SECONDS = 180;

/** Le plafond des vidéos, réglable (`ACADEMY_VIDEO_MAX_MB`), borné à 1 Go. */
export function videoMaxBytes(raw: string | undefined | null): number {
  const value = Number(raw);
  const mb = Number.isFinite(value) && value >= 1 ? Math.min(1024, Math.floor(value)) : DEFAULT_VIDEO_MAX_MB;
  return mb * 1024 * 1024;
}

export type UploadCheck = { ok: true; mime: string; extension: string } | { ok: false; error: string };

export function checkUpload(kind: "video" | "poster", file: { type: string; size: number }, maxVideoBytes: number): UploadCheck {
  if (file.size <= 0) return { ok: false, error: "Le fichier est vide." };
  if (kind === "video") {
    const extension = VIDEO_TYPES[file.type as VideoMime];
    if (!extension) return { ok: false, error: "Vidéo refusée : MP4 ou WebM seulement." };
    if (file.size > maxVideoBytes) return { ok: false, error: `Vidéo trop lourde : ${Math.round(maxVideoBytes / 1024 / 1024)} Mo au plus.` };
    return { ok: true, mime: file.type, extension };
  }
  const extension = POSTER_TYPES[file.type as PosterMime];
  if (!extension) return { ok: false, error: "Image refusée : JPEG, PNG ou WebP seulement." };
  if (file.size > POSTER_MAX_MB * 1024 * 1024) return { ok: false, error: `Image trop lourde : ${POSTER_MAX_MB} Mo au plus.` };
  return { ok: true, mime: file.type, extension };
}

/** Vérifie la signature du fichier (les premiers octets), pas seulement le type annoncé par le navigateur. */
export function sniffMime(bytes: Uint8Array): string | null {
  const at = (index: number) => bytes[index];
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp") return "video/mp4";
  if (bytes.length >= 4 && at(0) === 0x1a && at(1) === 0x45 && at(2) === 0xdf && at(3) === 0xa3) return "video/webm";
  return null;
}

export function videoKey(contentId: string, extension: string, stamp: number): string {
  return `academie/${contentId}/video-${stamp}.${extension}`;
}

export function posterKey(contentId: string): string {
  return `academie/${contentId}/poster`;
}

/** L'adresse publique (côté application) d'une ressource : toujours la route contrôlée. */
export function mediaPath(contentId: string, kind: "video" | "poster", version?: string | number): string {
  return `/api/academie/media/${encodeURIComponent(contentId)}/${kind}${version !== undefined ? `?v=${encodeURIComponent(String(version))}` : ""}`;
}

/** Une image d'attente hébergée par PharmaBoost (et non une adresse externe). */
export function isHostedPoster(posterUrl: string | null | undefined, contentId: string): boolean {
  return !!posterUrl && posterUrl.startsWith(mediaPath(contentId, "poster"));
}

export function mimeOfKey(key: string): string {
  if (key.endsWith(".webm")) return "video/webm";
  if (key.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}

export type ByteRange = { start: number; end: number };

/**
 * L'en-tête `Range` d'une requête vidéo (« bytes=0- », « bytes=100-199 », « bytes=-500 »). Une seule plage acceptée.
 * `null` : pas de plage demandée (réponse entière). `"invalid"` : plage impossible (416).
 */
export function parseRange(header: string | null | undefined, size: number): ByteRange | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0) return "invalid";
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return "invalid";
  let start: number;
  let end: number;
  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (suffix <= 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return "invalid";
  return { start, end };
}
