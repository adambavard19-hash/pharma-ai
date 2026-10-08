/**
 * Le diagnostic du robot, en un fichier à double-cliquer : `diagnostic-robot.cmd`.
 *
 * Le collecteur est un script PowerShell (agent/diagnostic-robot.ps1, lecture seule : voir son
 * en-tête). Un .ps1 téléchargé ne se lance pas d'un double-clic sur un Windows par défaut
 * (stratégie d'exécution « Restricted ») ; un .cmd, si. Le .cmd est donc une enveloppe de trois
 * lignes qui relit son propre contenu, en extrait le script placé après le repère, et l'exécute
 * sans rien écrire sur le disque ni changer aucun réglage de Windows.
 *
 * Module pur : aucune lecture de fichier, aucune session.
 */

/** Le repère qui sépare l'enveloppe du script. Il apparaît aussi dans l'enveloppe : on cherche le DERNIER. */
export const DIAGNOSTIC_MARKER = "#<<POWERSHELL>>";

const CRLF = "\r\n";

/**
 * L'enveloppe ne contient que de l'ASCII : cmd.exe lit le fichier selon la page de code de la
 * console, jamais en UTF-8. Les accents du script, eux, ne sont lus que par PowerShell, en UTF-8,
 * après `exit /b` — cmd ne les voit jamais.
 */
export function buildDiagnosticRobotCmd(powershellScript: string): string {
  const script = powershellScript.replace(/^﻿/, "").replace(/\r?\n/g, CRLF);
  return [
    "@echo off",
    "setlocal",
    "title PharmaBoost - diagnostic du robot",
    'set "PB_FICHIER=%~f0"',
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$t = [IO.File]::ReadAllText($env:PB_FICHIER, [Text.Encoding]::UTF8); $i = $t.LastIndexOf('${DIAGNOSTIC_MARKER}'); Invoke-Expression $t.Substring($i)"`,
    "echo.",
    "echo ------------------------------------------------------------",
    "echo FIN. Si un rapport est apparu sur le Bureau, envoyez-le. Sinon, prenez cette fenetre en photo.",
    "echo Appuyez sur une touche pour fermer cette fenetre.",
    "pause >nul",
    "exit /b",
    DIAGNOSTIC_MARKER,
    script,
  ].join(CRLF);
}
