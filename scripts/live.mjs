/**
 * Le serveur de développement permanent de Pharma.ai.
 *
 * Une seule commande, idempotente : `npm run live`. Elle démarre le serveur
 * s'il ne tourne pas, ne fait rien s'il tourne déjà, et rend la main. Le
 * processus est détaché — il survit à la fermeture du terminal, et donc à toute
 * une session de développement.
 *
 * C'est ce qui permet le mode LIVE : une fenêtre du vrai Pharma.ai reste
 * ouverte pendant qu'on code, et le rechargement à chaud de Next.js y fait
 * apparaître chaque modification. Aucun `npm run dev` à relancer, aucun onglet
 * à rouvrir.
 *
 *   npm run live            démarre (ou confirme) et affiche l'adresse
 *   npm run live -- --open  démarre puis ouvre le navigateur (macOS)
 *   npm run live:status     dit ce qui tourne, et depuis quand
 *   npm run live:stop       arrête proprement
 *
 * Le script vérifie aussi la base de données AVANT de conclure que tout va
 * bien : un serveur qui répond mais dont la base est éteinte affiche des
 * erreurs à chaque page, et ressemble à un bug de l'application.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LIVE_DIR = join(ROOT, ".live");
const PID_FILE = join(LIVE_DIR, "dev.pid");
const LOG_FILE = join(LIVE_DIR, "dev.log");
const PORT = Number(process.env.PORT ?? 3000);
const URL = `http://localhost:${PORT}`;

const ESC = String.fromCharCode(27);
const OK = `${ESC}[32m✓${ESC}[0m`;
const KO = `${ESC}[31m✗${ESC}[0m`;
const WARN = `${ESC}[33m!${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;

/** Le serveur répond-il ? La seule preuve qui compte. */
async function responds(timeoutMs = 2000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${URL}/login`, { signal: controller.signal });
    return response.status > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function readPid() {
  if (!existsSync(PID_FILE)) return null;
  const pid = Number.parseInt(readFileSync(PID_FILE, "utf8").trim(), 10);
  if (!Number.isFinite(pid)) return null;
  try {
    // Signal 0 : ne tue rien, vérifie seulement que le processus existe.
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

/**
 * La base de données répond-elle ?
 *
 * Sans elle, chaque page affiche une erreur — et le pharmacien croit que
 * l'application est cassée alors que c'est PostgreSQL qui dort.
 */
function databaseReachable() {
  const url = process.env.DATABASE_URL ?? readEnvFile("DATABASE_URL");
  if (!url) return { ok: false, reason: "DATABASE_URL absente de .env" };

  const match = /:(\d+)\//.exec(url);
  const port = match ? match[1] : "5432";
  const result = spawnSync("pg_isready", ["-p", port], { encoding: "utf8" });

  if (result.error) return { ok: true, reason: "pg_isready indisponible — non vérifié" };
  if (result.status === 0) return { ok: true, reason: `PostgreSQL répond sur le port ${port}` };
  return { ok: false, reason: `PostgreSQL ne répond pas sur le port ${port}` };
}

function readEnvFile(key) {
  const path = join(ROOT, ".env");
  if (!existsSync(path)) return null;
  const line = readFileSync(path, "utf8")
    .split("\n")
    .find((entry) => entry.startsWith(`${key}=`));
  return line ? line.slice(key.length + 1).replace(/^"|"$/g, "") : null;
}

async function start({ open }) {
  console.log(`\n${BOLD}Pharma.ai — mode LIVE${RESET}`);

  const already = await responds();
  const pid = readPid();

  if (already) {
    console.log(`${OK} Déjà en ligne sur ${BOLD}${URL}${RESET}${pid ? `${DIM} (pid ${pid})${RESET}` : ""}`);
  } else {
    if (pid) {
      // Un pid enregistré mais aucune réponse : le processus est mort ou coincé.
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* déjà parti */
      }
      rmSync(PID_FILE, { force: true });
    }

    mkdirSync(LIVE_DIR, { recursive: true });
    writeFileSync(LOG_FILE, "");

    const { openSync } = await import("node:fs");
    const out = openSync(LOG_FILE, "a");
    const child = spawn("npm", ["run", "dev"], {
      cwd: ROOT,
      detached: true,
      stdio: ["ignore", out, out],
      env: { ...process.env, PORT: String(PORT) },
    });
    child.unref();
    writeFileSync(PID_FILE, String(child.pid));

    process.stdout.write(`${DIM}  démarrage…${RESET}`);
    const deadline = Date.now() + 180_000;
    let up = false;
    while (Date.now() < deadline) {
      // Next.js compile la première page à la demande : la première réponse
      // peut prendre une minute sur une machine froide. On attend vraiment.
      if (await responds(5000)) {
        up = true;
        break;
      }
      process.stdout.write(".");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    console.log("");

    if (!up) {
      console.log(`${KO} Le serveur n'a pas répondu en 3 minutes.`);
      console.log(`${DIM}  Journal : ${LOG_FILE}${RESET}\n`);
      process.exitCode = 1;
      return;
    }

    console.log(`${OK} En ligne sur ${BOLD}${URL}${RESET}${DIM} (pid ${child.pid})${RESET}`);
  }

  const database = databaseReachable();
  console.log(`${database.ok ? OK : KO} ${database.reason}`);
  if (!database.ok) {
    console.log(`${DIM}  L'application répondra, mais chaque page affichera une erreur.${RESET}`);
  }

  console.log(`${DIM}  Journal : ${LOG_FILE}${RESET}`);
  console.log(
    `${DIM}  Le rechargement à chaud est actif : toute modification du code apparaît\n  dans l'onglet ouvert, sans rien relancer.${RESET}\n`,
  );

  if (open && process.platform === "darwin") {
    spawnSync("open", [URL]);
    console.log(`${OK} Onglet ouvert.\n`);
  }
}

async function status() {
  const pid = readPid();
  const up = await responds();
  console.log(`\n${BOLD}Pharma.ai — mode LIVE${RESET}`);
  console.log(`${up ? OK : KO} ${up ? `en ligne sur ${URL}` : "hors ligne"}${pid ? `${DIM} · pid ${pid}${RESET}` : ""}`);
  const database = databaseReachable();
  console.log(`${database.ok ? OK : WARN} ${database.reason}\n`);
  if (!up) process.exitCode = 1;
}

function stop() {
  const pid = readPid();
  console.log(`\n${BOLD}Pharma.ai — mode LIVE${RESET}`);
  if (!pid) {
    console.log(`${WARN} Aucun serveur enregistré.\n`);
    return;
  }
  try {
    // Le groupe entier : `npm run dev` engendre un processus Next.
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* déjà parti */
    }
  }
  rmSync(PID_FILE, { force: true });
  console.log(`${OK} Arrêté (pid ${pid}).\n`);
}

const command = process.argv[2] ?? "start";
const open = process.argv.includes("--open");

if (command === "stop") stop();
else if (command === "status") await status();
else await start({ open });
