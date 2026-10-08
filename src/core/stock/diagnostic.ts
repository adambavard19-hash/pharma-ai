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

/** Le repère qui sépare l'enveloppe de la lecture du journal du programme JavaScript qui la suit. */
export const LIRE_JOURNAL_MARKER = "//<<JS>>";

/**
 * La lecture du journal de LGPI, en un fichier à double-cliquer : `lire-journal.cmd`.
 *
 * Le lecteur est un programme JavaScript (agent/src/lire-journal.ts, lecture seule : voir son en-tête) que le poste de caisse
 * sait déjà exécuter : PharmaBoost y a installé son propre Node.js (`%LOCALAPPDATA%\PharmaBoost\Poste\node\node.exe`). Le .cmd
 * relit son propre contenu, en extrait le programme placé après le repère, et l'exécute avec ce Node — sans rien télécharger, sans
 * rien écrire sur le disque que le rapport, sans changer aucun réglage de Windows. Sans PharmaBoost sur le poste, il le dit.
 * Enveloppe en ASCII (cmd.exe ne lit pas l'UTF-8) ; le programme, lui, est lu en UTF-8 par Node.
 */
export function buildLireJournalCmd(javascript: string): string {
  const program = javascript.replace(/^\uFEFF/, "").replace(/\r?\n/g, CRLF);
  const bootstrap = `const t=require('fs').readFileSync(process.env.PB_FICHIER,'utf8');const i=t.lastIndexOf('${LIRE_JOURNAL_MARKER}');(0,eval)(t.slice(i+${LIRE_JOURNAL_MARKER.length}))`;
  return [
    "@echo off",
    "setlocal",
    "chcp 65001 >nul",
    "title PharmaBoost - lecture du journal de LGPI",
    'set "PB_FICHIER=%~f0"',
    'set "PB_LIRE_JOURNAL_LANCER=1"',
    'set "PB_NODE=%LOCALAPPDATA%\\PharmaBoost\\Poste\\node\\node.exe"',
    'if not exist "%PB_NODE%" set "PB_NODE=node"',
    `"%PB_NODE%" -e "${bootstrap}"`,
    "if errorlevel 1 (",
    "  echo.",
    "  echo La lecture n'a pas pu demarrer : PharmaBoost n'est peut-etre pas installe sur ce poste.",
    ")",
    "echo.",
    "echo ------------------------------------------------------------",
    "echo FIN. Si un rapport est apparu sur le Bureau, envoyez-le. Sinon, prenez cette fenetre en photo.",
    "echo Appuyez sur une touche pour fermer cette fenetre.",
    "pause >nul",
    "exit /b",
    LIRE_JOURNAL_MARKER,
    program,
  ].join(CRLF);
}
