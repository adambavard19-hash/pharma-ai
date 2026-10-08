import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { verifyInstaller, loadInstaller, installerResponse } = await import("../installer-file");

/**
 * L'installateur Windows livré avec le code est VRAIMENT là, et c'est lui que décrit son manifeste.
 * Ces contrôles lisent les vrais fichiers (agent/installateur/) : si on rebâtit l'installateur sans mettre
 * le manifeste à jour, ou si le fichier disparaît, ce test échoue — et l'écran ne propose plus le bouton.
 */

const root = process.cwd();
const exe = readFileSync(join(root, "agent", "installateur", "PharmaBoost-Installation.exe"));
const manifest = JSON.parse(readFileSync(join(root, "agent", "installateur", "installateur.json"), "utf8"));

describe("l'installateur Windows livré", () => {
  it("existe, est un exécutable Windows, et correspond à son manifeste (taille et SHA-256)", () => {
    expect(exe.length).toBeGreaterThan(100_000);
    expect(exe.subarray(0, 2).toString("latin1")).toBe("MZ");
    expect(exe.length).toBe(manifest.taille);
    expect(createHash("sha256").update(exe).digest("hex")).toBe(manifest.sha256);
  });

  it("est l'installateur NSIS de PharmaBoost, avec l'agent annoncé", () => {
    expect(exe.toString("latin1")).toContain("Nullsoft Install System");
    expect(manifest.agent).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("le manifeste dit la vérité sur la signature : pas signé", () => {
    expect(manifest.signe).toBe(false);
  });

  it("le service le charge et le déclare disponible", async () => {
    const { status, bytes } = await loadInstaller();
    expect(status.available).toBe(true);
    expect(bytes?.length).toBe(manifest.taille);
    if (status.available) expect(status).toMatchObject({ signed: false, bytes: manifest.taille, sha256: manifest.sha256 });
  });
});

describe("verifyInstaller refuse ce qui n'est pas l'installateur", () => {
  const good = new Uint8Array(exe);

  it("accepte le bon fichier", () => {
    expect(verifyInstaller(good, manifest).ok).toBe(true);
  });

  it("refuse un fichier trop petit", () => {
    expect(verifyInstaller(new Uint8Array(10), manifest)).toMatchObject({ ok: false });
  });

  it("refuse ce qui n'est pas un exécutable Windows (une page d'erreur enregistrée)", () => {
    const html = new Uint8Array(good.length).fill(0x20);
    html.set(new TextEncoder().encode("<html>404</html>"));
    expect(verifyInstaller(html, manifest)).toMatchObject({ ok: false, reason: expect.stringMatching(/exécutable Windows/) });
  });

  it("refuse un fichier tronqué", () => {
    expect(verifyInstaller(good.subarray(0, good.length - 1), manifest)).toMatchObject({ ok: false, reason: expect.stringMatching(/taille/) });
  });

  it("refuse un fichier modifié, même de la bonne taille", () => {
    const tampered = new Uint8Array(good);
    tampered[tampered.length - 1] ^= 0xff;
    expect(verifyInstaller(tampered, manifest)).toMatchObject({ ok: false, reason: expect.stringMatching(/empreinte/) });
  });

  it("refuse un manifeste absent ou illisible", () => {
    expect(verifyInstaller(good, null)).toMatchObject({ ok: false });
    expect(verifyInstaller(good, { sha256: 1 })).toMatchObject({ ok: false });
  });
});

describe("installerResponse", () => {
  it("sert le fichier en pièce jointe, sous le nom qui porte le jeton", async () => {
    const response = installerResponse(good(), "PharmaBoost-Installation-ABC.exe");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="PharmaBoost-Installation-ABC.exe"');
    expect(response.headers.get("content-type")).toBe("application/vnd.microsoft.portable-executable");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.arrayBuffer()).byteLength).toBe(manifest.taille);
  });
});

function good() {
  return new Uint8Array(exe);
}
