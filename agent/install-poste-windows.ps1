# PharmaBoost Connect — installation sur un POSTE DE CAISSE (Windows).
#
# À lancer dans PowerShell, sur le poste où la douchette est branchée, avec
# la session Windows de la personne qui utilise le LGO :
#   powershell -ExecutionPolicy Bypass -File .\install-poste-windows.ps1 -Code 123456
#   powershell -ExecutionPolicy Bypass -File .\install-poste-windows.ps1 -MiseAJour   (poste déjà relié : nouvelle version)
#
# Ce que fait ce poste : il écoute la douchette (et rien d'autre) et envoie
# chaque code-barres de boîte à PharmaBoost, à l'instant du bip. Le LGO n'est
# ni modifié, ni ouvert, ni interrogé. Aucune frappe humaine n'est conservée
# ni envoyée : seuls les codes-barres lus par une douchette (code EAN/CIP ou
# Datamatrix de médicament, dont le CIP est extrait).
#
# L'écoute doit tourner dans la session de l'utilisateur (celle qui affiche
# le LGO) : la tâche démarre à l'ouverture de session, pas au démarrage
# système.
param(
  [string]$Code = "",
  [string]$Serveur = "https://pharmaboost.app",
  [switch]$Test,
  # Mise à jour d'un poste déjà relié : remplace le programme et relance la tâche, sans nouveau code.
  [switch]$MiseAJour
)
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$dir = Join-Path $env:LOCALAPPDATA "PharmaBoost\Poste"
$config = Join-Path $dir "pharmaboost-connect.json"
$journal = Join-Path $dir "pharmaboost-connect.log"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot "pharmaboost-connect.js") $dir

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
    Invoke-WebRequest -Uri $msi -OutFile $tmp -UseBasicParsing
    Start-Process msiexec.exe -ArgumentList "/i `"$tmp`" /qn /norestart" -Wait
  }
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
  $node = Get-NodePath
  if (-not $node) { throw "Node.js n'a pas pu être installé. Installez-le depuis https://nodejs.org puis relancez ce script." }
}
Write-Host "Node.js : $node"

$env:PHARMABOOST_CONNECT_CONFIG = $config

if ($MiseAJour) {
  if (-not (Test-Path $config)) { throw "Ce poste n'est pas encore relié : lancez d'abord l'installation avec -Code." }
  $taskName = "PharmaBoost Connect (poste)"
  Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -and (Get-CimInstance Win32_Process -Filter "ProcessId = $($_.Id)").CommandLine -like "*pharmaboost-connect.js*" } | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Start-ScheduledTask -TaskName $taskName
  Write-Host "Poste mis à jour et relancé."
  Start-Sleep -Seconds 8
  if (Test-Path $journal) { Get-Content $journal -Tail 3 }
  exit
}

if ($Test) {
  Write-Host "Mode essai : passez une boîte à la douchette, le code doit s'afficher. Ctrl+C pour arrêter."
  & $node "$dir\pharmaboost-connect.js" --test-douchette
  exit
}

# Appairage du poste : le code devient une clé propre à ce poste, une seule fois.
if ($Code -eq "") { throw "Indiquez le code du poste : -Code 123456 (PharmaBoost → Stock → Connecter mon logiciel → Postes de caisse)." }
& $node "$dir\pharmaboost-connect.js" --poste $Code --serveur $Serveur
if ($LASTEXITCODE -ne 0) { throw "Appairage impossible : vérifiez le code (il expire au bout d'une heure) et l'accès Internet du poste." }

# Tâche à l'ouverture de session de CET utilisateur : c'est là que la douchette tape.
[Environment]::SetEnvironmentVariable("PHARMABOOST_CONNECT_CONFIG", $config, "User")
$taskName = "PharmaBoost Connect (poste)"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$dir\pharmaboost-connect.js`"" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650) -StartWhenAvailable -Hidden
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -User $env:USERNAME -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host ""
Write-Host "Le poste est relié. Passez une boîte à la douchette dans votre logiciel :"
Write-Host "elle doit apparaître dans PharmaBoost, écran Nouvelle vente, dans la seconde."
Write-Host "  Journal : $journal"
Start-Sleep -Seconds 8
if (Test-Path $journal) {
  Write-Host ""
  Write-Host "Dernières lignes du journal :"
  Get-Content $journal -Tail 4
}
