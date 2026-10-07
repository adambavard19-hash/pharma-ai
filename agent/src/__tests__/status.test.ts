import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { STATUS_FILE_NAME, stateForFailure, statusFilePath, writeStatus, type PostStatus } from "../status";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const status: PostStatus = { etat: "ok", at: "2026-10-08T09:00:00.000Z", version: "0.5.0", poste: "Caisse 1", officine: "Pharmacie du Parc", notice: null };

describe("le fichier d'état lu par l'icône", () => {
  it("est écrit à côté de la configuration, en JSON lisible, sans fichier temporaire oublié", () => {
    const dir = mkdtempSync(join(tmpdir(), "pb-status-"));
    dirs.push(dir);
    const config = join(dir, "pharmaboost-connect.json");
    writeStatus(config, status);
    expect(statusFilePath(config)).toBe(join(dir, STATUS_FILE_NAME));
    expect(JSON.parse(readFileSync(statusFilePath(config), "utf8"))).toEqual(status);
    expect(readdirSync(dir)).toEqual([STATUS_FILE_NAME]);
  });

  it("remplace l'état précédent", () => {
    const dir = mkdtempSync(join(tmpdir(), "pb-status-"));
    dirs.push(dir);
    const config = join(dir, "pharmaboost-connect.json");
    writeStatus(config, status);
    writeStatus(config, { ...status, etat: "hors-ligne", notice: "Dossier d'export introuvable" });
    expect(JSON.parse(readFileSync(statusFilePath(config), "utf8"))).toMatchObject({ etat: "hors-ligne", notice: "Dossier d'export introuvable" });
  });

  it("ne fait jamais tomber l'agent quand le dossier est inaccessible", () => {
    expect(() => writeStatus("/proc/inexistant/\0/pharmaboost-connect.json", status)).not.toThrow();
  });
});

describe("la raison d'un signe de vie manqué", () => {
  it("clé retirée dans PharmaBoost : le poste est retiré", () => {
    expect(stateForFailure(new Error("clé du poste révoquée"))).toBe("revoque");
  });
  it("tout le reste est une coupure : le poste est hors ligne", () => {
    expect(stateForFailure(new TypeError("fetch failed"))).toBe("hors-ligne");
    expect(stateForFailure("HTTP 502")).toBe("hors-ligne");
  });
});
