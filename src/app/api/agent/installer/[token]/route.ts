import { peekPostInstallLink } from "@/server/services/stock-sync";
import { resolvePublicBaseUrl } from "@/server/public-url";
import { buildPostInstallScript, buildRefusalScript } from "@/core/stock/install";

export const dynamic = "force-dynamic";

/**
 * L'installateur en une ligne, pour un poste de comptoir Windows :
 *
 *   powershell -ExecutionPolicy Bypass -Command "irm https://pharmaboost.app/api/agent/installer/<jeton> | iex"
 *
 * Le script télécharge le programme et son installateur dans le dossier du
 * poste, puis lance l'installation avec le jeton comme code d'appairage. Le
 * jeton est vérifié ici avant d'envoyer quoi que ce soit : un lien expiré
 * reçoit un message clair, pas un script. Quand le serveur de l'officine est
 * déjà relié, le poste reçoit aussi le chemin du dossier partagé (« Stock
 * PharmaBoost » sur son Bureau).
 *
 * Le refus est servi en 200, jamais en 410 : `Invoke-RestMethod` (Windows
 * PowerShell 5.1) lève une exception sur tout statut d'erreur et ne passe donc
 * jamais le corps à `iex` : le message ne s'afficherait pas. Sans danger : le
 * corps d'un refus n'exécute qu'un `Write-Host`.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await peekPostInstallLink(token);
  const headers = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };
  if (!link) {
    return new Response(buildRefusalScript("Ce lien d'installation PharmaBoost n'est plus valable. Générez-en un nouveau : PharmaBoost → Stock → Connecter mon logiciel → Ajouter un poste (ou, pour l'équipe, la fiche de l'officine dans la console)."), { headers });
  }
  const baseUrl = resolvePublicBaseUrl().url.replace(/\/$/, "");
  return new Response(buildPostInstallScript({ baseUrl, token, label: link.label, pharmacyName: link.pharmacyName, serverHostname: link.serverHostname }), { headers });
}
