import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildPostInstallScript, buildServerInstallScript } from "../install";

/**
 * Le PowerShell des installateurs ne s'exécute pas ici (macOS, pas de
 * PowerShell) : ce test en est le garde-fou statique. Il découpe le script en
 * code, chaînes et commentaires, vérifie que rien n'est resté ouvert, que les
 * parenthèses, accolades et crochets s'équilibrent, et traque les pièges
 * connus de PowerShell (« $variable: » dans une chaîne). Il ne remplace pas
 * un essai sur un vrai Windows : il évite les fautes de frappe.
 */

type Scan = { code: string; doubleQuoted: string[]; errors: string[] };

function scanPowerShell(source: string): Scan {
  const src = source.replace(/^\uFEFF/, "");
  const doubleQuoted: string[] = [];
  const errors: string[] = [];
  let code = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    // Chaîne sur plusieurs lignes : @" … "@ ou @' … '@ (le délimiteur de fin commence une ligne).
    if (c === "@" && (next === '"' || next === "'") && /^[ \t]*\r?\n/.test(src.slice(i + 2, i + 40))) {
      const end = src.indexOf(`\n${next}@`, i + 2);
      if (end === -1) {
        errors.push(`chaîne ${c}${next} jamais refermée (ligne ${src.slice(0, i).split("\n").length})`);
        break;
      }
      if (next === '"') doubleQuoted.push(src.slice(i + 2, end));
      code += " ";
      i = end + 3;
      continue;
    }
    if (c === "<" && next === "#") {
      const end = src.indexOf("#>", i + 2);
      if (end === -1) {
        errors.push("commentaire <# jamais refermé");
        break;
      }
      i = end + 2;
      continue;
    }
    if (c === "#") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      for (;;) {
        if (j >= src.length) {
          errors.push(`apostrophe jamais refermée (ligne ${src.slice(0, i).split("\n").length})`);
          return { code, doubleQuoted, errors };
        }
        if (src[j] === "'") {
          if (src[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      code += " ";
      i = j + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      for (;;) {
        if (j >= src.length) {
          errors.push(`guillemet jamais refermé (ligne ${src.slice(0, i).split("\n").length})`);
          return { code, doubleQuoted, errors };
        }
        if (src[j] === "`") {
          j += 2;
          continue;
        }
        if (src[j] === '"') {
          if (src[j + 1] === '"') {
            j += 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      doubleQuoted.push(src.slice(i + 1, j));
      code += " ";
      i = j + 1;
      continue;
    }
    code += c;
    i += 1;
  }
  return { code, doubleQuoted, errors };
}

function unbalanced(code: string): string | null {
  const pairs: Record<string, string> = { ")": "(", "}": "{", "]": "[" };
  const stack: string[] = [];
  for (const char of code) {
    if ("({[".includes(char)) stack.push(char);
    else if (char in pairs && stack.pop() !== pairs[char]) return `« ${char} » sans son ouvrant`;
  }
  return stack.length > 0 ? `« ${stack[stack.length - 1]} » jamais refermé` : null;
}

/** Le bloc `{ … }` qui s'ouvre à `open` (l'index d'une accolade, dans du code déjà débarrassé de ses chaînes et commentaires), accolades comprises. */
function blockAt(code: string, open: number): string {
  let depth = 0;
  for (let index = open; index < code.length; index += 1) {
    if (code[index] === "{") depth += 1;
    if (code[index] === "}" && --depth === 0) return code.slice(open, index + 1);
  }
  throw new Error("accolade jamais refermée");
}

/** Le script sans ses lignes de commentaire : ce qu'il exécute vraiment. */
const withoutCommentLines = (source: string) => source.split("\n").filter((line) => !line.trim().startsWith("#"));

const read = (name: string) => readFileSync(join(process.cwd(), "agent", name), "utf8");

const scripts: Record<string, string> = {
  "agent/install-windows.ps1": read("install-windows.ps1"),
  "agent/install-poste-windows.ps1": read("install-poste-windows.ps1"),
  "script servi : serveur": buildServerInstallScript({ baseUrl: "https://pharmaboost.app", code: "123456", lgo: "lgpi" }),
  "script servi : poste (avec serveur)": buildPostInstallScript({ baseUrl: "https://pharmaboost.app", token: "AbCdEfGhIjKlMnOp", label: "Comptoir 1", pharmacyName: "Pharmacie du Port", serverHostname: "SRV-PHARMA" }),
  "script servi : poste (sans serveur)": buildPostInstallScript({ baseUrl: "https://pharmaboost.app", token: "AbCdEfGhIjKlMnOp", label: null, pharmacyName: "Pharmacie du Port", serverHostname: null }),
};

describe("la forme du PowerShell des installateurs", () => {
  for (const [name, source] of Object.entries(scripts)) {
    describe(name, () => {
      const scan = scanPowerShell(source);

      it("aucune chaîne ni commentaire laissé ouvert", () => {
        expect(scan.errors).toEqual([]);
      });

      it("parenthèses, accolades et crochets s'équilibrent", () => {
        expect(unbalanced(scan.code)).toBeNull();
      });

      it("aucun « $variable: » dans une chaîne : PowerShell y lirait une variable à portée (« $Export: » n'existe pas)", () => {
        const pitfalls = scan.doubleQuoted.flatMap((text) => text.match(/\$[A-Za-z_][A-Za-z0-9_]*:(?![A-Za-z_:])/g) ?? []);
        expect(pitfalls).toEqual([]);
      });
    });
  }

  it("le détecteur détecte : chaîne ouverte, accolade oubliée, variable à portée", () => {
    expect(scanPowerShell('Write-Host "bonjour').errors).not.toEqual([]);
    expect(scanPowerShell("Write-Host 'bonjour").errors).not.toEqual([]);
    expect(unbalanced(scanPowerShell("if ($x) { Write-Host 1").code)).not.toBeNull();
    expect(unbalanced(scanPowerShell("if ($x) { Write-Host 1 }").code)).toBeNull();
    expect(scanPowerShell('Write-Host "dossier $Export: ok"').doubleQuoted.join().match(/\$[A-Za-z_][A-Za-z0-9_]*:(?![A-Za-z_:])/)).not.toBeNull();
    // Un « # » dans une chaîne n'est pas un commentaire ; une apostrophe dans un commentaire n'ouvre rien.
    expect(scanPowerShell(`Write-Host "a # b" # l'essentiel`).errors).toEqual([]);
  });
});

describe("agent/install-windows.ps1 : stock, raccourci et partage", () => {
  const source = read("install-windows.ps1");
  const stock = source.slice(source.indexOf("# Stock : le dossier d'export"));

  it("est enregistré en UTF-8 avec BOM : Windows PowerShell 5.1 lirait sinon les accents en ANSI", () => {
    expect([...readFileSync(join(process.cwd(), "agent", "install-windows.ps1")).subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect([...readFileSync(join(process.cwd(), "agent", "install-poste-windows.ps1")).subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("l'existant est intact : la section stock vient après le message « agent connecté »", () => {
    expect(source.indexOf("affiche maintenant « agent connecté »")).toBeGreaterThan(0);
    expect(source.indexOf("affiche maintenant « agent connecté »")).toBeLessThan(source.indexOf("# Stock : le dossier d'export"));
    expect(source).toContain('Register-ScheduledTask -TaskName "PharmaBoost Connect"');
  });

  it("partage le dossier d'export sous le nom PharmaBoost, en modification pour les utilisateurs authentifiés seulement", () => {
    expect(stock).toContain('$nomPartage = "PharmaBoost"');
    expect(stock).toMatch(/New-SmbShare -Name \$nomPartage -Path \$Export -ChangeAccess \$authentifies/);
    expect(stock).toContain("S-1-5-11");
    expect(stock).toContain('/grant "*S-1-5-11:(OI)(CI)M"');
  });

  it("n'ouvre jamais le partage à « Tout le monde » et ne donne jamais le contrôle total", () => {
    expect(stock).not.toMatch(/Everyone|S-1-1-0/i);
    // « Tout le monde » n'apparaît que dans un commentaire qui l'exclut, jamais dans une commande.
    const commands = stock.split("\n").filter((line) => !line.trim().startsWith("#"));
    expect(commands.join("\n")).not.toMatch(/Tout le monde/i);
    expect(stock).not.toMatch(/-FullAccess|-ReadAccess/);
    expect(stock).not.toMatch(/Grant-SmbShareAccess/);
  });

  it("pose le raccourci « Stock PharmaBoost » sur le Bureau public, vers le dossier d'export", () => {
    expect(stock).toContain('Join-Path $racine "Desktop"');
    expect(stock).toContain('"Stock PharmaBoost.lnk"');
    expect(stock).toContain("$lien.TargetPath = $Export");
    expect(stock).toContain('$racine = "C:\\Users\\Public"');
  });

  it("chaque étape est dans un try/catch dont l'échec s'affiche en jaune, sans jamais arrêter l'installation", () => {
    const { code } = scanPowerShell(stock);
    expect((code.match(/\btry \{/g) ?? []).length).toBe(2);
    const catches = [...code.matchAll(/\bcatch \{/g)].map((match) => blockAt(code, match.index + match[0].length - 1));
    expect(catches).toHaveLength(2);
    for (const block of catches) {
      expect(block).toContain("-ForegroundColor Yellow");
      expect(block).not.toMatch(/\bthrow\b|\bexit\b/);
    }
  });

  it("finit par un message en français : ce qui est installé et le chemin partagé", () => {
    expect(stock).toContain('Write-Host "Installation terminée." -ForegroundColor Green');
    expect(stock).toContain("\\\\$($env:COMPUTERNAME)\\$nomPartage");
    expect(stock).toContain("enregistrez l'édition du stock dans le dossier PharmaBoost");
  });
});

describe("agent/install-windows.ps1 : le dossier d'export ne reçoit aucun mémo", () => {
  const source = read("install-windows.ps1");
  const commands = withoutCommentLines(source);

  it("n'écrit rien dans $Export : l'agent enverrait un LISEZMOI.txt comme fichier de stock", () => {
    expect(commands.join("\n")).not.toMatch(/Join-Path \$Export\b/);
    // Aucune commande d'écriture ne vise le dossier d'export.
    const writes = commands.filter((line) => /\$Export\b/.test(line) && /\b(Set-Content|Add-Content|Out-File|Copy-Item|Move-Item|Tee-Object)\b|New-Item -ItemType File/.test(line));
    expect(writes).toEqual([]);
    // Et aucun LISEZMOI n'est lié à ce dossier.
    expect(commands.filter((line) => /LISEZMOI/i.test(line) && /\$Export\b/.test(line))).toEqual([]);
  });

  it("l'unique mémo écrit va dans le dossier des ordonnances scannées, que l'agent ne lit que pour ses PDF, JPG, PNG et WEBP", () => {
    const memos = commands.filter((line) => /LISEZMOI/i.test(line));
    expect(memos).toHaveLength(1);
    expect(memos[0]).toContain("$Scans");
    // Le programme n'envoie comme stock que ces extensions : un .txt dans l'export serait lu comme un stock.
    const agent = readFileSync(join(process.cwd(), "agent", "src", "index.ts"), "utf8");
    expect(agent).toMatch(/csv\|txt\|xlsx\|xls\|pdf/);
    expect(agent).toMatch(/pdf\|jpe\?g\|png\|webp/);
  });

  it("crée toujours le dossier d'export (sans y rien mettre)", () => {
    expect(source).toMatch(/foreach \(\$d in @\(\$Export, \$Scans\)\) \{\s*if \(\$d -ne ""\) \{ New-Item -ItemType Directory -Force -Path \$d \| Out-Null \}/);
  });
});

describe("agent/install-windows.ps1 : le partage n'est créé que pour le dossier par défaut", () => {
  const source = read("install-windows.ps1");
  const { code } = scanPowerShell(source);
  const GUARD = "if ($Export -ieq $exportParDefaut) {";

  it("le dossier par défaut du partage est exactement celui du paramètre -Export", () => {
    expect(source).toContain('[string]$Export = "C:\\PharmaBoost\\Export"');
    expect(source).toContain('$exportParDefaut = "C:\\PharmaBoost\\Export"');
  });

  it("la garde compare le chemin en entier, sans tenir compte de la casse (-ieq, ni -like ni -match)", () => {
    expect(source).toContain(GUARD);
    expect(source).not.toMatch(/\$Export -(like|match|clike|cmatch|contains|notlike)\b/i);
  });

  it("le partage et les droits du dossier (icacls) ne sont touchés qu'à l'intérieur de la garde, jamais pour un dossier personnalisé", () => {
    const guard = code.indexOf(GUARD);
    expect(guard).toBeGreaterThan(0);
    const inside = blockAt(code, code.indexOf("{", guard));
    for (const command of ["New-SmbShare", "Remove-SmbShare", "icacls.exe"]) {
      expect(inside).toContain(command);
      // Chaque occurrence du script est dans la garde : aucune n'est restée dehors.
      expect(code.split(command).length - 1).toBe(inside.split(command).length - 1);
    }
  });

  it("un dossier personnalisé : message jaune « partage non créé », sans aucune commande de partage", () => {
    const guard = code.indexOf(GUARD);
    const inside = blockAt(code, code.indexOf("{", guard));
    const after = code.slice(guard + code.slice(guard).indexOf(inside) + inside.length);
    expect(after).toMatch(/^\s*else \{/);
    const otherwise = blockAt(after, after.indexOf("{"));
    expect(otherwise).toContain("-ForegroundColor Yellow");
    expect(otherwise).not.toMatch(/SmbShare|icacls|\bthrow\b|\bexit\b/);
    expect(source).toContain("Dossier d'export personnalisé ($Export) : partage réseau « PharmaBoost » non créé.");
    // Le récapitulatif final le dit aussi, en jaune.
    expect(source).toContain("non créé (dossier d'export personnalisé)");
  });

  it("le raccourci du Bureau reste posé dans tous les cas : il est créé avant la garde, hors de son bloc", () => {
    const guard = code.indexOf(GUARD);
    const inside = blockAt(code, code.indexOf("{", guard));
    expect(code.indexOf("CreateShortcut")).toBeGreaterThan(0);
    expect(code.indexOf("CreateShortcut")).toBeLessThan(guard);
    expect(inside).not.toContain("CreateShortcut");
  });
});

describe("agent/install-poste-windows.ps1 : le raccourci vers le dossier du serveur", () => {
  const source = read("install-poste-windows.ps1");

  it("accepte -DossierStock, vide par défaut", () => {
    expect(source).toContain('[string]$DossierStock = ""');
  });

  it("ne crée le raccourci que si un dossier est donné, sur le Bureau de la session, sans jamais bloquer", () => {
    const start = source.indexOf('if ($DossierStock -ne "") {');
    expect(start).toBeGreaterThan(0);
    const block = source.slice(start, source.indexOf("Write-Host \"Le poste est relié."));
    expect(block).toContain('[Environment]::GetFolderPath("Desktop")');
    expect(block).toContain("$lien.TargetPath = $DossierStock");
    expect(block).toContain('"Stock PharmaBoost.lnk"');
    expect(block).toMatch(/catch \{[\s\S]*-ForegroundColor Yellow[\s\S]*\}/);
    expect(block).not.toMatch(/\bthrow\b|\bexit\b/);
  });

  it("le raccourci est créé après l'appairage et le démarrage de la tâche : un échec n'abîme rien", () => {
    expect(source.indexOf('if ($DossierStock -ne "")')).toBeGreaterThan(source.indexOf("Start-ScheduledTask -TaskName $taskName\n\n"));
    expect(source.indexOf('if ($DossierStock -ne "")')).toBeGreaterThan(source.indexOf("--poste $Code"));
  });
});
