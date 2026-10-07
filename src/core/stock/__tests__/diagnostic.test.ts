import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DIAGNOSTIC_MARKER, buildDiagnosticRobotCmd } from "../diagnostic";

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
