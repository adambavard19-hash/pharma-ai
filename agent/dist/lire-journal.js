"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// agent/src/lire-journal.ts
var lire_journal_exports = {};
__export(lire_journal_exports, {
  CANDIDATES: () => CANDIDATES,
  JOURNAL_DIRS: () => JOURNAL_DIRS,
  MAX_FILES: () => MAX_FILES,
  ROBOT_LINE: () => ROBOT_LINE,
  TAIL_BYTES: () => TAIL_BYTES,
  analyse: () => analyse,
  desktopDir: () => desktopDir,
  findCodes: () => findCodes,
  formatDate: () => formatDate,
  maskEntry: () => maskEntry,
  maskMessage: () => maskMessage,
  maskThread: () => maskThread,
  parseEntry: () => parseEntry,
  readTail: () => readTail,
  recentJournals: () => recentJournals,
  renderReport: () => renderReport,
  run: () => run,
  shapeOfEntry: () => shapeOfEntry
});
module.exports = __toCommonJS(lire_journal_exports);
var import_node_child_process = require("node:child_process");
var import_node_fs = require("node:fs");
var import_node_os = require("node:os");
var import_node_path = require("node:path");
var JOURNAL_DIRS = ["C:\\var\\log\\lgpi\\application", "D:\\var\\log\\lgpi\\application", "C:\\var\\log\\lgpi", "D:\\var\\log\\lgpi"];
var MAX_FILES = 3;
var TAIL_BYTES = 6 * 1024 * 1024;
var ROBOT_LINE = /automate|robot|rowa|outputrequest|inputrequest|mach4|cdapi|wwks|code produit/i;
var ENTRY = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})[,.]\d{3}\s+(\w+)\s+\[([^\]]*)\]\s+(\S+)\s+-\s+(.*)$/;
function parseEntry(line) {
  const match = ENTRY.exec(line);
  return match ? { date: match[1], time: match[2], level: match[3], thread: match[4], logger: match[5], message: match[6] } : null;
}
var VOCABULARY = new Set(
  [
    "pick",
    "picking",
    "request",
    "response",
    "reply",
    "answer",
    "article",
    "product",
    "produit",
    "item",
    "status",
    "state",
    "order",
    "commande",
    "stock",
    "input",
    "output",
    "store",
    "delivery",
    "deliver",
    "dispense",
    "dispensing",
    "sortie",
    "entree",
    "quantity",
    "qty",
    "quantite",
    "count",
    "number",
    "message",
    "send",
    "sent",
    "recv",
    "receive",
    "received",
    "connect",
    "connected",
    "disconnect",
    "disconnected",
    "tcp",
    "socket",
    "port",
    "host",
    "start",
    "started",
    "stop",
    "stopped",
    "begin",
    "end",
    "true",
    "false",
    "null",
    "none",
    "version",
    "type",
    "code",
    "error",
    "erreur",
    "warn",
    "warning",
    "info",
    "debug",
    "trace",
    "lgpi",
    "rowa",
    "cdapi",
    "wwks",
    "robot",
    "automate",
    "ack",
    "nak",
    "timeout",
    "retry",
    "busy",
    "ready",
    "idle",
    "done",
    "failed",
    "success",
    "unknown",
    "inconnu",
    "cip",
    "ean",
    "gtin",
    "pzn",
    "mach4",
    "keepalive",
    "outputrequest",
    "inputrequest",
    "articleid",
    // Le français d'un message de journal : les mots de liaison, jamais un nom propre.
    "re\xE7u",
    "recu",
    "reception",
    "r\xE9ception",
    "envoi",
    "envoy\xE9",
    "envoye",
    "message",
    "provenance",
    "destination",
    "dans",
    "pour",
    "avec",
    "sans",
    "pas",
    "plus",
    "aucun",
    "aucune",
    "une",
    "des",
    "les",
    "aux",
    "sur",
    "par",
    "est",
    "sont",
    "\xE9t\xE9",
    "ete",
    "cette",
    "ces",
    "tous",
    "toutes",
    "demande",
    "r\xE9ponse",
    "reponse",
    "emplacement",
    "casier",
    "disponible",
    "indisponible",
    "trouv\xE9",
    "trouve",
    "lecture",
    "\xE9criture",
    "ecriture",
    "fin",
    "d\xE9but",
    "debut"
  ].map((word) => word.toLowerCase())
);
var CLASS_NAME = /^[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+$/;
var FIELD_NAME = /^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)*$/;
function shapeOf(word) {
  return word.replace(/[a-zà-ÿ]/g, "a").replace(/[A-ZÀ-Ý]/g, "A");
}
function maskMessage(message) {
  const masked = message.replace(/[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_]{2,}/g, (word, offset) => {
    const next = message[offset + word.length];
    if (VOCABULARY.has(word.toLowerCase())) return word;
    if (next === "(" && CLASS_NAME.test(word)) return word;
    if (next === "=" && FIELD_NAME.test(word)) return word;
    return shapeOf(word);
  });
  return masked.replace(/\d/g, "9").slice(0, 260);
}
function maskThread(thread) {
  return thread.replace(/[A-Za-zÀ-ÿ_]{3,}/g, (word) => VOCABULARY.has(word.toLowerCase()) ? word : shapeOf(word)).replace(/\d/g, "9");
}
function maskEntry(entry) {
  return `${entry.time} ${entry.level} [${maskThread(entry.thread)}] ${entry.logger} - ${maskMessage(entry.message)}`;
}
function shapeOfEntry(entry) {
  return `${entry.level} [${maskThread(entry.thread)}] ${entry.logger} - ${maskMessage(entry.message)}`;
}
var CANDIDATES = [
  { id: "code-produit", label: "\xAB Code produit 9999999 \xBB", regex: /Code produit\s+(\d{7}|\d{13})\b/g },
  { id: "article", label: "article=\u2026 / articleId=\u2026 / articleCode=\u2026", regex: /article(?:Id|Code)?\s*[=:]\s*"?(\d{7}|\d{13})\b/gi },
  { id: "cip-ean", label: "cip=\u2026 / ean=\u2026 / gtin=\u2026", regex: /\b(?:cip|ean|gtin)\w*\s*[=:]\s*"?(\d{7}|\d{13})\b/gi }
];
function findCodes(entry, candidate) {
  const codes = [];
  const regex = new RegExp(candidate.regex.source, candidate.regex.flags);
  for (let match = regex.exec(entry.message); match; match = regex.exec(entry.message)) {
    if (match[0] === "") regex.lastIndex += 1;
    if (match[1] && !codes.includes(match[1])) codes.push(match[1]);
  }
  return codes;
}
function analyse(texts, options = {}) {
  const lastCount = options.lastCount ?? 40;
  const shapeCount = options.shapeCount ?? 30;
  const recentCodes = options.recentCodes ?? 15;
  const shapes = /* @__PURE__ */ new Map();
  const robot = [];
  const days = /* @__PURE__ */ new Map();
  let entriesRead = 0;
  for (const text of texts) {
    for (const line of text.split(/\r?\n/)) {
      const entry = parseEntry(line);
      if (!entry) continue;
      entriesRead += 1;
      if (!ROBOT_LINE.test(entry.message) && !ROBOT_LINE.test(entry.logger)) continue;
      robot.push(entry);
      days.set(entry.date, (days.get(entry.date) ?? 0) + 1);
      const shape = shapeOfEntry(entry);
      const stamp = `${entry.date} ${entry.time}`;
      const known = shapes.get(shape);
      if (known) {
        known.count += 1;
        known.last = stamp;
      } else {
        shapes.set(shape, { shape, count: 1, first: stamp, last: stamp });
      }
    }
  }
  const candidates = CANDIDATES.map((candidate) => {
    const hits = [];
    for (const entry of robot) for (const code of findCodes(entry, candidate)) hits.push({ date: entry.date, time: entry.time, code });
    return { candidate, total: hits.length, distinct: new Set(hits.map((hit) => hit.code)).size, recent: hits.slice(-recentCodes) };
  });
  return {
    entriesRead,
    robotEntries: robot.length,
    shapes: [...shapes.values()].sort((a, b) => b.count - a.count || a.first.localeCompare(b.first)).slice(0, shapeCount),
    lastLines: robot.slice(-lastCount).map((entry) => `${entry.date} ${maskEntry(entry)}`),
    candidates,
    days: [...days.entries()].map(([date, robotEntries]) => ({ date, robotEntries })).sort((a, b) => a.date.localeCompare(b.date))
  };
}
function renderReport(input) {
  const out = [];
  const two = (n) => String(n).padStart(2, "0");
  const stamp = `${input.now.getFullYear()}-${two(input.now.getMonth() + 1)}-${two(input.now.getDate())} ${two(input.now.getHours())}:${two(input.now.getMinutes())}`;
  out.push("PharmaBoost \u2014 lecture du journal de LGPI (lecture seule)");
  out.push(`Ordinateur : ${input.computer} \xB7 ${stamp}`);
  out.push("Aucune valeur n'est \xE9crite ici : les chiffres sont des 9, les mots des a/A. Seuls les CODES PRODUIT trouv\xE9s par les motifs sont list\xE9s.");
  out.push("");
  out.push("=".repeat(70), "1. Les journaux lus", "=".repeat(70));
  if (!input.dir) {
    out.push("Aucun journal de LGPI trouv\xE9 aux emplacements connus :");
    for (const dir of JOURNAL_DIRS) out.push(` - ${dir}`);
  } else {
    out.push(`Dossier : ${input.dir}`);
    for (const file of input.files) out.push(` - ${file.name} \xB7 ${file.sizeKb} Ko \xB7 ${file.modified}`);
  }
  const analysis = input.analysis;
  if (analysis) {
    out.push(`Lignes lues : ${analysis.entriesRead} \xB7 lignes qui parlent du robot : ${analysis.robotEntries}`);
    for (const day of analysis.days) out.push(` - ${day.date} : ${day.robotEntries} ligne(s) du robot`);
    out.push("", "=".repeat(70), "2. Les formes de lignes du robot, les plus fr\xE9quentes (forme \xB7 nombre \xB7 premi\xE8re \u2192 derni\xE8re heure)", "=".repeat(70));
    if (analysis.shapes.length === 0) out.push("(aucune ligne du robot dans la fin de ces journaux)");
    for (const shape of analysis.shapes) out.push(`${shape.count} \xD7 ${shape.shape}`, `      du ${shape.first} au ${shape.last}`);
    out.push("", "=".repeat(70), "3. Les derni\xE8res lignes du robot, masqu\xE9es", "=".repeat(70));
    if (analysis.lastLines.length === 0) out.push("(aucune)");
    out.push(...analysis.lastLines);
    out.push("", "=".repeat(70), "4. Les codes produit que chaque motif trouve (ce sont des produits, pas des patients)", "=".repeat(70));
    for (const result of analysis.candidates) {
      out.push(`Motif ${result.candidate.id} \u2014 ${result.candidate.label} : ${result.total} code(s) trouv\xE9(s), ${result.distinct} diff\xE9rent(s).`);
      for (const hit of result.recent) out.push(`   ${hit.date} ${hit.time} \u2192 ${hit.code}`);
    }
    out.push("", "=".repeat(70), "5. Ce que cela sugg\xE8re", "=".repeat(70));
    const best = analysis.candidates.filter((result) => result.total > 0).sort((a, b) => b.total - a.total)[0];
    if (analysis.robotEntries === 0) out.push(" - Aucune ligne du robot : ces journaux ne portent pas l'\xE9change. Le rapport du diagnostic complet reste la r\xE9f\xE9rence.");
    else if (!best) out.push(" - Le journal parle du robot, mais aucun motif ne trouve de code produit : la forme des lignes (section 2) dit o\xF9 chercher.");
    else out.push(` - Le motif \xAB ${best.candidate.id} \xBB trouve des codes produit (${best.total}) : comparez les derniers codes et leurs heures avec la vente de test.`);
    out.push(" - Une vente de test d'UNE bo\xEEte connue, faite juste avant cette lecture, doit appara\xEEtre en bas de la section 4, \xE0 la minute pr\xE8s.");
  }
  if (input.errors.length > 0) {
    out.push("", "=".repeat(70), "6. Erreurs rencontr\xE9es pendant la lecture", "=".repeat(70), ...input.errors);
  }
  return out;
}
function readTail(path, bytes) {
  let fd = null;
  try {
    const size = (0, import_node_fs.statSync)(path).size;
    const length = Math.min(bytes, size);
    const buffer = Buffer.alloc(length);
    fd = (0, import_node_fs.openSync)(path, "r");
    (0, import_node_fs.readSync)(fd, buffer, 0, length, size - length);
    return buffer.toString("latin1");
  } catch {
    return null;
  } finally {
    if (fd !== null) (0, import_node_fs.closeSync)(fd);
  }
}
function pad(n) {
  return String(n).padStart(2, "0");
}
function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function recentJournals(dir, max = MAX_FILES) {
  const found = (0, import_node_fs.readdirSync)(dir).filter((name) => /^lgpi.*\.log$/i.test(name)).map((name) => {
    const path = (0, import_node_path.join)(dir, name);
    const stat = (0, import_node_fs.statSync)(path);
    return { path, info: { name, sizeKb: Math.max(1, Math.round(stat.size / 1024)), modified: formatDate(stat.mtime) }, mtime: stat.mtimeMs };
  }).sort((a, b) => b.mtime - a.mtime).slice(0, max).reverse();
  return found.map(({ path, info }) => ({ path, info }));
}
function desktopDir() {
  if (process.env.PB_BUREAU) return process.env.PB_BUREAU;
  if (process.platform === "win32") {
    try {
      const found = (0, import_node_child_process.execFileSync)("powershell.exe", ["-NoProfile", "-Command", "[Environment]::GetFolderPath('Desktop')"], { encoding: "utf8", timeout: 8e3 }).trim();
      if (found && (0, import_node_fs.existsSync)(found)) return found;
    } catch {
    }
  }
  const classic = (0, import_node_path.join)((0, import_node_os.homedir)(), "Desktop");
  return (0, import_node_fs.existsSync)(classic) ? classic : (0, import_node_os.homedir)();
}
function run(options = {}) {
  const now = options.now ?? /* @__PURE__ */ new Date();
  const errors = [];
  let dir = null;
  let journals = [];
  const dirs = options.dirs ?? (process.env.PB_JOURNAL_DIR ? [process.env.PB_JOURNAL_DIR] : JOURNAL_DIRS);
  for (const candidate of dirs) {
    try {
      if (!(0, import_node_fs.existsSync)(candidate)) continue;
      const found = recentJournals(candidate);
      if (found.length > 0) {
        dir = candidate;
        journals = found;
        break;
      }
    } catch (error) {
      errors.push(`${candidate} : ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const texts = [];
  for (const journal of journals) {
    const text = readTail(journal.path, TAIL_BYTES);
    if (text === null) errors.push(`${journal.info.name} : illisible`);
    else texts.push(text);
  }
  const analysis = dir ? analyse(texts) : null;
  const lines = renderReport({ computer: process.env.COMPUTERNAME ?? (0, import_node_os.hostname)(), now, dir, files: journals.map((journal) => journal.info), analysis, errors });
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const file = (0, import_node_path.join)(desktopDir(), `PharmaBoost-lecture-journal-${process.env.COMPUTERNAME ?? (0, import_node_os.hostname)()}-${stamp}.txt`);
  (0, import_node_fs.writeFileSync)(file, "\uFEFF" + lines.join("\r\n") + "\r\n", "utf8");
  return { file, lines };
}
if (process.env.PB_LIRE_JOURNAL_LANCER === "1") {
  console.log("");
  console.log("PharmaBoost \u2014 lecture du journal de LGPI");
  console.log("Ce programme LIT seulement : il \xE9crit un rapport sur le Bureau, rien d'autre.");
  console.log("Il ne modifie ni votre logiciel ni le robot, n'envoie rien sur Internet, et ne montre aucune valeur");
  console.log("(aucune donn\xE9e patient) : seuls les codes de PRODUIT que le journal cite sont list\xE9s.");
  console.log("");
  try {
    const { file, lines } = run();
    console.log(lines.slice(0, 1).join(""));
    console.log("TERMIN\xC9. Rapport \xE9crit sur le Bureau :");
    console.log("  " + file);
    console.log("Ouvrez-le, relisez-le, puis envoyez-le \xE0 contact@pharmaboost.app.");
  } catch (error) {
    console.log("La lecture a \xE9chou\xE9 : " + (error instanceof Error ? error.message : String(error)));
    console.log("Prenez cette fen\xEAtre en photo.");
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CANDIDATES,
  JOURNAL_DIRS,
  MAX_FILES,
  ROBOT_LINE,
  TAIL_BYTES,
  analyse,
  desktopDir,
  findCodes,
  formatDate,
  maskEntry,
  maskMessage,
  maskThread,
  parseEntry,
  readTail,
  recentJournals,
  renderReport,
  run,
  shapeOfEntry
});
