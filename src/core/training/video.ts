/**
 * Une vidéo de formation s'intègre dans la page seulement quand elle vient
 * d'une plateforme vidéo connue, dont on sait construire l'adresse de lecteur
 * à partir d'un identifiant vérifié. Toute autre adresse s'ouvre dans un
 * nouvel onglet : on n'embarque jamais une page inconnue dans PharmaBoost.
 *
 * L'hôte est comparé exactement (« youtube.com.exemple.fr » n'est pas
 * YouTube), l'identifiant est validé caractère par caractère, et YouTube passe
 * par son domaine sans cookie publicitaire.
 */

export type VideoPlatform = "YOUTUBE" | "VIMEO" | "DAILYMOTION";

export const VIDEO_PLATFORM_LABELS: Record<VideoPlatform, string> = {
  YOUTUBE: "YouTube",
  VIMEO: "Vimeo",
  DAILYMOTION: "Dailymotion",
};

export type VideoEmbed = { platform: VideoPlatform; embedUrl: string };

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);
const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
const DAILYMOTION_HOSTS = new Set(["dailymotion.com", "www.dailymotion.com"]);

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{1,12}$/;
const DAILYMOTION_ID = /^[A-Za-z0-9]{5,12}$/;

function parse(value: string): URL | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function youtube(id: string | null | undefined): VideoEmbed | null {
  return id && YOUTUBE_ID.test(id) ? { platform: "YOUTUBE", embedUrl: `https://www.youtube-nocookie.com/embed/${id}` } : null;
}

/** L'adresse du lecteur intégrable, ou null si la vidéo doit s'ouvrir à part. */
export function videoEmbed(value: string | null | undefined): VideoEmbed | null {
  if (!value) return null;
  const url = parse(value);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") return youtube(segments[0]);
  if (YOUTUBE_HOSTS.has(host)) {
    if (segments[0] === "watch") return youtube(url.searchParams.get("v"));
    if (segments[0] === "embed" || segments[0] === "shorts" || segments[0] === "live") return youtube(segments[1]);
    return null;
  }

  if (VIMEO_HOSTS.has(host)) {
    const id = host === "player.vimeo.com" ? (segments[0] === "video" ? segments[1] : null) : segments.at(-1);
    return id && VIMEO_ID.test(id) ? { platform: "VIMEO", embedUrl: `https://player.vimeo.com/video/${id}` } : null;
  }

  if (host === "dai.ly") {
    const id = segments[0];
    return id && DAILYMOTION_ID.test(id) ? { platform: "DAILYMOTION", embedUrl: `https://www.dailymotion.com/embed/video/${id}` } : null;
  }
  if (DAILYMOTION_HOSTS.has(host)) {
    const index = segments[0] === "embed" ? 2 : 1;
    const raw = segments[index - 1] === "video" ? segments[index] : null;
    // L'identifiant est souvent suivi du titre : « x8abc12_titre-de-la-video ».
    const id = raw?.split("_")[0];
    return id && DAILYMOTION_ID.test(id) ? { platform: "DAILYMOTION", embedUrl: `https://www.dailymotion.com/embed/video/${id}` } : null;
  }

  return null;
}

/** Le nom de domaine à afficher sous un lien externe (« laroche-posay.fr »). */
export function displayHost(value: string | null | undefined): string | null {
  if (!value) return null;
  const url = parse(value);
  return url ? url.hostname.replace(/^www\./, "") : null;
}
