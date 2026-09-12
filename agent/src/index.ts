/**
 * PharmaBoost Connect — l'agent installé sur le serveur de l'officine.
 *
 * Il ne fait que trois choses, et les dit :
 *   1. lire l'export de stock que le logiciel de gestion (LGO) écrit dans un
 *      dossier, et l'envoyer à PharmaBoost dès qu'il change ;
 *   2. surveiller, si on le lui indique, le dossier où le LGO range les
 *      ordonnances scannées, et envoyer chaque nouveau scan ;
 *   3. donner signe de vie toutes les minutes.
 *
 * Aucune dépendance : Node.js seul. Aucune écriture dans le LGO. Rien n'est
 * envoyé d'autre que le fichier d'export et les scans.
 *
 *   node pharmaboost-connect.js --appairer 123456 --serveur https://pharmaboost.app --lgo lgpi \
 *        --export "C:\\LGPI\\Exports" --scans "C:\\LGPI\\Scans"
 *   node pharmaboost-connect.js            (tourne avec la configuration enregistrée)
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { hostname } from "node:os";
import { basename, dirname, extname, join } from "node:path";

const VERSION = "0.1.0";
const CONFIG_PATH = process.env.PHARMABOOST_CONNECT_CONFIG ?? join(process.cwd(), "pharmaboost-connect.json");

type Config = {
  serverUrl: string;
  agentKey: string;
  lgo: string;
  exportPath: string | null;
  scansPath: string | null;
  intervalSeconds: number;
  /** Empreinte du dernier export envoyé, pour ne pas renvoyer l'identique. */
  lastExportHash?: string;
  /** Scans déjà envoyés (nom + taille), pour ne jamais envoyer deux fois. */
  sentScans?: string[];
};

function log(message: string): void {
  console.log(`${new Date().toISOString()} ${message}`);
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function readConfig(): Config | null {
  if (!existsSync(CONFIG_PATH)) return null;
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Config;
}

function writeConfig(config: Config): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

async function api(config: Pick<Config, "serverUrl" | "agentKey">, path: string, init: RequestInit): Promise<Response> {
  return fetch(`${config.serverUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.agentKey}`, "X-Agent-Version": VERSION, ...(init.headers ?? {}) },
  });
}

/** L'appairage : le code à six chiffres donné par PharmaBoost devient une clé, une seule fois. */
async function pair(): Promise<void> {
  const code = arg("appairer");
  const serverUrl = arg("serveur") ?? "https://pharmaboost.app";
  const lgo = arg("lgo") ?? "autre";
  const response = await fetch(`${serverUrl.replace(/\/$/, "")}/api/agent/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, lgo, hostname: hostname(), version: VERSION, exportPath: arg("export") ?? null, scansPath: arg("scans") ?? null }),
  });
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; agentKey?: string; intervalSeconds?: number; pharmacyName?: string };
  if (!response.ok || !body.ok || !body.agentKey) throw new Error(body.error ?? `Appairage refusé (HTTP ${response.status}).`);
  writeConfig({ serverUrl, agentKey: body.agentKey, lgo, exportPath: arg("export") ?? null, scansPath: arg("scans") ?? null, intervalSeconds: body.intervalSeconds ?? 300 });
  log(`Appairé avec ${body.pharmacyName ?? "l'officine"}. Configuration écrite dans ${CONFIG_PATH}.`);
}

/** Le fichier d'export le plus récent du dossier (CSV, TXT ou Excel). */
function latestExport(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const st = statSync(dir);
  if (st.isFile()) return dir;
  const files = readdirSync(dir)
    .filter((name) => /\.(csv|txt|xlsx|xls)$/i.test(name))
    .map((name) => ({ path: join(dir, name), mtime: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files[0]?.path ?? null;
}

async function syncStock(config: Config): Promise<Config> {
  if (!config.exportPath) return config;
  const file = latestExport(config.exportPath);
  if (!file) {
    log(`Aucun export trouvé dans ${config.exportPath}.`);
    return config;
  }
  const bytes = readFileSync(file);
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash === config.lastExportHash) return config;

  const form = new FormData();
  form.set("file", new Blob([bytes]), basename(file));
  const response = await api(config, "/api/agent/stock", { method: "POST", body: form });
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; lines?: number; created?: number; updated?: number };
  if (!response.ok || !body.ok) {
    log(`Synchronisation refusée : ${body.error ?? `HTTP ${response.status}`}`);
    return config;
  }
  log(`Stock synchronisé : ${body.lines ?? "?"} ligne(s), ${body.created ?? 0} créée(s), ${body.updated ?? 0} mise(s) à jour (${basename(file)}).`);
  return { ...config, lastExportHash: hash };
}

async function syncScans(config: Config): Promise<Config> {
  if (!config.scansPath || !existsSync(config.scansPath)) return config;
  const sent = new Set(config.sentScans ?? []);
  const files = readdirSync(config.scansPath)
    .filter((name) => /\.(pdf|jpe?g|png|webp)$/i.test(name))
    .map((name) => ({ path: join(config.scansPath as string, name), stat: statSync(join(config.scansPath as string, name)) }))
    // Un scan qui vient d'être écrit peut être encore en cours : on attend qu'il ait dix secondes.
    .filter(({ stat }) => Date.now() - stat.mtimeMs > 10_000)
    .sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);
  let next = config;
  for (const { path, stat } of files) {
    const key = `${basename(path)}:${stat.size}`;
    if (sent.has(key)) continue;
    const mime = { ".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" }[extname(path).toLowerCase()] ?? "application/octet-stream";
    const form = new FormData();
    form.set("file", new Blob([readFileSync(path)], { type: mime }), basename(path));
    const response = await api(config, "/api/agent/prescriptions", { method: "POST", body: form });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; reference?: string; lines?: number };
    if (!response.ok || !body.ok) {
      log(`Scan refusé (${basename(path)}) : ${body.error ?? `HTTP ${response.status}`}`);
      continue;
    }
    sent.add(key);
    next = { ...next, sentScans: [...sent].slice(-2000) };
    writeConfig(next);
    log(`Ordonnance envoyée : ${basename(path)} → ${body.reference ?? "?"} (${body.lines ?? 0} ligne(s) lue(s)).`);
  }
  return next;
}

async function heartbeat(config: Config): Promise<Config> {
  const response = await api(config, "/api/agent/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: VERSION, hostname: hostname(), exportPath: config.exportPath, scansPath: config.scansPath }),
  });
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; intervalSeconds?: number; exportPath?: string | null; scansPath?: string | null };
  if (!response.ok || !body.ok) {
    log(`Signe de vie refusé (HTTP ${response.status}) : la clé est-elle révoquée ?`);
    return config;
  }
  // Les réglages peuvent être modifiés depuis PharmaBoost ; l'agent les suit.
  const updated: Config = {
    ...config,
    intervalSeconds: body.intervalSeconds ?? config.intervalSeconds,
    exportPath: body.exportPath ?? config.exportPath,
    scansPath: body.scansPath ?? config.scansPath,
  };
  if (JSON.stringify(updated) !== JSON.stringify(config)) writeConfig(updated);
  return updated;
}

async function run(): Promise<void> {
  let config = readConfig();
  if (!config) throw new Error(`Aucune configuration (${CONFIG_PATH}). Lancez d'abord : --appairer CODE --serveur URL --lgo LGO --export DOSSIER`);
  log(`PharmaBoost Connect ${VERSION} — ${config.lgo} — export : ${config.exportPath ?? "non configuré"} — scans : ${config.scansPath ?? "non configurés"}`);
  let lastHeartbeat = 0;
  let lastStock = 0;
  for (;;) {
    try {
      if (Date.now() - lastHeartbeat > 60_000) {
        config = await heartbeat(config);
        lastHeartbeat = Date.now();
      }
      if (Date.now() - lastStock > config.intervalSeconds * 1000) {
        const before = config.lastExportHash;
        config = await syncStock(config);
        if (config.lastExportHash !== before) writeConfig(config);
        lastStock = Date.now();
      }
      config = await syncScans(config);
    } catch (error) {
      log(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

if (arg("appairer")) {
  pair().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
} else if (process.argv.includes("--version")) {
  console.log(VERSION);
} else {
  run().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
