import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { peekPostInstallLink } from "@/server/services/stock-sync";
import { resolvePublicBaseUrl } from "@/server/public-url";
import { installerFileName } from "@/core/stock/install";

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
 * de fonction.
 */
const INSTALLER = ["agent", "installateur", "PharmaBoost-Installation.exe"];

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await peekPostInstallLink(token);
  if (!link) {
    const base = resolvePublicBaseUrl().url.replace(/\/$/, "");
    return NextResponse.redirect(`${base}/installer/${encodeURIComponent(token)}`, 302);
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(join(process.cwd(), ...INSTALLER));
  } catch {
    return new Response("L'installateur n'est pas disponible pour le moment. Écrivez à contact@pharmaboost.app.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.microsoft.portable-executable",
      "Content-Disposition": `attachment; filename="${installerFileName(token)}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
