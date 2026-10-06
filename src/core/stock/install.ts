/**
 * L'installation en une ligne : les commandes que l'équipe copie sous AnyDesk,
 * et les scripts PowerShell que PharmaBoost sert derrière.
 *
 * Module pur : aucune base, aucune session. Tout ce qui finit dans un script
 * PowerShell (adresse, code, nom d'officine, nom de machine) passe par un
 * littéral entre apostrophes : PowerShell n'y interprète rien, donc un nom
 * d'officine ou de poste ne peut pas devenir une commande.
 */

/** Le nom du partage réseau du dossier d'export : `\\NOMDUSERVEUR\PharmaBoost`. */
export const STOCK_SHARE_NAME = "PharmaBoost";

/** Le code du serveur dure une heure ; le lien d'un poste, sept jours (voir stock-sync). */
export const SERVER_CODE_VALIDITY_LABEL = "1 heure";
export const POST_LINK_VALIDITY_LABEL = "7 jours";

const withoutSlash = (url: string) => url.replace(/\/+$/, "");

/**
 * La première instruction force TLS 1.2 : sur un vieux serveur (Windows
 * Server 2012 R2), PowerShell parle TLS 1.0 par défaut et ne joint pas le site.
 * Pas de `$` dans la commande : collée dans PowerShell, une variable serait
 * remplacée avant même de partir.
 */
const TLS12 = "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; ";

/** La ligne à coller sur le serveur de l'officine (PowerShell en administrateur). */
export function buildServerInstallCommand(baseUrl: string, code: string): string {
  return `powershell -ExecutionPolicy Bypass -Command "${TLS12}irm ${withoutSlash(baseUrl)}/api/agent/installer-serveur/${code} | iex"`;
}

/** La ligne à coller sur un poste de comptoir. */
export function buildPostInstallCommand(baseUrl: string, token: string): string {
  return `powershell -ExecutionPolicy Bypass -Command "${TLS12}irm ${withoutSlash(baseUrl)}/api/agent/installer/${token} | iex"`;
}

/**
 * Le nom de machine du serveur tel que l'agent l'a envoyé, ou `null` s'il ne
 * ressemble pas à un nom de machine : il finit dans une commande, on ne le
 * recopie que s'il est sûr.
 */
export function safeServerHostname(value: string | null | undefined): string | null {
  const name = (value ?? "").trim();
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$/.test(name) ? name : null;
}

/** Le dossier du stock, vu depuis un autre ordinateur de l'officine. */
export function stockSharePath(hostname: string): string {
  return `\\\\${hostname}\\${STOCK_SHARE_NAME}`;
}

/** Un littéral PowerShell entre apostrophes : rien n'y est interprété, les retours à la ligne sont aplatis. */
export function psq(value: string): string {
  // Les apostrophes typographiques (U+2018 à U+201B) comptent aussi comme apostrophes pour PowerShell.
  const flat = Array.from(value, (char) => {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 0x2028 || code === 0x2029) return " ";
    return char === "'" || (code >= 0x2018 && code <= 0x201b) ? "''" : char;
  }).join("");
  return `'${flat}'`;
}

/** « Comptoir 1 » : le nom d'un poste, sur une ligne, sans caractère de contrôle, 60 caractères au plus. `null` s'il ne reste rien. */
export function cleanPostLabel(value: string | null | undefined): string | null {
  const flat = Array.from(value ?? "", (char) => {
    const code = char.charCodeAt(0);
    return code < 32 || (code >= 127 && code < 160) || code === 0x2028 || code === 0x2029 ? " " : char;
  }).join("");
  return flat.replace(/\s+/g, " ").trim().slice(0, 60) || null;
}

/** Un script qui n'installe rien et dit pourquoi, en rouge : ce que voit l'équipe quand le code ne vaut plus. */
export function buildRefusalScript(message: string): string {
  return `Write-Host ${psq(message)} -ForegroundColor Red\n`;
}

/**
 * Le script servi derrière la ligne du serveur. Il ne contient ni le nom de
 * l'officine ni rien de secret : le code est déjà dans l'adresse. Il vérifie
 * les droits d'administrateur, télécharge le programme et son installateur
 * dans un dossier temporaire, lance l'installateur, puis range.
 *
 * Tout est dans un bloc `& { … }` : les réglages d'erreur et `return` restent
 * locaux, et rien ne ferme la fenêtre de l'équipe si la ligne est collée
 * dans un PowerShell déjà ouvert.
 */
export function buildServerInstallScript(input: { baseUrl: string; code: string; lgo: string }): string {
  return String.raw`# PharmaBoost Connect : installation du serveur de l'officine, en une ligne.
& {
  $ErrorActionPreference = 'Stop'
  $ProgressPreference = 'SilentlyContinue'
  $code = ${psq(input.code)}
  $lgo = ${psq(input.lgo)}
  $serveur = ${psq(withoutSlash(input.baseUrl))}
  $dossier = Join-Path $env:TEMP 'PharmaBoost-Installation'
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $principal = New-Object -TypeName Security.Principal.WindowsPrincipal -ArgumentList ([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
      Write-Host "Ouvrez PowerShell en tant qu'administrateur, puis collez de nouveau la ligne." -ForegroundColor Red
      Write-Host "(Clic droit sur le bouton Windows, puis Windows PowerShell (administrateur) ou Terminal (administrateur).)" -ForegroundColor Red
      return
    }
    Write-Host "PharmaBoost Connect : installation du serveur"
    New-Item -ItemType Directory -Force -Path $dossier | Out-Null
    Write-Host "Téléchargement du programme..."
    foreach ($nom in @('pharmaboost-connect.js', 'install-windows.ps1')) {
      Invoke-WebRequest -Uri "$serveur/api/agent/fichiers/$nom" -OutFile (Join-Path $dossier $nom) -UseBasicParsing
    }
    Write-Host "Installation..."
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dossier 'install-windows.ps1') -Code $code -Lgo $lgo -Serveur $serveur
    if ($LASTEXITCODE -ne 0) { throw "le programme d'installation s'est arrêté (code $LASTEXITCODE). Lisez le message ci-dessus." }
  } catch {
    Write-Host ("L'installation a échoué : " + $_.Exception.Message) -ForegroundColor Red
  } finally {
    Remove-Item -Recurse -Force $dossier -ErrorAction SilentlyContinue
  }
}
`;
}

/**
 * Le script servi derrière la ligne d'un poste de comptoir. Le nom de
 * l'officine et celui du poste s'affichent à l'écran de l'équipe, rien de
 * plus. Quand le serveur de l'officine est déjà relié, le poste reçoit le
 * chemin du dossier partagé pour poser son raccourci « Stock PharmaBoost ».
 */
export function buildPostInstallScript(input: { baseUrl: string; token: string; label: string | null; pharmacyName: string; serverHostname: string | null }): string {
  const base = withoutSlash(input.baseUrl);
  const host = safeServerHostname(input.serverHostname);
  const title = `PharmaBoost Connect : ${input.label ? `poste « ${input.label} »` : "poste de comptoir"}, ${input.pharmacyName}`;
  const stock = host ? ` -DossierStock ${psq(stockSharePath(host))}` : "";
  return String.raw`# PharmaBoost Connect : installation d'un poste de comptoir.
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$serveur = ${psq(base)}
$setup = Join-Path $env:LOCALAPPDATA "PharmaBoost\Poste\setup"
New-Item -ItemType Directory -Force -Path $setup | Out-Null
Write-Host ${psq(title)}
Write-Host "Téléchargement du programme…"
Invoke-WebRequest -Uri "$serveur/api/agent/fichiers/pharmaboost-connect.js" -OutFile (Join-Path $setup "pharmaboost-connect.js") -UseBasicParsing
Invoke-WebRequest -Uri "$serveur/api/agent/fichiers/install-poste-windows.ps1" -OutFile (Join-Path $setup "install-poste-windows.ps1") -UseBasicParsing
Write-Host "Installation…"
& (Join-Path $setup "install-poste-windows.ps1") -Code ${psq(input.token)} -Serveur $serveur${stock}
`;
}
