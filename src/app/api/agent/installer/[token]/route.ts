import { peekPostInstallLink } from "@/server/services/stock-sync";
import { resolvePublicBaseUrl } from "@/server/public-url";

export const dynamic = "force-dynamic";

/**
 * L'installateur en une ligne, pour un poste de comptoir Windows :
 *
 *   powershell -ExecutionPolicy Bypass -Command "irm https://pharmaboost.app/api/agent/installer/<jeton> | iex"
 *
 * Le script télécharge le programme et son installateur dans le dossier du
 * poste, puis lance l'installation avec le jeton comme code d'appairage. Le
 * jeton est vérifié ici avant d'envoyer quoi que ce soit : un lien expiré
 * reçoit un message clair, pas un script.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await peekPostInstallLink(token);
  const headers = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };
  if (!link) {
    return new Response(`Write-Host "Ce lien d'installation PharmaBoost n'est plus valable. Générez-en un nouveau : PharmaBoost → Stock → Connecter mon logiciel → Ajouter un poste." -ForegroundColor Red\n`, { status: 410, headers });
  }
  const base = resolvePublicBaseUrl().url.replace(/\/$/, "");
  const script = `# PharmaBoost Connect — installation du poste de comptoir « ${(link.label ?? "").replace(/"/g, "")} » pour ${link.pharmacyName.replace(/"/g, "")}
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$setup = Join-Path $env:LOCALAPPDATA "PharmaBoost\\Poste\\setup"
New-Item -ItemType Directory -Force -Path $setup | Out-Null
Write-Host "PharmaBoost Connect — ${link.pharmacyName.replace(/"/g, "")}"
Write-Host "Téléchargement du programme…"
Invoke-WebRequest -Uri "${base}/api/agent/fichiers/pharmaboost-connect.js" -OutFile (Join-Path $setup "pharmaboost-connect.js") -UseBasicParsing
Invoke-WebRequest -Uri "${base}/api/agent/fichiers/install-poste-windows.ps1" -OutFile (Join-Path $setup "install-poste-windows.ps1") -UseBasicParsing
Write-Host "Installation…"
& (Join-Path $setup "install-poste-windows.ps1") -Code "${token}" -Serveur "${base}"
`;
  return new Response(script, { headers });
}
