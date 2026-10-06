# PharmaBoost Connect — installation sur le serveur de l'officine (Windows).
#
# À lancer dans PowerShell en administrateur, depuis le dossier décompressé :
#   powershell -ExecutionPolicy Bypass -File .\install-windows.ps1 -Code 123456 -Lgo lgpi
#
# Tout est facultatif sauf le code. Par défaut :
#   - l'export de stock est attendu dans  C:\PharmaBoost\Export
#   - les ordonnances scannées dans      C:\PharmaBoost\Ordonnances
#   - le serveur est                      https://pharmaboost.app
# Les deux dossiers sont créés s'ils n'existent pas. L'agent n'écrit jamais
# dans le logiciel de l'officine : il lit ces dossiers, rien d'autre.
#
# En fin d'installation, le dossier d'export devient aussi atteignable par le
# titulaire : un raccourci « Stock PharmaBoost » sur le Bureau public, et le
# partage réseau « PharmaBoost » (\\NOMDUSERVEUR\PharmaBoost), en modification
# pour les utilisateurs authentifiés seulement. Le partage n'est créé (et les
# droits du dossier modifiés) que pour le dossier par défaut,
# C:\PharmaBoost\Export : avec -Export vers un autre dossier (celui où le
# logiciel de l'officine écrit ses éditions), seul le raccourci est posé.
# Ces deux étapes sont facultatives : si l'une échoue, un message jaune le
# dit et l'installation reste réussie.
#
# Le dossier d'export ne contient que les fichiers de stock : le programme
# envoie le plus récent des CSV, TXT, Excel et PDF qu'il y trouve, donc rien
# d'autre n'y est écrit (pas de mémo, pas de LISEZMOI).
param(
  [Parameter(Mandatory=$true)][string]$Code,
  [string]$Lgo = "lgpi",
  [string]$Export = "C:\PharmaBoost\Export",
  [string]$Scans = "C:\PharmaBoost\Ordonnances",
  [string]$Serveur = "https://pharmaboost.app"
)
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$dir = "C:\ProgramData\PharmaBoost\Connect"
$config = Join-Path $dir "pharmaboost-connect.json"
$journal = Join-Path $dir "pharmaboost-connect.log"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot "pharmaboost-connect.js") $dir

# Les dossiers surveillés. Rien n'est écrit dans le dossier d'export : tout
# fichier CSV, TXT, Excel ou PDF qui s'y trouve serait envoyé comme stock.
# (Le message d'aide est donné par le raccourci du Bureau et par la page
# « Mettre à jour mon stock » de PharmaBoost.)
foreach ($d in @($Export, $Scans)) {
  if ($d -ne "") { New-Item -ItemType Directory -Force -Path $d | Out-Null }
}
if ($Scans -ne "") {
  Set-Content -Encoding UTF8 -Path (Join-Path $Scans "LISEZMOI.txt") -Value @"
Dossier surveillé par PharmaBoost Connect.

Chaque ordonnance scannée déposée ici (PDF, JPG ou PNG) est envoyée à
PharmaBoost, lue, et apparaît au comptoir comme une nouvelle délivrance.
"@
}

# Node.js : celui du serveur s'il existe, sinon la version LTS officielle.
function Get-NodePath {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  if (Test-Path "C:\Program Files\nodejs\node.exe") { return "C:\Program Files\nodejs\node.exe" }
  return $null
}
$node = Get-NodePath
if (-not $node) {
  Write-Host "Node.js est requis et absent : installation de la version LTS…"
  $installed = $false
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    try {
      winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements | Out-Null
      $installed = $true
    } catch { $installed = $false }
  }
  if (-not $installed) {
    $index = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -UseBasicParsing
    $lts = $index | Where-Object { $_.lts -and $_.version -like "v22.*" } | Select-Object -First 1
    if (-not $lts) { $lts = $index | Where-Object { $_.lts } | Select-Object -First 1 }
    $msi = "https://nodejs.org/dist/$($lts.version)/node-$($lts.version)-x64.msi"
    $tmp = Join-Path $env:TEMP "node-lts.msi"
    Write-Host "Téléchargement de $msi"
    Invoke-WebRequest -Uri $msi -OutFile $tmp -UseBasicParsing
    Start-Process msiexec.exe -ArgumentList "/i `"$tmp`" /qn /norestart" -Wait
  }
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  $node = Get-NodePath
  if (-not $node) { throw "Node.js n'a pas pu être installé. Installez-le depuis https://nodejs.org puis relancez ce script." }
}
Write-Host "Node.js : $node"

# Appairage : le code devient une clé propre à cette officine, une seule fois.
$env:PHARMABOOST_CONNECT_CONFIG = $config
$pairArgs = @("$dir\pharmaboost-connect.js", "--appairer", $Code, "--serveur", $Serveur, "--lgo", $Lgo, "--export", $Export)
if ($Scans -ne "") { $pairArgs += @("--scans", $Scans) }
& $node @pairArgs
if ($LASTEXITCODE -ne 0) { throw "Appairage impossible : vérifiez le code (il expire au bout d'une heure) et l'accès Internet du serveur." }

# L'agent tourne comme tâche planifiée, au démarrage du serveur, relancée si elle s'arrête.
[Environment]::SetEnvironmentVariable("PHARMABOOST_CONNECT_CONFIG", $config, "Machine")
Unregister-ScheduledTask -TaskName "PharmaBoost Connect" -Confirm:$false -ErrorAction SilentlyContinue
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$dir\pharmaboost-connect.js`"" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650) -StartWhenAvailable
Register-ScheduledTask -TaskName "PharmaBoost Connect" -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -User "SYSTEM" -Force | Out-Null
Start-ScheduledTask -TaskName "PharmaBoost Connect"

Write-Host ""
Write-Host "PharmaBoost Connect est installé et démarré."
Write-Host "  Export surveillé : $Export"
if ($Scans -ne "") { Write-Host "  Ordonnances     : $Scans" }
Write-Host "  Journal         : $journal"
Start-Sleep -Seconds 15
if (Test-Path $journal) {
  Write-Host ""
  Write-Host "Dernières lignes du journal :"
  Get-Content $journal -Tail 4
}
Write-Host ""
Write-Host "Dans PharmaBoost, la page Stock > Connecter mon logiciel affiche maintenant « agent connecté »."

# ---------------------------------------------------------------------------
# Stock : le dossier d'export, atteignable par le titulaire
# Facultatif : un échec s'affiche en jaune et n'interrompt jamais l'installation
# (le programme est déjà installé et démarré à ce stade).
# ---------------------------------------------------------------------------
$nomPartage = "PharmaBoost"
# Le seul dossier que ce script accepte de partager et dont il modifie les droits.
$exportParDefaut = "C:\PharmaBoost\Export"
$raccourciCree = $false
$partageCree = $false
$partagePersonnalise = $false

if ($Export -ne "") {
  # (1) Un raccourci « Stock PharmaBoost » sur le Bureau public : il ouvre le dossier d'export.
  try {
    $racine = $env:PUBLIC
    if ([string]::IsNullOrEmpty($racine)) { $racine = "C:\Users\Public" }
    $bureauPublic = Join-Path $racine "Desktop"
    if (-not (Test-Path $bureauPublic)) { New-Item -ItemType Directory -Force -Path $bureauPublic | Out-Null }
    $lien = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $bureauPublic "Stock PharmaBoost.lnk"))
    $lien.TargetPath = $Export
    $lien.Description = "Dossier où enregistrer le stock envoyé à PharmaBoost"
    $lien.Save()
    $raccourciCree = $true
  } catch {
    Write-Host "Raccourci « Stock PharmaBoost » non créé : $($_.Exception.Message)" -ForegroundColor Yellow
  }

  # (2) Le partage réseau « PharmaBoost » : le titulaire y dépose son stock depuis son poste.
  # Modification pour les utilisateurs authentifiés seulement, jamais pour « Tout le monde ».
  # Seulement pour le dossier créé par ce script : un -Export personnalisé est le dossier
  # où le logiciel de l'officine écrit ses éditions (données patients comprises), qu'on
  # ne rend pas lisible par tout le réseau. Le raccourci (1) reste posé dans tous les cas.
  if ($Export -ieq $exportParDefaut) {
    try {
      if (-not (Get-Command New-SmbShare -ErrorAction SilentlyContinue)) { throw "cette version de Windows ne sait pas créer de partage (New-SmbShare absent)." }
      # « Utilisateurs authentifiés » désigné par son identifiant (S-1-5-11) : son nom change avec la langue de Windows.
      $authentifies = (New-Object -TypeName Security.Principal.SecurityIdentifier -ArgumentList "S-1-5-11").Translate([Security.Principal.NTAccount]).Value
      # Le dossier lui-même doit laisser écrire ces utilisateurs, en plus du partage.
      & icacls.exe $Export /grant "*S-1-5-11:(OI)(CI)M" | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "les droits sur le dossier n'ont pas pu être accordés (icacls, code $LASTEXITCODE)." }
      # Un partage du même nom (installation précédente) est refait : il pointe toujours vers le bon dossier.
      if (Get-SmbShare -Name $nomPartage -ErrorAction SilentlyContinue) { Remove-SmbShare -Name $nomPartage -Force }
      New-SmbShare -Name $nomPartage -Path $Export -ChangeAccess $authentifies -Description "Stock PharmaBoost" | Out-Null
      $partageCree = $true
    } catch {
      Write-Host "Partage réseau « PharmaBoost » non créé : $($_.Exception.Message)" -ForegroundColor Yellow
      Write-Host "  À faire à la main : clic droit sur le dossier $Export, Propriétés, Partage, nom « PharmaBoost », droit Modifier pour les utilisateurs authentifiés." -ForegroundColor Yellow
    }
  } else {
    $partagePersonnalise = $true
    Write-Host "Dossier d'export personnalisé ($Export) : partage réseau « PharmaBoost » non créé. Le raccourci « Stock PharmaBoost » reste posé." -ForegroundColor Yellow
  }
}

# (3) Le message final : ce qui est installé, et le chemin à donner au titulaire.
Write-Host ""
Write-Host "Installation terminée." -ForegroundColor Green
Write-Host "  Programme PharmaBoost Connect : installé et démarré"
Write-Host "  Dossier du stock              : $Export"
if ($partageCree) {
  Write-Host "  Partage réseau                : \\$($env:COMPUTERNAME)\$nomPartage"
} elseif ($partagePersonnalise) {
  Write-Host "  Partage réseau                : non créé (dossier d'export personnalisé)" -ForegroundColor Yellow
} else {
  Write-Host "  Partage réseau                : non créé (voir le message jaune ci-dessus)" -ForegroundColor Yellow
}
if ($raccourciCree) { Write-Host "  Raccourci sur le Bureau       : « Stock PharmaBoost »" }
Write-Host ""
Write-Host "À dire au titulaire : enregistrez l'édition du stock dans le dossier PharmaBoost, c'est tout."
if ($partageCree) { Write-Host "Depuis son poste, ce dossier s'ouvre avec  \\$($env:COMPUTERNAME)\$nomPartage" }
