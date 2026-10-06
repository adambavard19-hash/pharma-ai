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

  it("tout ce qui n'est pas dans la liste blanche : 404", async () => {
    for (const name of ["inconnu.ps1", "README.md", "../package.json", "constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const response = await call(name);
      expect(response.status).toBe(404);
    }
  });
});
