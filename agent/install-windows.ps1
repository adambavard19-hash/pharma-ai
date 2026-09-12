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

# Les dossiers surveillés, avec un mot d'explication dedans.
foreach ($d in @($Export, $Scans)) {
  if ($d -ne "") { New-Item -ItemType Directory -Force -Path $d | Out-Null }
}
Set-Content -Encoding UTF8 -Path (Join-Path $Export "LISEZMOI.txt") -Value @"
Dossier surveillé par PharmaBoost Connect.

Enregistrez ici l'export de stock de votre logiciel (PDF d'édition d'inventaire,
CSV ou Excel). Dès qu'un fichier y est déposé ou remplacé, il est envoyé à
PharmaBoost et votre stock y est mis à jour dans la minute.
Rien n'est modifié dans votre logiciel.
"@
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
