import { escapeHtml } from "@/core/documents/email";

/**
 * Le film de présentation de PharmaBoost, dans un e-mail.
 *
 * Une vidéo ne se lit pas dans un e-mail : on montre sa vignette, cliquable, et un bouton qui mène à la page publique qui la lit
 * (/decouvrir/video). Les adresses sont ABSOLUES (domaine public du site) : un client de messagerie ne connaît pas le site.
 * Module pur : l'appelant fournit les URL (publicUrl côté serveur).
 */

/** La page publique qui lit le film. */
export const PRESENTATION_VIDEO_PAGE = "/decouvrir/video";
/** Le film et sa vignette, exportés dans public/video (fabriqués dans video/, Remotion). */
export const PRESENTATION_VIDEO_SRC = "/video/pharmaboost-presentation.mp4";
export const PRESENTATION_VIDEO_POSTER = "/video/pharmaboost-presentation.jpg";
export const PRESENTATION_VIDEO_LABEL = "Voir la vidéo de présentation (1 min 09)";

export type PresentationVideoLinks = { pageUrl: string; imageUrl: string };

/** Les deux adresses absolues, à partir de la fonction qui fait les URL publiques du site. */
export function presentationVideoLinks(publicUrl: (path: string) => string): PresentationVideoLinks {
  return { pageUrl: publicUrl(PRESENTATION_VIDEO_PAGE), imageUrl: publicUrl(PRESENTATION_VIDEO_POSTER) };
}

/** Les lignes du texte brut. */
export function presentationVideoText(video: PresentationVideoLinks): string[] {
  return [`Ce que PharmaBoost change au comptoir — ${PRESENTATION_VIDEO_LABEL.toLowerCase()} :`, video.pageUrl];
}

/** La vignette cliquable et son bouton, discrets : l'action principale de l'e-mail reste au-dessus. */
export function presentationVideoHtml(video: PresentationVideoLinks): string {
  const href = escapeHtml(video.pageUrl);
  return `<div style="margin:24px 0 0;border-top:1px solid #E2E8F0;padding-top:22px">
    <p style="margin:0 0 12px;font-size:15px;line-height:22px;font-weight:600;color:#0F172A">Ce que PharmaBoost change au comptoir</p>
    <a href="${href}" style="display:block;text-decoration:none"><img src="${escapeHtml(video.imageUrl)}" width="520" alt="Vidéo de présentation de PharmaBoost (1 min 09)" style="display:block;width:100%;max-width:520px;height:auto;border:0;border-radius:12px"></a>
    <p style="margin:12px 0 0"><a href="${href}" style="display:inline-block;padding:10px 18px;border:1px solid #0F766E;border-radius:999px;color:#0F766E;font-size:14px;line-height:20px;font-weight:600;text-decoration:none">&#9654;&nbsp; ${escapeHtml(PRESENTATION_VIDEO_LABEL)}</a></p>
  </div>`;
}
