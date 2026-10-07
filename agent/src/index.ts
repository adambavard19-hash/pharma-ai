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
 *
 * Sur un POSTE DE CAISSE (mode « poste ») : il écoute la douchette et envoie
 * chaque code-barres de boîte au comptoir PharmaBoost, sans rien changer au
 * LGO. Voir douchette.ts.
 *   node pharmaboost-connect.js --poste 123456 --serveur https://pharmaboost.app
 *   node pharmaboost-connect.js --test-douchette   (affiche les bips, n'envoie rien)
 *
 * Installé par PharmaBoost-Installation-<jeton>.exe (double-clic, sans terminal),
 * l'installateur relie le poste avec le jeton du nom de fichier :
 *   node pharmaboost-connect.js --installer "PharmaBoost-Installation-<jeton>.exe"
 */
import { createHash } from "node:crypto";
import { startDouchette } from "./douchette";
import { showToast } from "./toast";
import { createScanQueue } from "./scan-queue";
import { INSTALLER_EXIT, resolveInstallCode } from "./installer";
import { stateForFailure, writeStatus, type PostState } from "./status";
import { CrossSourceDedupe, compileRobotPattern, dryRunRobotFile, startRobotJournal, type RobotConfig } from "./robot";
import { appendFileSync, existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { hostname } from "node:os";
import { basename, dirname, extname, join } from "node:path";

const VERSION = "0.5.1";
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
  /** « serveur » (export de stock, scans) ou « poste » (douchette de caisse). */
  role?: "serveur" | "poste";
  lgo: string;
  exportPath: string | null;
  scansPath: string | null;
  intervalSeconds: number;
  /** Empreinte du dernier export envoyé, pour ne pas renvoyer l'identique. */
  lastExportHash?: string;
  /** Scans déjà envoyés (nom + taille), pour ne jamais envoyer deux fois. */
  sentScans?: string[];
  /** Pour l'icône près de l'horloge : l'officine et le nom du poste, tels que PharmaBoost les connaît. */
  pharmacyName?: string;
  postLabel?: string;
  /** Un robot de dispensation à écouter, une fois observé chez cette officine (voir robot.ts). Absent : rien n'est lu. */
  robot?: RobotConfig;
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

/**
 * L'appairage d'un POSTE DE CAISSE : le code à six chiffres donné par
 * PharmaBoost (Stock → Connecter mon logiciel → Postes de caisse) devient la
 * clé de ce poste, une seule fois. Le poste n'envoie que les bips de la
 * douchette et un signe de vie par minute.
 */
async function pairPost(): Promise<void> {
  const paired = await requestPostPairing(arg("poste") ?? "", arg("serveur") ?? "https://pharmaboost.app", arg("lgo") ?? "lgpi");
  log(`Poste ${paired.postLabel || hostname()} relié à ${paired.pharmacyName || "l'officine"}. Configuration écrite dans ${CONFIG_PATH}.`);
}

/** Le serveur a répondu non (code expiré ou inconnu) ou n'a pas pu être joint : l'installateur Windows ne dit pas la même chose dans les deux cas. */
class PairingError extends Error {
  constructor(message: string, readonly kind: "refused" | "unreachable") {
    super(message);
    this.name = "PairingError";
  }
}

async function requestPostPairing(code: string, serverUrl: string, lgo: string): Promise<{ pharmacyName: string; postLabel: string }> {
  let response: Response;
  try {
    response = await fetch(`${serverUrl.replace(/\/$/, "")}/api/agent/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, role: "poste", hostname: hostname(), version: VERSION }),
    });
  } catch (error) {
    throw new PairingError(`PharmaBoost est injoignable (${error instanceof Error ? error.message : String(error)}).`, "unreachable");
  }
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; agentKey?: string; pharmacyName?: string; postLabel?: string };
  if (!response.ok || !body.ok || !body.agentKey) {
    throw new PairingError(body.error ?? `Appairage refusé (HTTP ${response.status}).`, response.status >= 500 ? "unreachable" : "refused");
  }
  const pharmacyName = body.pharmacyName ?? "";
  const postLabel = body.postLabel ?? "";
  writeConfig({ serverUrl, agentKey: body.agentKey, role: "poste", lgo, exportPath: null, scansPath: null, intervalSeconds: 300, pharmacyName, postLabel });
  return { pharmacyName, postLabel };
}

/**
 * Le dernier geste de l'installateur Windows (PharmaBoost-Installation-<jeton>.exe) :
 * relier ce poste. Le jeton vient du nom du fichier téléchargé, ou d'un code
 * saisi (`--code`) quand le fichier a été renommé. Le résultat est un code de
 * sortie (voir installer.ts) : l'installateur écrit lui-même le message.
 */
async function installFromInstaller(): Promise<number> {
  const code = resolveInstallCode({ fileName: arg("installer"), typed: arg("code") });
  if (!code) {
    log("Installation : aucun code d'installation dans le nom du fichier, et aucun code saisi.");
    return INSTALLER_EXIT.noCode;
  }
  try {
    const paired = await requestPostPairing(code, arg("serveur") ?? "https://pharmaboost.app", arg("lgo") ?? "lgpi");
    log(`Installation : poste ${paired.postLabel || hostname()} relié à ${paired.pharmacyName || "l'officine"}.`);
    return INSTALLER_EXIT.ok;
  } catch (error) {
    log(`Installation : ${error instanceof Error ? error.message : String(error)}`);
    return error instanceof PairingError && error.kind === "unreachable" ? INSTALLER_EXIT.unreachable : INSTALLER_EXIT.refused;
  }
}

async function sendScan(config: Config, code: string, scannedAt: string): Promise<void> {
  const response = await api(config, "/api/agent/scans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, post: hostname(), scannedAt }),
  });
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; drugName?: string; reference?: string; lineCount?: number; prescriptionId?: string };
  if (response.status === 401) throw new Error("clé du poste révoquée");
  if (response.status === 422) {
    log(`Bip ignoré (${code}) : ${body.error ?? "code inconnu"}`);
    return;
  }
  if (!response.ok || !body.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  log(`Bip ${code} → ${body.drugName ?? "?"} (${body.reference ?? "?"}, ${body.lineCount ?? "?"} ligne(s)).`);
  if (body.prescriptionId) watchPrescription(body.prescriptionId);
}

/** Combien de temps l'avis reste en coin d'écran. */
const TOAST_SECONDS = 15;
/** Après un bip, on attend l'analyse jusqu'à deux minutes ; au-delà, elle est à lire dans PharmaBoost. */
const WATCH_MS = 120_000;

/** La vente que ce poste vient d'ouvrir ou de compléter, dont on attend l'avis. */
let watched: { prescriptionId: string; since: number; shownSignature: string | null } | null = null;

function watchPrescription(prescriptionId: string): void {
  watched = { prescriptionId, since: Date.now(), shownSignature: watched?.prescriptionId === prescriptionId ? watched.shownSignature : null };
}

/**
 * L'avis de comptoir : dès que l'analyse de la vente bipée est prête, il
 * s'affiche en coin d'écran, par-dessus le LGO. Une fois par état : une boîte
 * de plus change l'empreinte, l'avis se réaffiche ; sinon il se tait.
 */
async function pollNotice(config: Config): Promise<void> {
  if (!watched) return;
  if (Date.now() - watched.since > WATCH_MS) { watched = null; return; }
  const response = await api(config, `/api/agent/conseil?prescription=${encodeURIComponent(watched.prescriptionId)}`, { method: "GET" });
  if (response.status === 404) { watched = null; return; }
  if (!response.ok) return;
  const body = (await response.json()) as { ok: boolean; state: "PENDING" | "READY" | "CLOSED"; title: string; subject: string; alerts: string[]; advice: string[]; signature: string };
  if (!body.ok) return;
  if (body.state === "CLOSED") { watched = null; return; }
  if (body.state !== "READY" || body.signature === watched.shownSignature) return;
  watched.shownSignature = body.signature;
  const url = `${config.serverUrl.replace(/\/$/, "")}/vente/${watched.prescriptionId}`;
  showToast(dirname(CONFIG_PATH), { title: body.title, subject: body.subject, alerts: body.alerts, advice: body.advice, url, seconds: TOAST_SECONDS }, log);
  log(`Avis affiché : ${body.subject} — ${body.alerts.length} alerte(s), ${body.advice.length} conseil(s).`);
}

/**
 * Le signe de vie du poste rapporte aussi ses réglages : le dossier d'export
 * du stock que PharmaBoost lui a confié, et une éventuelle demande de mise à
 * jour immédiate (« Mettre à jour maintenant » dans PharmaBoost).
 */
async function postHeartbeat(config: Config): Promise<{ exportPath: string | null; syncRequestedAt: string | null }> {
  const response = await api(config, "/api/agent/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version: VERSION, hostname: hostname(), notice }),
  });
  if (response.status === 401) throw new Error("clé du poste révoquée");
  // Un serveur en panne (502, 503) n'est pas un signe de vie : l'icône du poste doit dire « hors ligne », pas « relié ».
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = (await response.json().catch(() => ({}))) as { exportPath?: string | null; syncRequestedAt?: string | null };
  return { exportPath: body.exportPath ?? null, syncRequestedAt: body.syncRequestedAt ?? null };
}

/** Le poste de caisse : écouter la douchette, envoyer chaque bip, donner signe de vie, et relire l'export de stock si on le lui a confié. */
async function runPost(config: Config): Promise<void> {
  log(`PharmaBoost Connect ${VERSION} — poste de caisse ${hostname()} — journal : ${LOG_PATH}`);
  // Les bips en file, vidangés un par un et dans l'ordre. Ceux qui n'ont pas pu
  // partir (coupure Internet) attendent en tête et repartent au tour suivant.
  // La vidange est monofil (voir scan-queue.ts) : un bip lu pendant un envoi en
  // vol, ou un tour de la boucle qui tombe pendant l'envoi, ne renvoie jamais la
  // même boîte deux fois — le serveur compterait « 2 × » et baisserait le stock
  // deux fois. `config` est relue à chaque envoi : le poste la met à jour.
  const scans = createScanQueue((scan) => sendScan(config, scan.code, scan.scannedAt));
  // Douchette et robot annoncent parfois la même boîte : elle ne compte qu'une fois (voir robot.ts).
  const dedupe = new CrossSourceDedupe();
  const accept = (source: "douchette" | "robot") => (code: string, at: number) => {
    if (dedupe.isDuplicate(code, source, at)) {
      log(`${source === "robot" ? "Robot" : "Bip"} ${code} ignoré : déjà annoncé à l'instant par ${source === "robot" ? "la douchette" : "le robot"}.`);
      return;
    }
    scans.push({ code, scannedAt: new Date(at).toISOString() });
    scans.flush().catch((error) => log(`Bip en attente : ${error instanceof Error ? error.message : String(error)}`));
  };
  startDouchette(dirname(CONFIG_PATH), { onScan: accept("douchette"), onStatus: (message) => log(message) });
  if (config.robot) startRobotJournal(config.robot, { onScan: accept("robot"), onStatus: (message) => log(message) });
  let lastHeartbeat = 0;
  let lastStockCheck = 0;
  let handledSyncRequest: string | null = null;
  let forceSync = false;
  // L'état que l'icône près de l'horloge affiche : écrit à chaque signe de vie, réussi ou non.
  const reportState = (etat: PostState) =>
    writeStatus(CONFIG_PATH, { etat, at: new Date().toISOString(), version: VERSION, poste: config.postLabel || hostname(), officine: config.pharmacyName ?? null, notice });
  for (;;) {
    try {
      if (scans.size > 0) await scans.flush();
      await pollNotice(config);
      if (Date.now() - lastHeartbeat > 60_000) {
        let settings: Awaited<ReturnType<typeof postHeartbeat>>;
        try {
          settings = await postHeartbeat(config);
        } catch (error) {
          reportState(stateForFailure(error));
          // Nouvel essai dans 15 secondes plutôt qu'à chaque tour de boucle : une coupure ne remplit pas le journal.
          lastHeartbeat = Date.now() - 45_000;
          throw error;
        }
        reportState("ok");
        lastHeartbeat = Date.now();
        if (settings.exportPath !== (config.exportPath ?? null)) {
          config = { ...config, exportPath: settings.exportPath };
          writeConfig(config);
          log(settings.exportPath ? `Export de stock à surveiller : ${settings.exportPath}` : "Ce poste n'envoie plus de stock.");
          lastStockCheck = 0;
        }
        if (settings.syncRequestedAt && settings.syncRequestedAt !== handledSyncRequest) {
          handledSyncRequest = settings.syncRequestedAt;
          forceSync = true;
          lastStockCheck = 0;
        }
      }
      if (config.exportPath && Date.now() - lastStockCheck > CHECK_MS) {
        config = await syncStock(config, forceSync);
        forceSync = false;
        lastStockCheck = Date.now();
      }
    } catch (error) {
      log(`Erreur : ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, watched ? 2000 : 3000));
  }
}

/**
 * Essai du branchement robot, sans rien envoyer ni rien écrire :
 *   --test-robot "<fichier>" --motif "article=(\\d{13})"
 * Lit la fin du fichier et affiche les codes produit que l'expression y trouve.
 */
function testRobot(): void {
  const path = arg("test-robot") ?? "";
  const result = dryRunRobotFile(path, arg("motif") ?? "");
  if (!result.ok) {
    console.log(result.error);
    process.exitCode = 1;
    return;
  }
  console.log(`${result.lines} ligne(s) lue(s), ${result.codes.length} code(s) produit trouvé(s).`);
  for (const code of result.codes.slice(0, 50)) console.log(`  ${code}`);
  if (result.codes.length === 0) console.log("Aucun code : l'expression ne correspond à rien, ou le fichier ne contient pas encore de dispensation.");
}

/** Branche le robot sur ce poste : --robot "<fichier>" --motif "<expression>". Écrit la configuration ; relancer l'icône PharmaBoost ensuite. */
function enableRobot(): void {
  const config = readConfig();
  if (!config || config.role !== "poste") {
    console.log("Ce poste n'est pas encore relié à PharmaBoost.");
    process.exitCode = 1;
    return;
  }
  const path = arg("robot") ?? "";
  const pattern = arg("motif") ?? "";
  const compiled = compileRobotPattern(pattern);
  if (!path || !compiled.ok) {
    console.log(!path ? "Indiquez le fichier à lire." : (compiled as { error: string }).error);
    process.exitCode = 1;
    return;
  }
  writeConfig({ ...config, robot: { kind: "journal", path, pattern } });
  console.log(`Robot branché : ${path}. Quittez PharmaBoost (icône près de l'horloge) puis relancez-le.`);
}

/** Essai de l'affichage : un avis d'exemple en coin d'écran, sans bip ni serveur. */
function testAffichage(): void {
  showToast(dirname(CONFIG_PATH), {
    title: "PharmaBoost · essai d'affichage",
    subject: "DOLIPRANE 1000 mg · AMOXICILLINE 1 g",
    alerts: [],
    advice: ["PROBIOTIQUE 30 gélules · 14,90 € · Protéger la flore pendant l'antibiotique", "Exemple : l'avis réel vient de l'analyse de la vente"],
    url: "https://pharmaboost.app/vente/nouvelle",
    seconds: 15,
  }, (message) => console.log(`  ${message}`));
  console.log("Un avis d'exemple doit apparaître en bas à droite de l'écran, pendant 15 secondes.");
  setTimeout(() => process.exit(0), 20_000);
}

/** Essai sans rien envoyer : chaque bip lu s'affiche à l'écran. Pour vérifier une installation. */
function testDouchette(): void {
  console.log("Passez une boîte à la douchette. Chaque code lu s'affiche ci-dessous. Ctrl+C pour arrêter.");
  startDouchette(dirname(CONFIG_PATH), {
    onScan: (code) => console.log(`${new Date().toLocaleTimeString("fr-FR")}  BIP  ${code}`),
    onStatus: (message) => console.log(`  ${message}`),
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
  if (!config) throw new Error(`Aucune configuration (${CONFIG_PATH}). Lancez d'abord : --appairer CODE --serveur URL --lgo LGO --export DOSSIER (serveur) ou --poste CODE --serveur URL (poste de caisse)`);
  if (config.role === "poste") return runPost(config);
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
} else if (process.argv.includes("--test-robot")) {
  testRobot();
} else if (process.argv.includes("--robot")) {
  enableRobot();
} else if (process.argv.includes("--installer")) {
  installFromInstaller().then((code) => { process.exitCode = code; });
} else if (arg("poste")) {
  pairPost().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
} else if (process.argv.includes("--test-douchette")) {
  testDouchette();
} else if (process.argv.includes("--test-affichage")) {
  testAffichage();
} else if (process.argv.includes("--version")) {
  console.log(VERSION);
} else {
  run().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
