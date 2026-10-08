import { NextResponse } from "next/server";
import { getSession } from "@/server/auth/session";
import { PERMISSIONS } from "@/server/rbac/permissions";
import { rateLimited } from "@/server/http/rate-limit";
import { createPostInstallLink, listCounterPosts } from "@/server/services/stock-sync";
import { installerResponse, loadInstaller } from "@/server/services/installer-file";
import { installerFileName, nextCounterLabel } from "@/core/stock/install";

export const dynamic = "force-dynamic";

/**
 * « Télécharger PharmaBoost » : le bouton de la page « Installer PharmaBoost ».
 *
 * Une personne connectée à SON officine clique ; ce même appel prépare l'association d'un nouveau comptoir
 * (« Comptoir 2 », un jeton à usage unique, sept jours) et rend l'installateur Windows, le jeton dans le NOM
 * du fichier. Au double-clic, l'installateur s'associe à l'officine avec ce jeton : rien à copier, rien à taper.
 * Aucun lien n'est montré ni envoyé.
 *
 * Garde-fous : session de l'officine avec la permission d'importer le stock (jamais l'officine d'un paramètre),
 * requête venant de PharmaBoost lui-même (en-tête Origin), au plus vingt téléchargements par heure, et rien
 * n'est préparé si l'installateur n'est pas disponible et vérifié — pas de comptoir « en attente » orphelin.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !session.permissions.has(PERMISSIONS.PRODUCT_IMPORT)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }
  // Une page d'un autre site ne peut pas déclencher ce téléchargement au nom d'une personne connectée.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== (request.headers.get("host") ?? new URL(request.url).host)) {
    return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
  }
  if (rateLimited(`installer-download:${session.scope.pharmacyId}`, 20, 60 * 60 * 1000)) {
    return new Response("Trop de téléchargements pour le moment. Réessayez dans une heure.", { status: 429, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const installer = await loadInstaller();
  if (!installer.status.available || !installer.bytes) {
    return new Response("L'installateur n'est pas disponible pour le moment. Écrivez à contact@pharmaboost.app.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const existing = await listCounterPosts(session.scope.pharmacyId);
  const label = nextCounterLabel(existing.map((post) => post.label || post.hostname));
  const link = await createPostInstallLink(session.scope, label);
  return installerResponse(installer.bytes, installerFileName(link.token));
}
