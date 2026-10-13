import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GREETING_FILE, GREETING_STARTUP_WINDOW_MS, cleanFirstName, greetedToday, greetingText, localDay, markGreeted, shouldGreet } from "../greeting";
import { NoticeCenter, encodeCommand, type HostProcess } from "../notice-center";

/**
 * Le bonjour du robot au démarrage du poste (demande du fondateur, 13 oct. 2026) : le texte exact, avec ou sans prénom,
 * une seule fois par jour et par poste (fichier témoin), jamais pendant une vente, seulement par l'île, en ASCII sur le tuyau.
 */

const WITH_NAME = "Bonjour Léa, comment vas-tu ? Bon courage pour faire le plus de conseils possibles. N'hésite pas à me demander ce que tu veux si tu as besoin.";
const WITHOUT_NAME = "Bonjour, comment vas-tu ? Bon courage pour faire le plus de conseils possibles. N'hésite pas à me demander ce que tu veux si tu as besoin.";

describe("le texte du bonjour", () => {
  it("dit le prénom quand le serveur le connaît, et rien d'autre sinon", () => {
    expect(greetingText("Léa")).toBe(WITH_NAME);
    expect(greetingText("")).toBe(WITHOUT_NAME);
    expect(greetingText(null)).toBe(WITHOUT_NAME);
    expect(greetingText(undefined)).toBe(WITHOUT_NAME);
    expect(greetingText("   ")).toBe(WITHOUT_NAME);
  });

  it("nettoie le prénom : une ligne, sans caractère de contrôle, borné à 40 caractères", () => {
    expect(cleanFirstName("  Marie\n-Hélène \u2028 ")).toBe("Marie -Hélène");
    expect(cleanFirstName("A\u0000B")).toBe("A B");
    expect(cleanFirstName("x".repeat(80))).toHaveLength(40);
    expect(cleanFirstName(42)).toBe("");
    expect(cleanFirstName({ firstName: "Léa" })).toBe("");
  });
});

describe("une seule fois par jour et par poste", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "pb-bonjour-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it("le témoin daté (heure locale du poste) dit « déjà fait aujourd'hui », et plus le lendemain", () => {
    const morning = new Date(2026, 9, 13, 8, 2);
    expect(greetedToday(dir, morning)).toBe(false);
    markGreeted(dir, morning);
    expect(existsSync(join(dir, GREETING_FILE))).toBe(true);
    expect(readFileSync(join(dir, GREETING_FILE), "utf8").startsWith("2026-10-13 ")).toBe(true);
    // Un redémarrage du PC à midi, ou une mise à jour automatique : pas de second bonjour.
    expect(greetedToday(dir, new Date(2026, 9, 13, 12, 30))).toBe(true);
    expect(greetedToday(dir, new Date(2026, 9, 13, 23, 59))).toBe(true);
    expect(greetedToday(dir, new Date(2026, 9, 14, 7, 55))).toBe(false);
    expect(localDay(new Date(2026, 0, 5, 9))).toBe("2026-01-05");
  });

  it("un dossier illisible ne fait jamais tomber l'agent", () => {
    expect(() => markGreeted(join(dir, "absent", "plus-loin"))).not.toThrow();
    expect(greetedToday(join(dir, "absent"))).toBe(false);
  });
});

describe("quand dire bonjour", () => {
  const calm = { greetedToday: false, islandReady: true, saleInProgress: false, heartbeatOk: true, sinceStartMs: 20_000 };

  it("au démarrage, île prête, poste calme, premier signe de vie reçu", () => {
    expect(shouldGreet(calm)).toBe(true);
  });

  it("jamais pendant une vente : il attend le prochain moment calme", () => {
    expect(shouldGreet({ ...calm, saleInProgress: true })).toBe(false);
  });

  it("jamais deux fois le même jour, jamais sans l'île, jamais avant le premier signe de vie", () => {
    expect(shouldGreet({ ...calm, greetedToday: true })).toBe(false);
    expect(shouldGreet({ ...calm, islandReady: false })).toBe(false);
    expect(shouldGreet({ ...calm, heartbeatOk: false })).toBe(false);
  });

  it("seulement dans la fenêtre du démarrage (deux heures)", () => {
    expect(shouldGreet({ ...calm, sinceStartMs: GREETING_STARTUP_WINDOW_MS })).toBe(true);
    expect(shouldGreet({ ...calm, sinceStartMs: GREETING_STARTUP_WINDOW_MS + 1 })).toBe(false);
  });
});

type FakeHost = HostProcess & { written: string[]; stdout: EventEmitter; stderr: EventEmitter };

function fakeHost(): FakeHost {
  const emitter = new EventEmitter();
  const stdin = new EventEmitter() as EventEmitter & { write(chunk: string): boolean };
  const written: string[] = [];
  stdin.write = (chunk: string) => { written.push(chunk); return true; };
  const host = { stdin, stdout: new EventEmitter(), stderr: new EventEmitter(), written, on: (event: string, listener: (...args: unknown[]) => void) => { emitter.on(event, listener); return host; }, kill: () => emitter.emit("exit") };
  return host as unknown as FakeHost;
}

describe("le bonjour part vers l'île, et seulement vers elle", () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "pb-bonjour-ile-")); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const island = (hosts: FakeHost[]) =>
    new NoticeCenter({ configDir: dir, serverUrl: "https://pharmaboost.app", log: () => undefined, legacyShow: () => { throw new Error("jamais de notification Windows pour un bonjour"); }, platform: "win32", prepareIsland: async () => ({ sdkDir: "C:\\k", loaderDir: "C:\\k\\x64" }), spawnHost: () => { const host = fakeHost(); hosts.push(host); return host; } });

  it("attend que l'île soit prête (« PRET »), puis lui envoie une ligne en ASCII que l'île relit avec ses accents", async () => {
    const hosts: FakeHost[] = [];
    const notices = island(hosts);
    notices.warmUp();
    expect(notices.greet(WITH_NAME)).toBe(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(hosts).toHaveLength(1);
    expect(notices.greet(WITH_NAME)).toBe(false);
    hosts[0].stdout.emit("data", "PRET\n");
    expect(notices.canGreet()).toBe(true);
    expect(notices.greet(WITH_NAME)).toBe(true);
    const line = hosts[0].written.at(-1)!;
    expect(line).toBe(encodeCommand({ op: "greet", text: WITH_NAME }));
    // Sur le tuyau : uniquement de l'ASCII (la console Windows lit en 850/437), « é » voyage en \u00e9.
    expect(/^[\x00-\x7f]*$/.test(line)).toBe(true);
    expect(line).toContain("L\\u00e9a");
    expect(line).toContain("N'h\\u00e9site pas \\u00e0 me demander");
    // L'île (JSON.parse, comme PostWebMessageAsString → parseCommand) relit le texte exact.
    expect(JSON.parse(line)).toEqual({ op: "greet", text: WITH_NAME });
  });

  it("ni la bannière GDI+, ni l'ancienne fenêtre, ni la notification Windows ne le montrent", () => {
    const hosts: FakeHost[] = [];
    const legacy: unknown[] = [];
    const banner = new NoticeCenter({ configDir: dir, log: () => undefined, legacyShow: (c) => legacy.push(c), platform: "win32", spawnHost: () => { const host = fakeHost(); hosts.push(host); return host; } });
    banner.warmUp();
    hosts[0].stdout.emit("data", "PRET\n");
    expect(banner.canGreet()).toBe(false);
    expect(banner.greet(WITHOUT_NAME)).toBe(false);
    expect(hosts[0].written.map((l) => JSON.parse(l).op)).not.toContain("greet");
    const toast = new NoticeCenter({ configDir: dir, log: () => undefined, legacyShow: (c) => legacy.push(c), platform: "win32", serverUrl: "https://pharmaboost.app", prepareIsland: async () => ({ sdkDir: "C:\\k", loaderDir: "C:\\k\\x64" }) });
    toast.configure({ legacy: true });
    expect(toast.greet(WITHOUT_NAME)).toBe(false);
    expect(legacy).toEqual([]);
    // Hors Windows : rien.
    expect(new NoticeCenter({ configDir: dir, log: () => undefined, legacyShow: () => undefined, platform: "darwin" }).greet(WITHOUT_NAME)).toBe(false);
  });
});
