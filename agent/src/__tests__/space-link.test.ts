import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserCommand, isSpaceLinked, markSpaceLinked, openInBrowser, shouldOpenSpaceAtStartup, SPACE_LINK_FILE, SPACE_LINK_STARTUP_ATTEMPTS, spaceUrl, spaceWitness, type Spawner } from "../space-link";

/**
 * « Ouvrir mon espace PharmaBoost » : au démarrage UNE fois par PC (jamais pendant une vente), ou à la demande ; une adresse
 * sûre (le serveur de l'agent, un jeton sans caractère spécial), ouverte sans invite de commandes.
 */

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcd";
let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "pb-espace-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("une seule fois par PC", () => {
  it("le témoin est écrit à côté de la configuration, sans la clé en clair ; il vaut pour CETTE clé de poste", () => {
    expect(isSpaceLinked(dir, "cle-du-poste-1")).toBe(false);
    markSpaceLinked(dir, "cle-du-poste-1", new Date("2026-10-13T08:00:00Z"));
    expect(isSpaceLinked(dir, "cle-du-poste-1")).toBe(true);
    const written = readFileSync(join(dir, SPACE_LINK_FILE), "utf8");
    expect(written).toBe(`${spaceWitness("cle-du-poste-1")} 2026-10-13T08:00:00.000Z\n`);
    expect(written).not.toContain("cle-du-poste-1");
    // PC réinstallé (nouvelle clé) : il se relie une fois de plus.
    expect(isSpaceLinked(dir, "cle-du-poste-2")).toBe(false);
  });

  it("un témoin abîmé ou un dossier illisible : pas lié (au pire, l'espace se rouvre une fois), jamais une panne", () => {
    writeFileSync(join(dir, SPACE_LINK_FILE), "n'importe quoi");
    expect(isSpaceLinked(dir, "cle")).toBe(false);
    expect(isSpaceLinked(join(dir, "absent"), "cle")).toBe(false);
    expect(() => markSpaceLinked(join(dir, "absent", "plus-loin"), "cle")).not.toThrow();
  });

  it("au démarrage : sur Windows, jamais lié, aucune vente en cours, dans la limite des essais — sinon rien", () => {
    const base = { platform: "win32" as const, linked: false, saleInProgress: false, attempts: 0 };
    expect(shouldOpenSpaceAtStartup(base)).toBe(true);
    expect(shouldOpenSpaceAtStartup({ ...base, linked: true })).toBe(false);
    expect(shouldOpenSpaceAtStartup({ ...base, saleInProgress: true })).toBe(false);
    expect(shouldOpenSpaceAtStartup({ ...base, attempts: SPACE_LINK_STARTUP_ATTEMPTS })).toBe(false);
    expect(shouldOpenSpaceAtStartup({ ...base, attempts: Number.POSITIVE_INFINITY })).toBe(false);
    // Les essais sur Mac ne lancent rien tout seuls (la commande --ouvrir-espace, elle, marche partout).
    expect(shouldOpenSpaceAtStartup({ ...base, platform: "darwin" })).toBe(false);
  });
});

describe("une adresse sûre", () => {
  it("le serveur de l'agent, le chemin fixe, le jeton tel quel", () => {
    expect(spaceUrl("https://pharmaboost.app", TOKEN)).toBe(`https://pharmaboost.app/comptoir/lier?jeton=${TOKEN}`);
    expect(spaceUrl("https://pharmaboost.app/", TOKEN)).toBe(`https://pharmaboost.app/comptoir/lier?jeton=${TOKEN}`);
    expect(spaceUrl("http://localhost:3000", TOKEN)).toBe(`http://localhost:3000/comptoir/lier?jeton=${TOKEN}`);
  });

  it("refuse un serveur en clair, un jeton piégé (&, guillemets, espaces, %), trop court ou absent : rien n'est ouvert", () => {
    expect(spaceUrl("http://pharmaboost.app", TOKEN)).toBeNull();
    expect(spaceUrl("ftp://pharmaboost.app", TOKEN)).toBeNull();
    for (const bad of [`${TOKEN}&calc`, `${TOKEN}" & calc.exe`, `${TOKEN} x`, `${TOKEN}%26`, "court", "", null, undefined, 42, `${TOKEN}#x`]) expect(spaceUrl("https://pharmaboost.app", bad)).toBeNull();
  });

  it("refuse un serveur qui porterait un identifiant, un chemin ou une requête", () => {
    expect(spaceUrl("https://moi:secret@pharmaboost.app", TOKEN)).toBeNull();
    expect(spaceUrl("https://pharmaboost.app/ailleurs", TOKEN)).toBeNull();
    expect(spaceUrl("https://pharmaboost.app?x=1", TOKEN)).toBeNull();
  });
});

describe("ouvert sans invite de commandes", () => {
  it("Windows : rundll32 url.dll,FileProtocolHandler, l'adresse en UN argument — jamais cmd /c start", () => {
    const url = `https://pharmaboost.app/comptoir/lier?jeton=${TOKEN}`;
    expect(browserCommand(url, "win32")).toEqual({ file: "rundll32.exe", args: ["url.dll,FileProtocolHandler", url] });
    expect(JSON.stringify(browserCommand(url, "win32"))).not.toMatch(/cmd|start|powershell/i);
    expect(browserCommand(url, "darwin")).toEqual({ file: "open", args: [url] });
    expect(browserCommand(url, "linux")).toEqual({ file: "xdg-open", args: [url] });
  });

  it("lance le programme détaché, sans shell, sans le cacher (le navigateur doit venir devant) ; vrai s'il est parti", () => {
    const calls: { file: string; args: string[]; options: Parameters<Spawner>[2] }[] = [];
    let unref = 0;
    const spawner: Spawner = (file, args, options) => {
      calls.push({ file, args, options });
      return { unref: () => { unref += 1; }, on: () => undefined };
    };
    const url = `https://pharmaboost.app/comptoir/lier?jeton=${TOKEN}`;
    expect(openInBrowser(url, "win32", spawner)).toBe(true);
    expect(calls).toEqual([{ file: "rundll32.exe", args: ["url.dll,FileProtocolHandler", url], options: { detached: true, stdio: "ignore", windowsHide: false, shell: false } }]);
    expect(unref).toBe(1);
    expect(openInBrowser(url, "win32", () => { throw new Error("ENOENT"); })).toBe(false);
  });
});
