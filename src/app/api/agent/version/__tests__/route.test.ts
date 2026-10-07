import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LATEST_AGENT_VERSION } from "@/core/admin/agent-version";

/**
 * La mise à jour automatique des postes : l'icône ne remplace son agent que si le
 * fichier téléchargé a l'empreinte annoncée ici. Les deux routes doivent donc parler
 * du MÊME fichier, octet pour octet.
 */

const route = await import("../route");
const files = await import("../../fichiers/[name]/route");

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("GET /api/agent/version", () => {
  it("annonce la version courante et l'empreinte du fichier de l'agent", async () => {
    const response = await route.GET();
    const body = await response.json();
    const dist = readFileSync(join(process.cwd(), "agent", "dist", "pharmaboost-connect.js"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toEqual({ version: LATEST_AGENT_VERSION, sha256: sha256(dist), size: dist.length });
    expect(body.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("l'empreinte annoncée est celle du fichier que /api/agent/fichiers sert vraiment", async () => {
    const announced = (await (await route.GET()).json()).sha256;
    const served = await files.GET(new Request("http://localhost/api/agent/fichiers/pharmaboost-connect.js"), { params: Promise.resolve({ name: "pharmaboost-connect.js" }) });
    expect(sha256(new Uint8Array(await served.arrayBuffer()))).toBe(announced);
  });

  it("la version annoncée est celle que l'agent déclare : une mise à jour qui s'annonce 0.4.2 alors qu'elle est 0.5.0 se verrait ici", async () => {
    const source = readFileSync(join(process.cwd(), "agent", "src", "index.ts"), "utf8");
    expect(/const VERSION = "([^"]+)"/.exec(source)?.[1]).toBe(LATEST_AGENT_VERSION);
  });
});
