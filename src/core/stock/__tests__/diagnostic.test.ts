import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_MARKER, LIRE_JOURNAL_MARKER, buildDiagnosticRobotCmd, buildLireJournalCmd } from "../diagnostic";

const SCRIPT = readFileSync(join(process.cwd(), "agent", "diagnostic-robot.ps1"), "utf8");

describe("l'enveloppe .cmd du diagnostic du robot", () => {
  const cmd = buildDiagnosticRobotCmd("Write-Host 'é à ù'\nWrite-Host 'suite'\n");
  const [envelope, script] = cmd.split(`\r\n${DIAGNOSTIC_MARKER}\r\n`);

  it("l'enveloppe est en ASCII pur : cmd.exe ne lit jamais l'UTF-8 correctement", () => {
    expect(envelope).toMatch(/^[\x20-\x7e\r\n]+$/);
  });

  it("le script est placé APRÈS « exit /b » : cmd.exe ne l'interprète jamais", () => {
    expect(envelope!.trimEnd().endsWith("exit /b")).toBe(true);
    expect(script).toContain("é à ù");
  });

  it("toutes les fins de ligne sont CRLF, le script compris", () => {
    expect(cmd).not.toMatch(/[^\r]\n/);
    expect(script).toBe("Write-Host 'é à ù'\r\nWrite-Host 'suite'\r\n");
  });

  it("l'enveloppe retrouve le script au DERNIER repère : le premier est dans sa propre ligne de commande", () => {
    expect(cmd.split(DIAGNOSTIC_MARKER)).toHaveLength(3);
    expect(envelope).toContain(`LastIndexOf('${DIAGNOSTIC_MARKER}')`);
  });

  it("le chemin du fichier passe par une variable d'environnement : une apostrophe dans un nom de dossier ne casse rien", () => {
    expect(envelope).toContain('set "PB_FICHIER=%~f0"');
    expect(envelope).toContain("$env:PB_FICHIER");
    expect(envelope).not.toMatch(/ReadAllText\('/);
  });

  it("ne change aucun réglage de Windows : la stratégie d'exécution n'est contournée que pour ce processus", () => {
    expect(envelope).toContain("-NoProfile -ExecutionPolicy Bypass -Command");
    expect(envelope).not.toMatch(/Set-ExecutionPolicy/i);
  });

  it("retire un BOM éventuel du script", () => {
    expect(buildDiagnosticRobotCmd("﻿Write-Host 'a'").split(DIAGNOSTIC_MARKER)[2]).toBe("\r\nWrite-Host 'a'");
  });
});

describe("le collecteur lui-même (agent/diagnostic-robot.ps1)", () => {
  it("ne contient pas le repère de l'enveloppe : le script ne se confond pas avec elle", () => {
    expect(SCRIPT).not.toContain(DIAGNOSTIC_MARKER);
  });

  it("ne PEUT PAS écrire hors de son rapport ni parler à Internet : aucune commande qui modifie, supprime, installe ou envoie", () => {
    const forbidden = [/Invoke-WebRequest|Invoke-RestMethod|\biwr\b|\birm\b|WebClient|HttpClient|Net\.Sockets|TcpClient|Test-NetConnection/i, /Remove-Item|\bdel\b|\brm\b|Set-Content|Add-Content|New-Item|Set-ItemProperty|New-ItemProperty|Stop-Process|Stop-Service|Restart-Service|Set-Service|Install-|Register-ScheduledTask|netsh|pktmon|Out-File/i];
    for (const pattern of forbidden) expect(SCRIPT).not.toMatch(pattern);
    // La seule écriture : le rapport, sur le Bureau.
    expect([...SCRIPT.matchAll(/WriteAllLines|WriteAllText/g)]).toHaveLength(1);
  });

  it("ne copie jamais une ligne qui ressemble à un secret, et ne lit que les réglages réseau", () => {
    expect(SCRIPT).toContain("$script:MotifSecret");
    expect(SCRIPT).toMatch(/notmatch \$script:MotifSecret/);
  });

  it("masque les valeurs avant d'écrire : la structure des journaux, jamais leur contenu", () => {
    expect(SCRIPT).toContain("Hide-XmlValues");
    expect(SCRIPT).toContain("Hide-TextValues");
    expect(SCRIPT).toContain("MotsDuProtocole");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// La lecture du journal de LGPI : `lire-journal.cmd`
// ---------------------------------------------------------------------------------------------------------------

describe("l'enveloppe .cmd de la lecture du journal de LGPI", () => {
  const bundle = readFileSync(join(process.cwd(), "agent", "dist", "lire-journal.js"), "utf8");
  const cmd = buildLireJournalCmd(bundle);
  const envelope = cmd.slice(0, cmd.indexOf(LIRE_JOURNAL_MARKER, cmd.indexOf("exit /b")));

  it("l'enveloppe est en ASCII pur : cmd.exe ne lit pas l'UTF-8", () => {
    expect(/^[\x20-\x7e\r\n]*$/.test(envelope)).toBe(true);
    expect(envelope.split("\r\n")[0]).toBe("@echo off");
  });

  it("le programme est placé après le DERNIER repère, en fins de ligne Windows, et l'enveloppe s'arrête avant (exit /b)", () => {
    expect(cmd.lastIndexOf(LIRE_JOURNAL_MARKER)).toBeGreaterThan(cmd.indexOf("exit /b"));
    expect(cmd).toContain("\r\n");
    expect(/[^\r]\n/.test(cmd)).toBe(false);
    expect(cmd.slice(cmd.lastIndexOf(LIRE_JOURNAL_MARKER) + LIRE_JOURNAL_MARKER.length)).toContain("PB_LIRE_JOURNAL_LANCER");
  });

  it("l'enveloppe ne fait que lancer le Node de PharmaBoost : aucun téléchargement, aucune suppression, aucun réglage de Windows", () => {
    for (const forbidden of [/curl|wget|bitsadmin|Invoke-WebRequest|DownloadFile/i, /\bdel\b|\brmdir\b|\bformat\b/i, /\breg\s+(add|delete)/i, /Set-ExecutionPolicy|schtasks|sc\s+(config|stop)/i, /netsh/i]) {
      expect(forbidden.test(envelope)).toBe(false);
    }
    expect(envelope).toContain("%LOCALAPPDATA%\\PharmaBoost\\Poste\\node\\node.exe");
    expect(envelope).toContain("chcp 65001");
  });

  it("le fichier s'exécute VRAIMENT : relu par Node comme le fait Windows, il écrit son rapport sur un faux Bureau", () => {
    const dir = mkdtempSync(join(tmpdir(), "pb-cmd-"));
    try {
      const logs = join(dir, "lgpi");
      const desktop = join(dir, "Bureau");
      mkdirSync(logs);
      mkdirSync(desktop);
      writeFileSync(join(logs, "lgpi.2026-10-08.log"), "2026-10-08 15:41:03,200 INFO  [AAA-RobotWorker-4] fr.pharmagest.stock.StockAutomate - Stock automate : Code produit 3095123 dans 2 emplacements\r\n");
      const file = join(dir, "PharmaBoost-Lecture-Journal.cmd");
      writeFileSync(file, cmd, "utf8");
      // La commande du .cmd, extraite de l'enveloppe : on exécute exactement ce qu'exécuterait Windows.
      const line = envelope.split("\r\n").find((l) => l.startsWith('"%PB_NODE%" -e '))!;
      const bootstrap = line.replace('"%PB_NODE%" -e "', "").replace(/"$/, "");
      const out = execFileSync(process.execPath, ["-e", bootstrap], {
        encoding: "utf8",
        env: { ...process.env, PB_FICHIER: file, PB_LIRE_JOURNAL_LANCER: "1", PB_BUREAU: desktop, PB_JOURNAL_DIR: logs },
      });
      expect(out).toContain("TERMINÉ");
      const reports = readdirSync(desktop);
      expect(reports).toHaveLength(1);
      expect(reports[0]).toMatch(/^PharmaBoost-lecture-journal-.*\.txt$/);
      expect(readFileSync(join(desktop, reports[0]), "utf8")).toContain("3095123");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
