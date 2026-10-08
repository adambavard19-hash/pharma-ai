import { NextResponse } from "next/server";
import { peekPostInstallLink } from "@/server/services/stock-sync";
import { resolvePublicBaseUrl } from "@/server/public-url";
import { installerFileName } from "@/core/stock/install";
import { installerResponse, loadInstaller } from "@/server/services/installer-file";

export const dynamic = "force-dynamic";

/**
 * L'installateur Windows d'un poste de comptoir : un seul fichier à
 * double-cliquer, sans terminal.
 *
 *   https://pharmaboost.app/api/agent/installateur/<jeton>   →   PharmaBoost-Installation-<jeton>.exe
 *
 * Le jeton du lien d'installation voyage dans le NOM du fichier téléchargé :
 * les octets sont les mêmes pour toutes les officines (donc signables une fois
 * pour toutes), et l'installateur sait à quelle officine appartient le poste
 * sans que personne ne tape rien. Le jeton est vérifié ici avant d'envoyer
 * quoi que ce soit ; un lien expiré ou déjà utilisé renvoie à la page du lien,
 * qui l'explique en français.
 *
 * Le fichier est construit par `npm run installateur:construire` et livré avec
 * le code (agent/installateur/) : la taille reste sous la limite d'une réponse
 * de fonction. Il n'est servi que vérifié (voir `installer-file.ts`).
 *
 * Ce lien-ci est celui de l'assistance et des liens déjà envoyés ; le bouton « Télécharger PharmaBoost »
 * du pharmacien prépare son jeton lui-même (`/api/connexion/installateur`).
 */

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await peekPostInstallLink(token);
  if (!link) {
    const base = resolvePublicBaseUrl().url.replace(/\/$/, "");
    return NextResponse.redirect(`${base}/installer/${encodeURIComponent(token)}`, 302);
  }
  const installer = await loadInstaller();
  if (!installer.status.available || !installer.bytes) {
    return new Response("L'installateur n'est pas disponible pour le moment. Écrivez à contact@pharmaboost.app.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return installerResponse(installer.bytes, installerFileName(token));
}
