import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INSTALLER_EXIT, INSTALLER_FILE_PREFIX } from "../installer";
import type { PostState } from "../status";

/**
 * L'installateur Windows est écrit en trois langages (NSIS, C#, TypeScript) qui se
 * parlent par des conventions : le nom du fichier, des codes de sortie, un fichier
 * d'état, une empreinte. Aucun de ces tests ne lance Windows : ils gardent ces
 * conventions d'accord entre elles, parce qu'une divergence ne se verrait qu'au
 * poste, chez un pharmacien.
 */

const root = process.cwd();
const read = (...path: string[]) => readFileSync(join(root, ...path), "utf8");
const nsi = read("installateur", "installer.nsi");
const trayStatus = read("installateur", "Tray", "StatusView.cs");
const trayUpdater = read("installateur", "Tray", "Updater.cs");
const setupFetcher = read("installateur", "Setup", "NodeFetcher.cs");

describe("le binaire livré", () => {
  const binaryPath = join(root, "agent", "installateur", "PharmaBoost-Installation.exe");
  const manifest = JSON.parse(read("agent", "installateur", "installateur.json")) as { version: string; node: string; sha256: string; taille: number; agent: string | null };
  const bytes = readFileSync(binaryPath);

  it("est un installateur NSIS Windows, et la fiche dit vrai : empreinte et taille", () => {
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("MZ");
    expect(bytes.includes(Buffer.from("NullsoftInst"))).toBe(true);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(manifest.sha256);
    expect(statSync(binaryPath).size).toBe(manifest.taille);
  });

  it("tient largement sous la limite d'une réponse de fonction (4,5 Mo) : le moteur est téléchargé à l'installation, pas embarqué", () => {
    expect(bytes.length).toBeLessThan(2 * 1024 * 1024);
  });

  it("embarque la version de Node épinglée, avec son empreinte, celles de installateur.json", () => {
    const pinned = JSON.parse(read("installateur", "installateur.json")) as { version: string; node: { version: string; sha256: string } };
    expect(manifest.node).toBe(pinned.node.version);
    expect(manifest.version).toBe(pinned.version);
    expect(pinned.node.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(pinned.node.version).toMatch(/^v\d+\.\d+\.\d+$/);
    // Le binaire est compressé : on ne cherche pas la version dans ses octets, la fiche est la preuve de la construction.
  });
});

describe("le nom du fichier : NSIS et l'agent lisent le même préfixe", () => {
  it("NSIS compare les 25 premiers caractères du nom ; le préfixe de l'agent en fait 25", () => {
    expect(INSTALLER_FILE_PREFIX).toHaveLength(25);
    expect(nsi).toContain(`!define FILE_PREFIX "${INSTALLER_FILE_PREFIX}"`);
    expect(nsi).toContain("StrCpy $0 $EXEFILE 25");
    expect(nsi).toContain("StrCpy $0 $EXEFILE 1 25");
  });
});

describe("les codes de sortie : l'installateur sait lire ce que l'agent répond", () => {
  const caseFor = (code: number) => new RegExp(String.raw`\$\{Case\} ${code}\s+!insertmacro Fail ${code} `);

  it("--installer : 2, 3 et 4 ont chacun leur message dans le script NSIS", () => {
    expect(nsi).toMatch(caseFor(INSTALLER_EXIT.noCode));
    expect(nsi).toMatch(caseFor(INSTALLER_EXIT.refused));
    expect(nsi).toMatch(caseFor(INSTALLER_EXIT.unreachable));
  });

  it("le lien déjà utilisé sur un poste relié (code 3) ne casse pas la mise à jour", () => {
    expect(nsi).toMatch(/\$\{If\} \$0 == "3"\s+\$\{AndIf\} \$AlreadyPaired = 1/);
  });

  it("l'outil de préparation de Node : 10, 11, 12 et 14 ont chacun leur message, et 0 est le succès", () => {
    const constants = Object.fromEntries([...setupFetcher.matchAll(/public const int (\w+) = (\d+);/g)].map((match) => [match[1], Number(match[2])]));
    expect(constants).toMatchObject({ Ok: 0, DownloadFailed: 10, ChecksumMismatch: 11, ExtractFailed: 12, BadArguments: 13, NodeWontStart: 14 });
    for (const code of [constants.DownloadFailed, constants.ChecksumMismatch, constants.ExtractFailed, constants.NodeWontStart]) {
      expect(nsi).toMatch(caseFor(code));
    }
  });

  it("les codes de sortie propres à l'installateur (version de Windows, déjà en cours) ne recoupent aucun code de l'agent", () => {
    const own = [...nsi.matchAll(/SetErrorLevel (\d+)/g)].map((match) => Number(match[1]));
    const agent = new Set<number>(Object.values(INSTALLER_EXIT));
    for (const code of [5, 6]) expect(agent.has(code)).toBe(false);
    expect(own).toEqual(expect.arrayContaining([5, 6]));
  });

  it("une comparaison de TEXTE décide du succès : « error » (nsExec n'a pas pu lancer) n'est jamais pris pour 0", () => {
    expect(nsi).toContain('${ElseIf} $0 != "0"');
    expect(nsi).not.toMatch(/\$0 <> 0/);
  });
});

describe("le fichier d'état : l'agent l'écrit, l'icône le lit", () => {
  it("l'icône traite les états que l'agent peut écrire", () => {
    const states: PostState[] = ["ok", "hors-ligne", "revoque"];
    expect(trayStatus).toContain('case "ok"');
    expect(trayStatus).toContain('case "revoque"');
    // « hors-ligne » est le cas par défaut : tout état inconnu est montré comme une coupure, jamais comme « relié ».
    expect(trayStatus).toContain("default:");
    expect(states).toHaveLength(3);
  });

  it("l'icône lit les champs que l'agent écrit", () => {
    for (const field of ["etat", "at", "notice"]) expect(trayStatus).toContain(`"${field}"`);
  });
});

describe("la mise à jour automatique : l'icône et la route parlent le même langage", () => {
  it("l'icône lit « sha256 » dans /api/agent/version et télécharge /api/agent/fichiers/pharmaboost-connect.js", () => {
    expect(trayUpdater).toContain('"/api/agent/version"');
    expect(trayUpdater).toContain('"sha256"');
    expect(trayUpdater).toContain('"/api/agent/fichiers/pharmaboost-connect.js"');
  });

  it("l'icône vérifie l'empreinte AVANT de remplacer, et ne télécharge jamais depuis un serveur en clair", () => {
    expect(trayUpdater.indexOf("Sha256(data) != wanted")).toBeGreaterThan(-1);
    expect(trayUpdater.indexOf("Sha256(data) != wanted")).toBeLessThan(trayUpdater.indexOf("public static void Apply"));
    expect(trayUpdater).toContain("UriSchemeHttps");
    expect(trayUpdater).toContain("IsLoopback");
  });
});

describe("l'installation ne demande jamais de droits d'administrateur et démarre avec la session", () => {
  it("niveau d'exécution : utilisateur", () => {
    expect(nsi).toContain("RequestExecutionLevel user");
    expect(read("installateur", "Tray", "app.manifest")).toContain('level="asInvoker"');
  });

  it("l'icône démarre à l'ouverture de session, et l'ancienne tâche planifiée de l'installation en une ligne est retirée", () => {
    expect(nsi).toContain('WriteRegStr HKCU "${RUN_KEY}" "PharmaBoost"');
    expect(nsi).toContain('schtasks /Delete /TN "PharmaBoost Connect (poste)" /F');
  });

  it("le script est enregistré en UTF-8 avec marque d'ordre des octets : sans elle NSIS lirait les accents en ANSI", () => {
    const head = readFileSync(join(root, "installateur", "installer.nsi")).subarray(0, 3);
    expect([...head]).toEqual([0xef, 0xbb, 0xbf]);
  });
});
