import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Le rapport du diagnostic du robot ne doit contenir AUCUNE valeur d'un journal : ce test fait
 * tourner les vraies fonctions de masquage de `diagnostic-robot.ps1` sur des lignes inventées
 * qui portent un nom de patient, un numéro de sécurité sociale et un code produit.
 *
 * Il demande PowerShell (pwsh, ou PB_PWSH=/chemin/pwsh) : sans lui, il est ignoré, et le contrôle
 * reste celui des tests statiques de src/core/stock/__tests__/diagnostic.test.ts.
 */

function findPwsh(): string | null {
  const candidates = [process.env.PB_PWSH, "pwsh"].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["-NoProfile", "-Command", "1"], { stdio: "ignore" });
      return candidate;
    } catch {
      // essai suivant
    }
  }
  return null;
}

const pwsh = findPwsh();

describe.skipIf(!pwsh)("le masquage du rapport de diagnostic", () => {
  const lines = [
    '<PickRequest Id="123"><Article Id="3400930000001" Quantity="2"/></PickRequest>',
    "DUPONT Jean <b>né le 01/02/1950</b> suite",
    "<Patient>MARTIN Claire</Patient>",
    "<![CDATA[LEROY Paul 185057800608436]]>",
    "   DURAND Marie",
    "<Nom>BERNARD",
    "Sophie</Nom>",
    "2026-10-07 10:01 PICK article 3400930000002 qty 1 patient PETIT Luc status OK",
  ];

  const run = (file: string): string => {
    const script = [
      "$PB_ESSAI = $true",
      `. '${join(process.cwd(), "agent", "diagnostic-robot.ps1").replace(/'/g, "''")}'`,
      `Get-MaskedTail '${file.replace(/'/g, "''")}' 8192 50`,
    ].join("\n");
    const result = spawnSync(pwsh!, ["-NoProfile", "-Command", script], { encoding: "utf8" });
    expect(result.status).toBe(0);
    return result.stdout;
  };

  it("ne laisse sortir aucun nom, numéro ni code produit", () => {
    const dir = mkdtempSync(join(tmpdir(), "pb-masque-"));
    try {
      const file = join(dir, "journal.log");
      writeFileSync(file, `${lines.join("\r\n")}\r\n`, "latin1");
      const report = run(file);
      for (const secret of ["DUPONT", "Jean", "MARTIN", "Claire", "LEROY", "Paul", "185057", "DURAND", "Marie", "BERNARD", "Sophie", "PETIT", "Luc", "3400930000001", "3400930000002", "1950"]) {
        expect(report).not.toContain(secret);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("garde la forme : balises, attributs, vocabulaire générique", () => {
    const dir = mkdtempSync(join(tmpdir(), "pb-masque-"));
    try {
      const file = join(dir, "journal.log");
      writeFileSync(file, `${lines.join("\r\n")}\r\n`, "latin1");
      const report = run(file);
      expect(report).toContain('<PickRequest Id="…"><Article Id="…" Quantity="…"/></PickRequest>');
      expect(report).toContain("<Patient>…</Patient>");
      expect(report).toContain("PICK article 9999999999999 qty 9");
      expect(report).toContain("status OK");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("le collecteur n'écrit jamais une ligne de lancement (texte du script)", () => {
  it("la ligne de lancement d'un programme ne sert qu'à le reconnaître", () => {
    const script = readFileSync(join(process.cwd(), "agent", "diagnostic-robot.ps1"), "utf8");
    const written = script.split("\n").filter((line) => /\$out\.Add\(|\$lines \+=|\$shown \+=/.test(line));
    expect(written.length).toBeGreaterThan(0);
    for (const line of written) expect(line).not.toMatch(/CommandLine/i);
  });
});

describe.skipIf(!pwsh)("la lecture du rapport et l'analyse d'un poste simulé", () => {
  const run = (body: string): string => {
    const script = ["$PB_ESSAI = $true", `. '${join(process.cwd(), "agent", "diagnostic-robot.ps1").replace(/'/g, "''")}'`, body].join("\n");
    const result = spawnSync(pwsh!, ["-NoProfile", "-Command", script], { encoding: "utf8" });
    expect(result.status).toBe(0);
    return result.stdout;
  };

  it("sait dire d'où part une connexion : l'ordinateur lui-même, la pharmacie, ou Internet", () => {
    const out = run(['Get-AddressKind "192.168.0.5" "192.168.0.5"', 'Get-AddressKind "127.0.0.1" "192.168.0.5"', 'Get-AddressKind "192.168.0.9" "192.168.0.5"', 'Get-AddressKind "172.20.1.1" "10.0.0.1"', 'Get-AddressKind "172.40.1.1" "10.0.0.1"', 'Get-AddressKind "52.1.2.3" "192.168.0.5"'].join("\n"));
    expect(out.trim().split(/\r?\n/)).toEqual(["cet ordinateur", "cet ordinateur", "autre ordinateur du réseau local", "autre ordinateur du réseau local", "hors du réseau local", "hors du réseau local"]);
  });

  it("ne prend pas un poste de comptoir pour le robot : sans nom de robot, il dit de chercher ailleurs", () => {
    const out = run("Get-Reading $false $true 2 0 0 1");
    expect(out).toContain("Aucun nom de robot");
    expect(out).toContain("poste de comptoir");
    expect(out).toContain("SERVEUR");
    expect(out).not.toContain("Un programme du robot");
  });

  it("n'annonce pas « poste de comptoir » quand un nom de robot est présent", () => {
    const out = run("Get-Reading $true $true 1 1 0 0");
    expect(out).not.toContain("poste de comptoir");
    expect(out).toContain("autre ordinateur de la pharmacie");
  });

  it("reconnaît un programme Java par son dossier et n'écrit jamais sa ligne de lancement", () => {
    const out = run(`
function Get-CimInstance { param([string]$ClassName)
  switch ($ClassName) {
    "Win32_OperatingSystem" { [pscustomobject]@{ Caption = "Windows"; Version = "10"; OSArchitecture = "64" } }
    "Win32_Service" { }
    "Win32_PnPEntity" { }
    "Win32_Process" {
      [pscustomobject]@{ Name = "java.exe"; ProcessId = 300; ExecutablePath = 'C:\\pharmagest\\offipos\\jre\\bin\\java.exe'; CommandLine = 'java.exe -Dpassword=MOTDEPASSESECRET -jar x.jar' }
      [pscustomobject]@{ Name = "java.exe"; ProcessId = 301; ExecutablePath = 'C:\\Autre\\java.exe'; CommandLine = 'java.exe -jar autre.jar' }
    }
  }
}
function Get-NetTCPConnection { param([string]$State)
  if ($State -eq "Listen") { [pscustomobject]@{ LocalAddress = "0.0.0.0"; LocalPort = 9061; OwningProcess = 300 } }
  else { [pscustomobject]@{ LocalAddress = "192.168.0.5"; LocalPort = 50000; RemoteAddress = "192.168.0.2"; RemotePort = 3050; OwningProcess = 300 } }
}
function Get-Process { @([pscustomobject]@{ Id = 300; Name = "java" }, [pscustomobject]@{ Id = 301; Name = "java" }) }
New-Report | ForEach-Object { $_ }`);
    expect(out).toContain("processus : java.exe (300)");
    expect(out).not.toContain("(301)");
    expect(out).toContain("192.168.0.2:3050 (autre ordinateur du réseau local)");
    expect(out).toContain("Cet ordinateur est relié à un autre ordinateur de la pharmacie");
    expect(out).not.toContain("MOTDEPASSESECRET");
  });
});

describe.skipIf(!pwsh)("la version complète : programmes, fichiers et journaux qui parlent du robot", () => {
  const dot = [`$PB_ESSAI = $true`, `. '${join(process.cwd(), "agent", "diagnostic-robot.ps1").replace(/'/g, "''")}'`];
  const run = (body: string): string => {
    const result = spawnSync(pwsh!, ["-NoProfile", "-Command", [...dot, body].join("\n")], { encoding: "utf8" });
    expect(result.status).toBe(0);
    return result.stdout;
  };

  it("garde le programme d'une ligne de lancement et jette ses arguments", () => {
    const out = run([
      `Get-ExecutablePart '"C:\\Program Files\\Rowa\\interface.exe" --password=SECRET -k x'`,
      `Get-ExecutablePart 'C:\\Program Files\\Rowa\\interface.exe -p SECRET'`,
      `Get-ExecutablePart 'C:\\pharmagest\\service.exe'`,
    ].join("\n"));
    expect(out.trim().split(/\r?\n/)).toEqual(["C:\\Program Files\\Rowa\\interface.exe", "C:\\Program Files\\Rowa\\interface.exe", "C:\\pharmagest\\service.exe"]);
    expect(out).not.toContain("SECRET");
  });

  it("compte les mots du robot dans un journal, sans rien recopier", () => {
    const out = run(`$c = Get-TermCounts "ROWA ok\nrowa ok\nWWKS2 StockDeliveryRequest\nDUPONT Jean"; ($c.Keys | ForEach-Object { $_ + '=' + $c[$_] }) -join ' '`);
    expect(out.trim()).toBe("rowa=2 wwks=1 stockdelivery=1");
    expect(out).not.toContain("DUPONT");
  });

  it("retrouve, dans un faux disque, le journal du robot et le masque ; les autres journaux restent muets", () => {
    const dir = mkdtempSync(join(tmpdir(), "pb-disque-"));
    try {
      const mkdirp = (path: string) => spawnSync("mkdir", ["-p", path]);
      mkdirp(join(dir, "RowaInterface", "logs"));
      mkdirp(join(dir, "pharmagest", "log"));
      writeFileSync(join(dir, "RowaInterface", "logs", "echange.log"), ["2026-10-08 10:01:02,123 INFO WWKS2 OutputRequest article 3400930000002 qty 2 patient PETIT Luc", '<StockDeliveryRequest Id="55"><Article Id="3400930000002" Quantity="2"/></StockDeliveryRequest>', "DUPONT Jean ordonnance du 01/02/1950"].join("\r\n"), "latin1");
      writeFileSync(join(dir, "pharmagest", "log", "launcher.log"), "MARTIN Claire pick 3400930000009\r\n", "latin1");
      const out = run([
        `function Get-SearchRoots { @('${dir.replace(/'/g, "''")}') }`,
        `function Get-CimInstance { param([string]$ClassName) if ($ClassName -eq 'Win32_OperatingSystem') { [pscustomobject]@{ Caption='W'; Version='1'; OSArchitecture='64' } } }`,
        `function Get-NetTCPConnection { param([string]$State) }`,
        `function Get-Process { @() }`,
        `New-Report | ForEach-Object { $_ }`,
      ].join("\n"));
      expect(out).toContain("echange.log");
      expect(out).toMatch(/echange\.log · [\d-]+ [\d:]+ · wwks:1 stockdelivery:2 outputrequest:1/);
      expect(out).toContain("WWKS9 OutputRequest article 9999999999999 qty 9");
      expect(out).toContain("mentionnent le robot");
      for (const secret of ["PETIT", "Luc", "DUPONT", "Jean", "MARTIN", "Claire", "3400930000002", "3400930000009", "1950"]) expect(out).not.toContain(secret);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe.skipIf(!pwsh)("le lancement de bout en bout : un rapport est TOUJOURS écrit, même si la lecture échoue", () => {
  const withDesktop = (body: string): { out: string; reports: string[]; content: string } => {
    const home = mkdtempSync(join(tmpdir(), "pb-bureau-"));
    try {
      spawnSync("mkdir", ["-p", join(home, "Desktop")]);
      const script = [`$PB_ESSAI = $true`, `. '${join(process.cwd(), "agent", "diagnostic-robot.ps1").replace(/'/g, "''")}'`, body].join("\n");
      const result = spawnSync(pwsh!, ["-NoProfile", "-Command", script], { encoding: "utf8", env: { ...process.env, HOME: home, USERPROFILE: home, PB_BUREAU: join(home, "Desktop"), PB_SANS_CONFIRMATION: "1" } });
      expect(result.status).toBe(0);
      const desktop = join(home, "Desktop");
      const reports = spawnSync("ls", [desktop], { encoding: "utf8" }).stdout.split("\n").filter((name) => name.startsWith("PharmaBoost-diagnostic-robot-"));
      const content = reports.length ? readFileSync(join(desktop, reports[0]), "utf8") : "";
      return { out: result.stdout, reports, content };
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  };

  it("écrit le rapport, l'annonce « TERMINÉ » et liste les erreurs", () => {
    const { out, reports, content } = withDesktop([
      `function Get-CimInstance { param([string]$ClassName) if ($ClassName -eq 'Win32_OperatingSystem') { [pscustomobject]@{ Caption='W'; Version='1'; OSArchitecture='64' } } }`,
      `function Get-NetTCPConnection { param([string]$State) }`,
      `function Get-Process { @() }`,
      `function Get-SearchRoots { @() }`,
      `Invoke-Diagnostic`,
    ].join("\n"));
    expect(reports).toHaveLength(1);
    expect(out).toContain("TERMINÉ");
    expect(out).toContain("ÉTAPE 2 sur 2");
    expect(content).toContain("21. Erreurs rencontrées pendant la lecture");
    expect(content).toContain("20. Ce que cela suggère");
  });

  it("si la lecture s'arrête net, le rapport existe quand même et dit pourquoi", () => {
    const { out, reports, content } = withDesktop([`function New-Report { $script:Rapport = @("début du rapport"); throw "panne simulée" }`, `Invoke-Diagnostic`].join("\n"));
    expect(reports).toHaveLength(1);
    expect(content).toContain("début du rapport");
    expect(content).toContain("LA LECTURE S'EST ARRÊTÉE AVANT LA FIN");
    expect(content).toContain("panne simulée");
    expect(out).not.toContain("TERMINÉ");
  });

  it("une lecture sans aucune ligne ne fait pas échouer l'ajout au rapport", () => {
    const out = (() => {
      const script = [`$PB_ESSAI = $true`, `. '${join(process.cwd(), "agent", "diagnostic-robot.ps1").replace(/'/g, "''")}'`, `$l = New-Object System.Collections.Generic.List[string]; Add-Lines $l (Get-Reading $true $true 0 0 0 0); Add-Lines $l $null; "ok " + $l.Count`].join("\n");
      const result = spawnSync(pwsh!, ["-NoProfile", "-Command", script], { encoding: "utf8" });
      expect(result.status).toBe(0);
      return result.stdout.trim();
    })();
    expect(out).toBe("ok 0");
  });
});
