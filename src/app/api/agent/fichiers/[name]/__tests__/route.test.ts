import { describe, expect, it } from "vitest";

/**
 * Les fichiers servis aux installateurs en une ligne : une liste blanche, et
 * les scripts PowerShell toujours en UTF-8 avec BOM. Les vrais fichiers de
 * `agent/` sont lus : c'est ce que Windows recevra.
 */

const route = await import("../route");

const call = (name: string) => route.GET(new Request(`http://localhost/api/agent/fichiers/${name}`), { params: Promise.resolve({ name }) });
const head = async (response: Response, count = 3) => [...new Uint8Array(await response.arrayBuffer()).subarray(0, count)];

describe("GET /api/agent/fichiers/[name]", () => {
  it("sert l'installateur du serveur : texte brut, UTF-8 avec BOM, jamais en cache", async () => {
    const response = await call("install-windows.ps1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await head(response)).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("sert l'installateur de poste, lui aussi avec BOM", async () => {
    const response = await call("install-poste-windows.ps1");
    expect(response.status).toBe(200);
    expect(await head(response)).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("ne double jamais le BOM : le script est servi tel que le fichier le contient, BOM compris", async () => {
    const bytes = new Uint8Array(await (await call("install-windows.ps1")).arrayBuffer());
    expect([...bytes.subarray(3, 6)]).not.toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes.subarray(3, 40))).toContain("PharmaBoost Connect");
  });

  it("sert le programme tel quel : du JavaScript, sans BOM", async () => {
    const response = await call("pharmaboost-connect.js");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/javascript; charset=utf-8");
    expect(await head(response)).not.toEqual([0xef, 0xbb, 0xbf]);
  });

  it("sert le diagnostic du robot en .cmd à télécharger : enveloppe en ASCII, sans BOM, fins de ligne Windows, script UTF-8 après le repère", async () => {
    const response = await call("diagnostic-robot.cmd");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="PharmaBoost-Diagnostic-Robot.cmd"');
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.subarray(0, 3)]).not.toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith("@echo off\r\n")).toBe(true);
    expect(text.split("#<<POWERSHELL>>").pop()).toContain("function New-Report");
    expect(text.split(/\r?\n/).every((line, index, lines) => index === lines.length - 1 || text.includes(line + "\r\n"))).toBe(true);
    expect(text).not.toMatch(/[^\r]\n/);
  });

  it("sert la lecture du journal de LGPI en .cmd à télécharger : enveloppe en ASCII, programme exécuté par le Node de PharmaBoost", async () => {
    const response = await call("lire-journal.cmd");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="PharmaBoost-Lecture-Journal.cmd"');
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const text = new TextDecoder().decode(new Uint8Array(await response.arrayBuffer()));
    expect(text.startsWith("@echo off\r\n")).toBe(true);
    expect(text).toContain("%LOCALAPPDATA%\\PharmaBoost\\Poste\\node\\node.exe");
    expect(text.split("//<<JS>>").pop()).toContain("PB_LIRE_JOURNAL_LANCER");
    expect(text).not.toMatch(/[^\r]\n/);
  });

  it("tout ce qui n'est pas dans la liste blanche : 404", async () => {
    for (const name of ["inconnu.ps1", "README.md", "../package.json", "constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const response = await call(name);
      expect(response.status).toBe(404);
    }
  });
});
