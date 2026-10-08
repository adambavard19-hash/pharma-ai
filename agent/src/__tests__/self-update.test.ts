import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QUIET_AFTER_SCAN_MS, canUpdateNow, isInstalledAgent, isTrustedServer, selfUpdate } from "../self-update";

/**
 * L'agent se met à jour lui-même, au même protocole que l'icône : empreinte vérifiée, ancien fichier gardé, marqueur écrit.
 * Aucun essai ne touche au réseau : le serveur est simulé.
 */

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const OLD = "// ancien agent\n";
const NEW = "// nouvel agent 0.6.1\n";

describe("un poste ne télécharge du code que d'un serveur sûr", () => {
  it("https, ou le poste de développement ; jamais un serveur en clair, ni une adresse illisible", () => {
    expect(isTrustedServer("https://pharmaboost.app")).toBe(true);
    expect(isTrustedServer("http://localhost:3000")).toBe(true);
    expect(isTrustedServer("http://127.0.0.1:3000")).toBe(true);
    expect(isTrustedServer("http://pharmaboost.app")).toBe(false);
    expect(isTrustedServer("http://192.168.0.2:3000")).toBe(false);
    expect(isTrustedServer("ftp://pharmaboost.app")).toBe(false);
    expect(isTrustedServer("pas une adresse")).toBe(false);
  });
});

describe("l'agent de l'installation de poste, et lui seul, se remplace", () => {
  const config = "C:\\Users\\p5\\AppData\\Local\\PharmaBoost\\Poste\\pharmaboost-connect.json";
  it("à côté de sa configuration, sous Windows", () => {
    expect(isInstalledAgent("C:\\Users\\p5\\AppData\\Local\\PharmaBoost\\Poste\\pharmaboost-connect.js", config, "win32")).toBe(true);
    expect(isInstalledAgent("c:\\users\\p5\\appdata\\local\\pharmaboost\\poste\\PharmaBoost-Connect.js", config, "win32")).toBe(true);
  });
  it("jamais un agent lancé à la main, ailleurs, ou hors Windows (développement)", () => {
    expect(isInstalledAgent("C:\\Dev\\pharma-ai\\agent\\dist\\pharmaboost-connect.js", config, "win32")).toBe(false);
    expect(isInstalledAgent("C:\\Users\\p5\\AppData\\Local\\PharmaBoost\\Poste\\autre.js", config, "win32")).toBe(false);
    expect(isInstalledAgent("/Users/adam/pharma-ai/agent/dist/pharmaboost-connect.js", "/Users/adam/pharma-ai/agent/dist/pharmaboost-connect.json", "darwin")).toBe(false);
    expect(isInstalledAgent(undefined, config, "win32")).toBe(false);
  });
});

describe("on ne redémarre jamais en pleine vente", () => {
  const calm = { watching: false, queuedScans: 0, lastScanAt: null as number | null, pendingNotices: 0, now: 1_000_000 };
  it("redémarre quand tout est calme", () => {
    expect(canUpdateNow(calm)).toBe(true);
    expect(canUpdateNow({ ...calm, lastScanAt: calm.now - QUIET_AFTER_SCAN_MS })).toBe(true);
  });
  it("attend quand une vente est suivie, qu'un bip est en file, qu'un conseil attend, ou qu'un bip vient d'arriver", () => {
    expect(canUpdateNow({ ...calm, watching: true })).toBe(false);
    expect(canUpdateNow({ ...calm, queuedScans: 1 })).toBe(false);
    expect(canUpdateNow({ ...calm, pendingNotices: 1 })).toBe(false);
    expect(canUpdateNow({ ...calm, lastScanAt: calm.now - QUIET_AFTER_SCAN_MS + 1 })).toBe(false);
  });
});

describe("la mise à jour elle-même", () => {
  let dir: string;
  let agent: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pb-maj-"));
    agent = join(dir, "pharmaboost-connect.js");
    writeFileSync(agent, OLD);
  });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const server = (over: { version?: unknown; file?: string; announced?: string; fileStatus?: number } = {}) =>
    vi.fn(async (url: string | URL | Request) => {
      const text = String(url);
      if (text.endsWith("/api/agent/version")) return new Response(JSON.stringify({ version: over.version ?? "0.6.1", sha256: over.announced ?? sha(over.file ?? NEW), size: 10 }), { status: 200 });
      return new Response(over.file ?? NEW, { status: over.fileStatus ?? 200 });
    }) as unknown as typeof fetch;

  it("remplace l'agent, garde l'ancien à côté, écrit le marqueur — comme l'icône", async () => {
    const result = await selfUpdate({ serverUrl: "https://pharmaboost.app/", agentPath: agent, fetchImpl: server() });
    expect(result).toMatchObject({ status: "updated", sha: sha(NEW) });
    expect(readFileSync(agent, "utf8")).toBe(NEW);
    expect(readFileSync(`${agent}.previous`, "utf8")).toBe(OLD);
    expect(readFileSync(join(dir, "pharmaboost-maj.txt"), "utf8")).toBe(sha(NEW));
    expect(existsSync(`${agent}.new`)).toBe(false);
  });

  it("ne fait rien quand l'agent est déjà à jour", async () => {
    writeFileSync(agent, NEW);
    const fetchImpl = server();
    expect(await selfUpdate({ serverUrl: "https://pharmaboost.app", agentPath: agent, fetchImpl })).toMatchObject({ status: "uptodate" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(existsSync(`${agent}.previous`)).toBe(false);
  });

  it("refuse un fichier dont l'empreinte n'est pas celle annoncée : l'agent reste intact", async () => {
    const result = await selfUpdate({ serverUrl: "https://pharmaboost.app", agentPath: agent, fetchImpl: server({ announced: sha("autre chose") }) });
    expect(result.status).toBe("failed");
    expect(result.detail).toContain("empreinte");
    expect(readFileSync(agent, "utf8")).toBe(OLD);
    expect(existsSync(`${agent}.previous`)).toBe(false);
    expect(existsSync(join(dir, "pharmaboost-maj.txt"))).toBe(false);
  });

  it("ne réinstalle pas une version que l'icône a refusée parce qu'elle ne tenait pas", async () => {
    writeFileSync(join(dir, "pharmaboost-refusee.txt"), `${sha(NEW)}\n`);
    const fetchImpl = server();
    const result = await selfUpdate({ serverUrl: "https://pharmaboost.app", agentPath: agent, fetchImpl });
    expect(result.status).toBe("skipped");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(readFileSync(agent, "utf8")).toBe(OLD);
  });

  it("ignore une annonce illisible, un téléchargement refusé, un fichier vide ou démesuré, un serveur en clair, un agent absent", async () => {
    expect((await selfUpdate({ serverUrl: "https://pharmaboost.app", agentPath: agent, fetchImpl: server({ announced: "pas-une-empreinte" }) })).status).toBe("skipped");
    expect((await selfUpdate({ serverUrl: "https://pharmaboost.app", agentPath: agent, fetchImpl: server({ fileStatus: 503 }) })).status).toBe("failed");
    expect((await selfUpdate({ serverUrl: "https://pharmaboost.app", agentPath: agent, fetchImpl: server({ file: "", announced: sha("") }) })).status).toBe("failed");
    expect((await selfUpdate({ serverUrl: "https://pharmaboost.app", agentPath: agent, fetchImpl: server({ file: "x".repeat(3_000_001) }) })).status).toBe("failed");
    expect((await selfUpdate({ serverUrl: "http://pharmaboost.app", agentPath: agent, fetchImpl: server() })).status).toBe("skipped");
    expect((await selfUpdate({ serverUrl: "https://pharmaboost.app", agentPath: join(dir, "absent.js"), fetchImpl: server() })).status).toBe("skipped");
    expect(readFileSync(agent, "utf8")).toBe(OLD);
  });

  it("une coupure réseau n'est jamais une erreur pour l'agent : il continue", async () => {
    const offline = vi.fn(async () => { throw new Error("hors ligne"); }) as unknown as typeof fetch;
    expect(await selfUpdate({ serverUrl: "https://pharmaboost.app", agentPath: agent, fetchImpl: offline })).toEqual({ status: "failed", detail: "hors ligne" });
    expect(readFileSync(agent, "utf8")).toBe(OLD);
  });
});
