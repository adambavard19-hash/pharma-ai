/**
 * PharmaBoost Connect — l'agent installé sur le serveur de l'officine.
 *
 * Il ne fait que trois choses, et les dit :
 *   1. lire l'export de stock que le logiciel de gestion (LGO) écrit dans un
 *      dossier (CSV, Excel ou PDF d'inventaire), et l'envoyer à PharmaBoost dès
 *      qu'il change ;
 *   2. surveiller, si on le lui indique, le dossier où le LGO range les
 *      ordonnances scannées, et envoyer chaque nouveau scan ;
 *   3. donner signe de vie toutes les minutes, avec ce qu'il constate — un
 *      dossier vide, un export refusé — pour que PharmaBoost l'affiche au
 *      titulaire sans qu'on ait à ouvrir le serveur.
 *
 * Aucune dépendance : Node.js seul. Aucune écriture dans le LGO. Rien n'est
 * envoyé d'autre que le fichier d'export et les scans.
 *
 *   node pharmaboost-connect.js --appairer 123456 --serveur https://pharmaboost.app --lgo lgpi \
 *        --export "C:\\PharmaBoost\\Export" --scans "C:\\PharmaBoost\\Ordonnances"
 *   node pharmaboost-connect.js            (tourne avec la configuration enregistrée)
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { hostname } from "node:os";
import { basename, dirname, extname, join } from "node:path";

const VERSION = "0.2.0";
const CONFIG_PATH = process.env.PHARMABOOST_CONNECT_CONFIG ?? join(process.cwd(), "pharmaboost-connect.json");
const LOG_PATH = join(dirname(CONFIG_PATH), "pharmaboost-connect.log");
const LOG_MAX_BYTES = 2 * 1024 * 1024;
/** Un fichier modifié il y a moins de dix secondes peut être encore en cours d'écriture. */
const SETTLE_MS = 10_000;
/** Le dossier d'export est regardé toutes les trente secondes : un nouvel export part dans la minute. */
const CHECK_MS = 30_000;

/** Dossiers proposés quand rien n'est indiqué : les mêmes que ceux de l'installateur. */
const DEFAULT_EXPORT = process.platform === "win32" ? "C:\\PharmaBoost\\Export" : join(process.cwd(), "export");
const DEFAULT_SCANS = process.platform === "win32" ? "C:\\PharmaBoost\\Ordonnances" : null;

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

/** Ce que l'agent constate et que PharmaBoost doit montrer ; vide quand tout va bien. */
let notice: string | null = null;

function log(message: string): void {
  const line = `${new Date().toISOString()} ${message}`;
  console.log(line);
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    if (existsSync(LOG_PATH) && statSync(LOG_PATH).size > LOG_MAX_BYTES) renameSync(LOG_PATH, `${LOG_PATH}.1`);
    appendFileSync(LOG_PATH, `${line}\n`);
  } catch {
    // Le journal est une commodité : sans lui, l'agent continue.
  }
}

function setNotice(value: string | null): void {
  if (value !== notice) log(value ? `À signaler : ${value}` : "Plus rien à signaler.");
  notice = value;
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
  const exportPath = arg("export") ?? DEFAULT_EXPORT;
  const scansPath = arg("scans") ?? DEFAULT_SCANS;
  for (const dir of [exportPath, scansPath]) {
    if (dir) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch {
        // Un dossier impossible à créer sera signalé à la première synchronisation.
      }
    }
  }
  const response = await fetch(`${serverUrl.replace(/\/$/, "")}/api/agent/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, lgo, hostname: hostname(), version: VERSION, exportPath, scansPath }),
  });
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; agentKey?: string; intervalSeconds?: number; pharmacyName?: string };
  if (!response.ok || !body.ok || !body.agentKey) throw new Error(body.error ?? `Appairage refusé (HTTP ${response.status}).`);
  writeConfig({ serverUrl, agentKey: body.agentKey, lgo, exportPath, scansPath, intervalSeconds: body.intervalSeconds ?? 300 });
  log(`Appairé avec ${body.pharmacyName ?? "l'officine"}. Configuration écrite dans ${CONFIG_PATH}. Export surveillé : ${exportPath}${scansPath ? ` — scans : ${scansPath}` : ""}.`);
}

type ExportFile = { path: string; mtime: number; size: number };

/** Le fichier d'export le plus récent du dossier (CSV, TXT, Excel ou PDF). */
function latestExport(dir: string): ExportFile | null {
  if (!existsSync(dir)) return null;
  const st = statSync(dir);
  if (st.isFile()) return { path: dir, mtime: st.mtimeMs, size: st.size };
  const files = readdirSync(dir)
    .filter((name) => /\.(csv|txt|xlsx|xls|pdf)$/i.test(name) && !name.startsWith("~$"))
    .map((name) => {
      const s = statSync(join(dir, name));
      return { path: join(dir, name), mtime: s.mtimeMs, size: s.size };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return files[0] ?? null;
}

/** Ce qui distingue un export d'un autre sans le lire : chemin, date, taille. */
let lastStamp: string | null = null;

async function syncStock(config: Config, force: boolean): Promise<Config> {
  if (!config.exportPath) return config;
  if (!existsSync(config.exportPath)) {
    setNotice(`Le dossier d'export ${config.exportPath} n'existe pas sur ${hostname()}.`);
    return config;
  }
  const file = latestExport(config.exportPath);
  if (!file) {
    setNotice(`Aucun export dans ${config.exportPath}. Enregistrez-y l'édition de stock de votre logiciel.`);
    return config;
  }
  if (Date.now() - file.mtime < SETTLE_MS) return config;
  const stamp = `${file.path}:${file.mtime}:${file.size}`;
  if (!force && stamp === lastStamp) return config;
  lastStamp = stamp;

  const bytes = readFileSync(file.path);
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash === config.lastExportHash) {
    if (notice?.startsWith("Aucun export") || notice?.startsWith("Le dossier")) setNotice(null);
    return config;
  }

  const form = new FormData();
  form.set("file", new Blob([bytes]), basename(file.path));
  const response = await api(config, "/api/agent/stock", { method: "POST", body: form });
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; lines?: number; created?: number; updated?: number };
  if (!response.ok || !body.ok) {
    setNotice(`Export refusé (${basename(file.path)}) : ${body.error ?? `HTTP ${response.status}`}`);
    return config;
  }
  setNotice(null);
  log(`Stock synchronisé : ${body.lines ?? "?"} ligne(s), ${body.created ?? 0} créée(s), ${body.updated ?? 0} mise(s) à jour (${basename(file.path)}).`);
  return { ...config, lastExportHash: hash };
}

async function syncScans(config: Config): Promise<Config> {
  if (!config.scansPath || !existsSync(config.scansPath)) return config;
  const sent = new Set(config.sentScans ?? []);
  const files = readdirSync(config.scansPath)
    .filter((name) => /\.(pdf|jpe?g|png|webp)$/i.test(name))
    .map((name) => ({ path: join(config.scansPath as string, name), stat: statSync(join(config.scansPath as string, name)) }))
    // Un scan qui vient d'être écrit peut être encore en cours : on attend qu'il ait dix secondes.
    .filter(({ stat }) => Date.now() - stat.mtimeMs > SETTLE_MS)
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
    body: JSON.stringify({ version: VERSION, hostname: hostname(), exportPath: config.exportPath, scansPath: config.scansPath, notice }),
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
  log(`PharmaBoost Connect ${VERSION} — ${config.lgo} — export : ${config.exportPath ?? "non configuré"} — scans : ${config.scansPath ?? "non configurés"} — journal : ${LOG_PATH}`);
  let lastHeartbeat = 0;
  let lastCheck = 0;
  let lastFullCheck = 0;
  for (;;) {
    try {
      if (Date.now() - lastCheck > CHECK_MS) {
        const force = Date.now() - lastFullCheck > config.intervalSeconds * 1000;
        const before = config.lastExportHash;
        config = await syncStock(config, force);
        if (config.lastExportHash !== before) writeConfig(config);
        lastCheck = Date.now();
        if (force) lastFullCheck = Date.now();
      }
      if (Date.now() - lastHeartbeat > 60_000) {
        config = await heartbeat(config);
        lastHeartbeat = Date.now();
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
