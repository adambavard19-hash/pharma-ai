/**
 * L'icône du logiciel sur les postes DÉJÀ installés (fondateur, 26 oct. 2026 : nouveau logo).
 *
 * L'icône vit dans PharmaBoost.exe, que la mise à jour automatique ne remplace pas (elle ne change que l'agent). Alors
 * l'agent, une fois par version d'icône : télécharge la nouvelle icône à côté de lui (`pharmaboost.ico`, servie par
 * /api/agent/fichiers), la donne au raccourci du menu Démarrer et au raccourci du Bureau, puis demande à Windows de
 * rafraîchir ses icônes. Le marqueur `pharmaboost-icone.txt` dit que c'est fait : on ne recommence pas à chaque démarrage.
 *
 * Rien n'est demandé à la pharmacie, aucun droit d'administrateur : les raccourcis sont ceux de l'utilisateur.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** À changer quand le logo change : les postes reprennent l'icône une fois. */
export const APP_ICON_VERSION = "2026-10-26";
const MAX_ICON_BYTES = 1_000_000;

/** Le script : le raccourci du menu Démarrer et celui du Bureau pointent sur la nouvelle icône. Chemins en paramètres. */
export const APP_ICON_SCRIPT = String.raw`
param([string]$Icon)
$shell = New-Object -ComObject WScript.Shell
$lnk = Join-Path ([Environment]::GetFolderPath('Programs')) 'PharmaBoost\PharmaBoost.lnk'
if (Test-Path -LiteralPath $lnk) { $s = $shell.CreateShortcut($lnk); $s.IconLocation = "$Icon,0"; $s.Save() }
$url = Join-Path ([Environment]::GetFolderPath('Desktop')) 'PharmaBoost.url'
if (Test-Path -LiteralPath $url) {
  $lines = Get-Content -LiteralPath $url | Where-Object { $_ -notmatch '^(IconFile|IconIndex)=' }
  $lines += "IconFile=$Icon"; $lines += 'IconIndex=0'
  Set-Content -LiteralPath $url -Value $lines -Encoding Default
}
Start-Process -FilePath "$env:SystemRoot\System32\ie4uinit.exe" -ArgumentList '-show' -WindowStyle Hidden -ErrorAction SilentlyContinue
`;

/** Un .ico commence par 00 00 01 00. */
export function looksLikeIco(bytes: Uint8Array): boolean {
  return bytes.length > 22 && bytes.length <= MAX_ICON_BYTES && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0;
}

export async function refreshAppIcon(args: { serverUrl: string; installDir: string; log: (line: string) => void }): Promise<void> {
  const marker = join(args.installDir, "pharmaboost-icone.txt");
  if (existsSync(marker) && readFileSync(marker, "utf8").trim() === APP_ICON_VERSION) return;
  try {
    const response = await fetch(`${args.serverUrl.replace(/\/$/, "")}/api/agent/fichiers/pharmaboost.ico`);
    if (!response.ok) throw new Error(`réponse ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!looksLikeIco(bytes)) throw new Error("le fichier reçu n'est pas une icône");
    const icon = join(args.installDir, "pharmaboost.ico");
    writeFileSync(icon, bytes);
    const script = join(args.installDir, "pharmaboost-icone.ps1");
    writeFileSync(script, "﻿" + APP_ICON_SCRIPT, "utf8");
    const code = await new Promise<number | null>((resolve) => {
      const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", script, "-Icon", icon], { windowsHide: true, stdio: "ignore" });
      child.on("error", () => resolve(null));
      child.on("exit", resolve);
    });
    if (code !== 0) throw new Error(`le script s'est arrêté (code ${code})`);
    writeFileSync(marker, APP_ICON_VERSION);
    args.log("Icône du logiciel mise à jour (nouveau logo).");
  } catch (error) {
    // Pas de marqueur : on réessaiera au prochain démarrage.
    args.log(`Icône du logiciel non mise à jour : ${error instanceof Error ? error.message : String(error)}`);
  }
}
