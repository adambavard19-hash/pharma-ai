import { peekServerPairing } from "@/server/services/stock-sync";
import { resolvePublicBaseUrl } from "@/server/public-url";
import { clientIp, rateLimited } from "@/server/http/rate-limit";
import { buildRefusalScript, buildServerInstallScript } from "@/core/stock/install";

export const dynamic = "force-dynamic";

const HEADERS = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };

/**
 * L'installateur du serveur de l'officine, en une ligne, pour l'équipe sous
 * AnyDesk (PowerShell en administrateur) :
 *
 *   powershell -ExecutionPolicy Bypass -Command "irm https://pharmaboost.app/api/agent/installer-serveur/<code> | iex"
 *
 * Le code à six chiffres (celui de la fiche officine de la console) est vérifié
 * ici SANS être consommé : c'est l'agent qui le présentera, une seule fois.
 * Valable, la réponse est un script PowerShell qui ne dit rien de l'officine ;
 * sinon, un script qui affiche pourquoi, en rouge. Jamais un échec silencieux :
 * ce que PowerShell reçoit, il l'exécute.
 *
 * Les refus sont servis en 200, jamais en 4xx : `Invoke-RestMethod` (Windows
 * PowerShell 5.1) lève une exception sur tout statut d'erreur et ne passe donc
 * jamais le corps à `iex` : l'équipe ne verrait que « (410) Gone » au lieu du
 * message. Sans danger : le corps d'un refus n'exécute qu'un `Write-Host`.
 */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // Six chiffres, c'est un million de possibilités : on ralentit qui les essaie toutes.
  if (rateLimited(`installer-serveur:${clientIp(request)}`, 30, 60_000)) {
    return new Response(buildRefusalScript("Trop d'essais depuis cet ordinateur. Attendez une minute, puis recollez la ligne."), { headers: HEADERS });
  }
  const pairing = await peekServerPairing(code);
  if (!pairing) {
    return new Response(
      buildRefusalScript("Ce code d'installation PharmaBoost n'est plus valable (il dure une heure). Dans la console, sur la fiche de l'officine, cliquez de nouveau sur « Préparer l'installation du serveur », puis collez la nouvelle ligne."),
      { headers: HEADERS },
    );
  }
  const baseUrl = resolvePublicBaseUrl().url.replace(/\/$/, "");
  return new Response(buildServerInstallScript({ baseUrl, code, lgo: pairing.lgo }), { headers: HEADERS });
}
