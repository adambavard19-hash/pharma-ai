# PharmaBoost Connect — installation sur le serveur de l'officine (Windows).
# À lancer dans PowerShell en administrateur, depuis le dossier de l'agent :
#   .\install-windows.ps1 -Code 123456 -Lgo lgpi -Export "C:\LGPI\Exports" [-Scans "C:\LGPI\Scans"] [-Serveur https://pharmaboost.app]
param(
  [Parameter(Mandatory=$true)][string]$Code,
  [string]$Lgo = "lgpi",
  [Parameter(Mandatory=$true)][string]$Export,
  [string]$Scans = "",
  [string]$Serveur = "https://pharmaboost.app"
)
$ErrorActionPreference = "Stop"
$dir = "C:\ProgramData\PharmaBoost\Connect"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot "pharmaboost-connect.js") $dir
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js est requis. Installation via winget…"
  winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
}
$env:PHARMABOOST_CONNECT_CONFIG = Join-Path $dir "pharmaboost-connect.json"
$args = @("$dir\pharmaboost-connect.js", "--appairer", $Code, "--serveur", $Serveur, "--lgo", $Lgo, "--export", $Export)
if ($Scans -ne "") { $args += @("--scans", $Scans) }
& node @args
if ($LASTEXITCODE -ne 0) { throw "Appairage impossible." }
$action = New-ScheduledTaskAction -Execute "node" -Argument "`"$dir\pharmaboost-connect.js`"" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650)
Register-ScheduledTask -TaskName "PharmaBoost Connect" -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -User "SYSTEM" -Force | Out-Null
[Environment]::SetEnvironmentVariable("PHARMABOOST_CONNECT_CONFIG", "$dir\pharmaboost-connect.json", "Machine")
Start-ScheduledTask -TaskName "PharmaBoost Connect"
Write-Host "PharmaBoost Connect est installé et démarré. Journal : Observateur d'événements / tâche planifiée « PharmaBoost Connect »."
