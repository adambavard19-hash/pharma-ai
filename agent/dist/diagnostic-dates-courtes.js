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

// agent/src/diagnostic-dates-courtes.ts
var diagnostic_dates_courtes_exports = {};
__export(diagnostic_dates_courtes_exports, {
  COLUMN_VOCABULARY: () => COLUMN_VOCABULARY,
  EXPIRY_WORDS: () => EXPIRY_WORDS,
  databaseKinds: () => databaseKinds,
  inspectFile: () => inspectFile,
  maskHeader: () => maskHeader,
  maskPath: () => maskPath,
  renderExpiryReport: () => renderExpiryReport,
  runExpiryDiagnostic: () => runExpiryDiagnostic,
  searchRoots: () => searchRoots,
  walk: () => walk
});
module.exports = __toCommonJS(diagnostic_dates_courtes_exports);
var import_node_child_process2 = require("node:child_process");
var import_node_fs2 = require("node:fs");
var import_node_os2 = require("node:os");
var import_node_path2 = require("node:path");

// agent/src/journal-line.ts
var JOURNAL_DIRS = ["C:\\var\\log\\lgpi\\application", "D:\\var\\log\\lgpi\\application", "C:\\var\\log\\lgpi", "D:\\var\\log\\lgpi"];
var ENTRY = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})[,.]\d{3}\s+(\w+)\s+\[([^\]]*)\]\s+(\S+)\s+-\s+(.*)$/;
function parseEntry(line) {
  const match = ENTRY.exec(line);
  return match ? { date: match[1], time: match[2], level: match[3], thread: match[4], logger: match[5], message: match[6] } : null;
}

// agent/src/lire-journal.ts
var import_node_child_process = require("node:child_process");
var import_node_fs = require("node:fs");
var import_node_os = require("node:os");
var import_node_path = require("node:path");

// agent/src/robot.ts
var MAX_READ_BYTES = 1024 * 1024;

// agent/src/robot-lgpi.ts
var CYCLE_START = /:\s*Demande\s+\S{1,3}\s+la\s/;
var CYCLE_END = /\bFin de la demande\b/;
var CYCLE_GIVEN_UP = /\bon n.en \S+ pas\b/;
var PRODUCT_CODE = /Code produit\s+(\d{7}|\d{13})\b/;
var RESPONSE_CODE = /\b[A-Za-z]+_13\s*=\s*(\d{13})\b/g;
var MAX_CODES_PER_CYCLE = 50;
var RESPONSE_WAIT_MS = 3e3;
var LgpiRobotReader = class {
  cycle = null;
  pending = null;
  /** Compteurs pour le rapport de lecture : combien de demandes ont abouti, combien ont été laissées de côté. */
  finished = 0;
  givenUp = 0;
  /** Une ligne de plus. `now` : l'heure de ce poste en millisecondes (pas celle du journal). Rend les codes à annoncer, dans l'ordre. */
  push(line, now) {
    const entry = parseEntry(line);
    if (!entry) return [];
    const out = [];
    const isResponse = /(?:AutomateMessageEventGenerator|ClientAutomates)$/.test(entry.logger) && entry.message.includes("StockOutputResponse(");
    if (this.pending) {
      if (isResponse) {
        out.push(...this.settle(entry.message));
        return out;
      }
      out.push(...this.settle(null));
    }
    if (!/ControlerAutomate$/.test(entry.logger)) return out;
    const { message } = entry;
    if (CYCLE_END.test(message)) {
      const codes = this.cycle ?? [];
      this.cycle = null;
      if (codes.length > 0) {
        this.finished += 1;
        this.pending = { codes, since: now };
      }
    } else if (CYCLE_START.test(message)) {
      if (this.cycle && this.cycle.length > 0) this.givenUp += 1;
      this.cycle = [];
    } else if (CYCLE_GIVEN_UP.test(message)) {
      if (this.cycle && this.cycle.length > 0) this.givenUp += 1;
      this.cycle = null;
    } else if (this.cycle) {
      const code = PRODUCT_CODE.exec(message)?.[1];
      if (code && !this.cycle.includes(code) && this.cycle.length < MAX_CODES_PER_CYCLE) this.cycle.push(code);
    }
    return out;
  }
  /** À appeler régulièrement : la réponse du robot qui ne vient pas n'empêche pas d'annoncer. */
  flush(now) {
    return this.pending && now - this.pending.since >= RESPONSE_WAIT_MS ? this.settle(null) : [];
  }
  /**
   * Annonce les produits du cycle terminé. Un code à 7 chiffres n'est pas toujours un CIP : LGPI en donne aux produits
   * qu'il a lui-même numérotés (le journal montre un lecteur de glycémie demandé sous « 5162291 » alors que la réponse
   * du robot porte son code-barres, 4015630063253). Quand le cycle n'a qu'un code à 7 chiffres et que la réponse en
   * donne un seul à 13, c'est ce dernier que PharmaBoost sait retrouver.
   */
  settle(responseMessage) {
    const pending = this.pending;
    this.pending = null;
    if (!pending) return [];
    const { codes } = pending;
    if (responseMessage && codes.length === 1 && codes[0].length === 7) {
      const found = [...new Set([...responseMessage.matchAll(RESPONSE_CODE)].map((match) => match[1]))];
      if (found.length === 1) return found;
    }
    return codes;
  }
};
var MAX_READ_BYTES2 = 1024 * 1024;

// agent/src/lire-journal.ts
var MAX_FILES = 3;
var TAIL_BYTES = 6 * 1024 * 1024;
var ROBOT_LINE = /automate|robot|rowa|outputrequest|inputrequest|mach4|cdapi|wwks|code produit/i;
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
function maskMessage(message, extra) {
  const masked = message.replace(/[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_]{2,}/g, (word, offset) => {
    const next = message[offset + word.length];
    if (VOCABULARY.has(word.toLowerCase()) || extra?.has(word.toLowerCase())) return word;
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
function isDelivery(entry) {
  return /AutomateMessageEventGenerator$/.test(entry.logger) && entry.message.includes("StockOutputMessage(") && /packs=\[\s*StockOutputPack/.test(entry.message);
}
function matchDeliveries(announcedAt, deliveredAt, windowMs = 10 * 6e4) {
  const free = [...deliveredAt].sort((a, b) => a - b);
  let withDelivery = 0;
  for (const at of [...announcedAt].sort((a, b) => a - b)) {
    const index = free.findIndex((delivered) => delivered >= at - 2e3 && delivered <= at + windowMs);
    if (index >= 0) {
      withDelivery += 1;
      free.splice(index, 1);
    }
  }
  return { withDelivery, withoutDelivery: announcedAt.length - withDelivery };
}
function analyse(texts, options = {}) {
  const lastCount = options.lastCount ?? 40;
  const shapeCount = options.shapeCount ?? 30;
  const recentCodes = options.recentCodes ?? 15;
  const shapes = /* @__PURE__ */ new Map();
  const robot = [];
  const days = /* @__PURE__ */ new Map();
  let entriesRead = 0;
  const reader = new LgpiRobotReader();
  const announced = [];
  const delivered = [];
  let lastAt = 0;
  for (const text of texts) {
    for (const line of text.split(/\r?\n/)) {
      const entry = parseEntry(line);
      if (!entry) continue;
      entriesRead += 1;
      lastAt = Date.parse(`${entry.date}T${entry.time}`);
      for (const code of reader.push(line, lastAt)) announced.push({ date: entry.date, time: entry.time, code, at: lastAt });
      if (isDelivery(entry)) delivered.push(lastAt);
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
  for (const code of reader.flush(Number.MAX_SAFE_INTEGER)) {
    const last = robot[robot.length - 1];
    announced.push({ date: last?.date ?? "", time: last?.time ?? "", code, at: lastAt });
  }
  const followed = matchDeliveries(announced.map((hit) => hit.at), delivered);
  return {
    entriesRead,
    robotEntries: robot.length,
    requests: {
      finished: reader.finished,
      givenUp: reader.givenUp,
      announced: announced.length,
      ...followed,
      recent: announced.slice(-recentCodes).map(({ date, time, code }) => ({ date, time, code }))
    },
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
    out.push("", "=".repeat(70), "5. Ce que PharmaBoost annoncerait (le suivi en direct, appliqu\xE9 \xE0 ces journaux)", "=".repeat(70));
    const requests = analysis.requests;
    out.push(`Demandes de sortie termin\xE9es : ${requests.finished} \xB7 laiss\xE9es de c\xF4t\xE9 (le robot n'a pas la bo\xEEte, ou la demande n'a pas fini) : ${requests.givenUp}.`);
    out.push(`Produits annonc\xE9s : ${requests.announced} \xB7 suivis d'une sortie de bo\xEEte dans les 10 minutes : ${requests.withDelivery} \xB7 sans sortie vue : ${requests.withoutDelivery}.`);
    for (const hit of requests.recent) out.push(`   ${hit.date} ${hit.time} \u2192 ${hit.code}`);
    out.push("Le dernier produit annonc\xE9 doit \xEAtre celui de la vente de test, \xE0 la minute pr\xE8s.");
    out.push("", "=".repeat(70), "6. Ce que cela sugg\xE8re", "=".repeat(70));
    const best = analysis.candidates.filter((result) => result.total > 0).sort((a, b) => b.total - a.total)[0];
    if (analysis.robotEntries === 0) out.push(" - Aucune ligne du robot : ces journaux ne portent pas l'\xE9change. Le rapport du diagnostic complet reste la r\xE9f\xE9rence.");
    else if (!best) out.push(" - Le journal parle du robot, mais aucun motif ne trouve de code produit : la forme des lignes (section 2) dit o\xF9 chercher.");
    else out.push(` - Le motif \xAB ${best.candidate.id} \xBB trouve des codes produit (${best.total}) : comparez les derniers codes et leurs heures avec la vente de test.`);
    out.push(" - Une vente de test d'UNE bo\xEEte connue, faite juste avant cette lecture, doit appara\xEEtre en bas de la section 4, \xE0 la minute pr\xE8s.");
  }
  if (input.errors.length > 0) {
    out.push("", "=".repeat(70), "7. Erreurs rencontr\xE9es pendant la lecture", "=".repeat(70), ...input.errors);
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

// agent/src/diagnostic-dates-courtes.ts
var EXPIRY_WORDS = /p[ée]remp|p[ée]rim|\bDLU\b|\bDLC\b|\bDDM\b|expir|date.?exp|\blots?\b|n[°o]\s*lot|num[ée]ro.?de.?lot/i;
var COLUMN_VOCABULARY = new Set(
  [
    "peremption",
    "p\xE9remption",
    "peremptions",
    "p\xE9remptions",
    "perime",
    "p\xE9rim\xE9",
    "perimes",
    "p\xE9rim\xE9s",
    "qt\xE9",
    "quantites",
    "quantit\xE9s",
    "date",
    "dates",
    "dlu",
    "dlc",
    "ddm",
    "expiration",
    "exp",
    "lot",
    "lots",
    "numero",
    "num\xE9ro",
    "num",
    "cip",
    "cip13",
    "cip7",
    "ean",
    "ean13",
    "gtin",
    "code",
    "libelle",
    "libell\xE9",
    "designation",
    "d\xE9signation",
    "produit",
    "quantite",
    "quantit\xE9",
    "qte",
    "stock",
    "prix",
    "achat",
    "vente",
    "tva",
    "fournisseur",
    "rayon",
    "emplacement",
    "famille",
    "laboratoire",
    "marque",
    "pvp",
    "pamp",
    "ttc",
    "unite",
    "unit\xE9",
    "reserve",
    "r\xE9serve",
    "robot",
    "entree",
    "entr\xE9e",
    "sortie",
    "mouvement",
    "inventaire",
    "valeur",
    "total",
    "courte",
    "courtes"
  ].map((word) => word.toLowerCase())
);
var PATH_VOCABULARY = new Set(
  ["users", "utilisateurs", "desktop", "bureau", "documents", "downloads", "telechargements", "t\xE9l\xE9chargements", "onedrive", "program", "files", "programdata", "lgpi", "pharmagest", "export", "exports", "import", "imports", "edition", "editions", "\xE9ditions", "stock", "stocks", "inventaire", "var", "log", "echange", "\xE9change", "partage", "public", "csv", "txt", "xls", "xlsx", "xml", "dbf", "dat", "tsv", "exp", "data", "donnees", "donn\xE9es", "temp", "tmp"].map((word) => word.toLowerCase())
);
var PATH_WORDS = /* @__PURE__ */ new Set([...PATH_VOCABULARY, ...COLUMN_VOCABULARY]);
function maskPath(path) {
  return path.split(/([\\/])/).map((part) => part === "\\" || part === "/" ? part : maskMessage(part.replace(/[_.-]/g, (c) => ` ${c} `), PATH_WORDS).replace(/ ([_.-]) /g, "$1")).join("");
}
var FILE_TYPES = /* @__PURE__ */ new Set([".csv", ".txt", ".xls", ".xlsx", ".xml", ".dbf", ".dat", ".exp", ".tsv"]);
var MAX_FILE_BYTES = 80 * 1024 * 1024;
var YEAR_MS = 365 * 864e5;
function maskHeader(header) {
  return maskMessage(header.replace(/\s+/g, " ").trim(), COLUMN_VOCABULARY).slice(0, 240);
}
function readHead(path, bytes = 4096) {
  const fd = (0, import_node_fs2.openSync)(path, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const n = (0, import_node_fs2.readSync)(fd, buffer, 0, bytes, 0);
    const raw = buffer.subarray(0, n);
    if (raw.length > 2 && raw[1] === 0) return raw.toString("utf16le");
    const utf8 = raw.toString("utf8");
    return utf8.includes("\uFFFD") ? raw.toString("latin1") : utf8;
  } finally {
    (0, import_node_fs2.closeSync)(fd);
  }
}
function inspectFile(path, readText = readHead) {
  const stat = (0, import_node_fs2.statSync)(path);
  if (!stat.isFile() || stat.size === 0 || stat.size > MAX_FILE_BYTES) return null;
  const name = path.split(/[\\/]/).pop() ?? path;
  const byName = EXPIRY_WORDS.test(name.replace(/[_.-]/g, " "));
  let header = "";
  if (![".xlsx", ".xls"].includes((0, import_node_path2.extname)(path).toLowerCase())) {
    const lines = readText(path).split(/\r?\n/).slice(0, 3);
    const hit = lines.find((line) => EXPIRY_WORDS.test(line));
    if (hit) header = maskHeader(hit);
  }
  if (!byName && !header) return null;
  const d = stat.mtime;
  const two = (n) => String(n).padStart(2, "0");
  return { path, sizeKb: Math.max(1, Math.round(stat.size / 1024)), modified: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`, header, byName };
}
function searchRoots() {
  const home = (0, import_node_os2.homedir)();
  const roots = [(0, import_node_path2.join)(home, "Desktop"), (0, import_node_path2.join)(home, "Documents"), (0, import_node_path2.join)(home, "Downloads"), (0, import_node_path2.join)(home, "OneDrive")];
  for (const drive of ["C:\\", "D:\\", "E:\\"]) {
    try {
      if (!(0, import_node_fs2.existsSync)(drive)) continue;
      for (const name of (0, import_node_fs2.readdirSync)(drive)) {
        if (/lgpi|pharmagest|export|import|edition|stock|inventaire|var|echange|partage|public/i.test(name)) roots.push((0, import_node_path2.join)(drive, name));
      }
    } catch {
    }
  }
  for (const base of ["C:\\Program Files", "C:\\Program Files (x86)", "C:\\ProgramData"]) {
    try {
      if ((0, import_node_fs2.existsSync)(base)) {
        for (const name of (0, import_node_fs2.readdirSync)(base)) if (/lgpi|pharmagest/i.test(name)) roots.push((0, import_node_path2.join)(base, name));
      }
    } catch {
    }
  }
  return [...new Set(roots)].filter((root) => (0, import_node_fs2.existsSync)(root));
}
function walk(root, now, out, budget = { left: 2e4 }, depth = 0) {
  if (depth > 4 || budget.left <= 0) return;
  let names;
  try {
    names = (0, import_node_fs2.readdirSync)(root);
  } catch {
    return;
  }
  for (const name of names) {
    if (budget.left-- <= 0) return;
    if (/^(windows|\$recycle\.bin|node_modules|appdata|system volume information)$/i.test(name)) continue;
    const path = (0, import_node_path2.join)(root, name);
    try {
      const stat = (0, import_node_fs2.statSync)(path);
      if (stat.isDirectory()) walk(path, now, out, budget, depth + 1);
      else if (FILE_TYPES.has((0, import_node_path2.extname)(name).toLowerCase()) && now - stat.mtimeMs < YEAR_MS) {
        const found = inspectFile(path);
        if (found) out.push(found);
      }
    } catch {
    }
  }
}
function databaseKinds(text) {
  const kinds = /* @__PURE__ */ new Set();
  for (const match of text.matchAll(/jdbc:([a-z0-9]+)/gi)) kinds.add(`jdbc:${match[1].toLowerCase()}`);
  for (const word of ["postgres", "oracle", "sqlserver", "mysql", "firebird", "hsqldb", "derby", "sqlite", "informix", "progress", "4d"]) {
    if (new RegExp(`\\b${word}`, "i").test(text)) kinds.add(word);
  }
  return [...kinds];
}
function lgpiInstallation(errors) {
  const out = [];
  const bases = ["C:\\", "D:\\", "C:\\Program Files", "C:\\Program Files (x86)", "C:\\ProgramData"];
  for (const base of bases) {
    let names = [];
    try {
      if ((0, import_node_fs2.existsSync)(base)) names = (0, import_node_fs2.readdirSync)(base).filter((name) => /lgpi|pharmagest/i.test(name));
    } catch (error) {
      errors.push(`${base} : ${error instanceof Error ? error.message : String(error)}`);
    }
    for (const name of names) {
      const dir = (0, import_node_path2.join)(base, name);
      out.push(`Dossier : ${maskPath(dir)}`);
      const settings = [];
      const scan = (path, depth) => {
        if (depth > 2 || settings.length > 40) return;
        try {
          for (const entry of (0, import_node_fs2.readdirSync)(path)) {
            const full = (0, import_node_path2.join)(path, entry);
            const stat = (0, import_node_fs2.statSync)(full);
            if (stat.isDirectory()) scan(full, depth + 1);
            else if (/\.(properties|ini|xml|conf|cfg|json)$/i.test(entry) && stat.size < 2 * 1024 * 1024) {
              const kinds = databaseKinds(readTail(full, 512 * 1024) ?? "");
              settings.push(`   ${maskPath(full.slice(dir.length + 1))}${kinds.length ? ` \u2192 base cit\xE9e : ${kinds.join(", ")}` : ""}`);
            }
          }
        } catch {
        }
      };
      scan(dir, 0);
      out.push(...settings.slice(0, 40));
    }
  }
  return out;
}
function odbcSources() {
  if (process.platform !== "win32") return [];
  const out = [];
  for (const key of ["HKLM\\SOFTWARE\\ODBC\\ODBC.INI\\ODBC Data Sources", "HKCU\\SOFTWARE\\ODBC\\ODBC.INI\\ODBC Data Sources", "HKLM\\SOFTWARE\\WOW6432Node\\ODBC\\ODBC.INI\\ODBC Data Sources"]) {
    try {
      const text = (0, import_node_child_process2.execFileSync)("reg.exe", ["query", key], { encoding: "latin1", timeout: 8e3 });
      for (const line of text.split(/\r?\n/)) {
        const match = /^\s+(.+?)\s+REG_SZ\s+(.+)$/.exec(line);
        if (match) out.push(`${match[1]} \xB7 pilote : ${match[2]}`);
      }
    } catch {
    }
  }
  return [...new Set(out)];
}
function runningPrograms() {
  if (process.platform !== "win32") return [];
  try {
    const text = (0, import_node_child_process2.execFileSync)("tasklist.exe", ["/fo", "csv", "/nh"], { encoding: "latin1", timeout: 1e4 });
    const names = /* @__PURE__ */ new Set();
    for (const line of text.split(/\r?\n/)) {
      const name = /^"([^"]+)"/.exec(line)?.[1];
      if (name && /lgpi|pharmagest|java|postgres|oracle|sqlservr|mysql|firebird|rowa|odbc/i.test(name)) names.add(name);
    }
    return [...names];
  } catch {
    return [];
  }
}
function journalShapes(errors) {
  const shapes = /* @__PURE__ */ new Map();
  for (const dir of process.env.PB_JOURNAL_DIR ? [process.env.PB_JOURNAL_DIR] : JOURNAL_DIRS) {
    try {
      if (!(0, import_node_fs2.existsSync)(dir)) continue;
      for (const journal of recentJournals(dir, 3)) {
        const text = readTail(journal.path, 6 * 1024 * 1024) ?? "";
        for (const line of text.split(/\r?\n/)) {
          const entry = parseEntry(line);
          if (!entry || !EXPIRY_WORDS.test(entry.message)) continue;
          const shape = `${entry.level} [${maskThread(entry.thread)}] ${entry.logger} - ${maskMessage(entry.message, COLUMN_VOCABULARY)}`;
          shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
        }
      }
      break;
    } catch (error) {
      errors.push(`${dir} : ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return [...shapes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([shape, n]) => `${n} \xD7 ${shape}`);
}
function renderExpiryReport(input) {
  const out = [];
  const bar = "=".repeat(70);
  out.push("PharmaBoost \u2014 diagnostic \xAB dates courtes \xBB (lecture seule)");
  out.push(`Ordinateur : ${input.computer} \xB7 ${input.now.toLocaleString("fr-FR")}`);
  out.push("Aucune ligne de fichier n'est \xE9crite ici : seulement des noms de fichiers et de colonnes, les valeurs masqu\xE9es (9, a/A).");
  out.push("", bar, "1. Fichiers r\xE9cents qui parlent de p\xE9remption, de lot ou de date", bar);
  out.push(`Dossiers parcourus : ${input.roots.length ? input.roots.map(maskPath).join(" \xB7 ") : "(aucun)"}`);
  if (input.files.length === 0) out.push("(aucun fichier trouv\xE9 : LGPI n'a sans doute jamais export\xE9 les p\xE9remptions sur ce poste)");
  for (const file of input.files.slice(0, 60)) {
    out.push(`${maskPath(file.path)} \xB7 ${file.sizeKb} Ko \xB7 modifi\xE9 le ${file.modified}${file.byName ? " \xB7 (nom \xE9vocateur)" : ""}`);
    if (file.header) out.push(`   colonnes : ${file.header}`);
  }
  out.push("", bar, "2. L'installation de LGPI sur ce poste (fichiers de r\xE9glage, type de base cit\xE9)", bar);
  out.push(...input.install.length ? input.install : ["(aucun dossier LGPI ou Pharmagest sur ce poste : LGPI tourne peut-\xEAtre sur un serveur)"]);
  out.push("", bar, "3. Sources de donn\xE9es ODBC d\xE9clar\xE9es", bar);
  out.push(...input.odbc.length ? input.odbc : ["(aucune)"]);
  out.push("", bar, "4. Programmes en cours (LGPI, Java, bases de donn\xE9es)", bar);
  out.push(...input.programs.length ? input.programs : ["(aucun)"]);
  out.push("", bar, "5. Le journal de LGPI : lignes qui parlent de p\xE9remption ou de lot (masqu\xE9es)", bar);
  out.push(...input.journal.length ? input.journal : ["(aucune)"]);
  out.push("", bar, "6. Ce que cela sugg\xE8re", bar);
  if (input.files.some((file) => file.header)) out.push(" - Un fichier porte des colonnes de p\xE9remption : s'il vient de LGPI, PharmaBoost peut le lire comme le fichier de stock.");
  else out.push(" - Aucun export de p\xE9remptions trouv\xE9 : demander \xE0 LGPI (menu \xC9ditions / Stock) une \xE9dition \xAB p\xE9remptions \xBB ou \xAB dates courtes \xBB en CSV, puis relancer ce diagnostic.");
  if (input.install.some((line) => line.includes("base cit\xE9e"))) out.push(" - LGPI cite une base de donn\xE9es : une lecture directe serait possible avec l'accord de Pharmagest (jamais sans).");
  if (input.errors.length) out.push("", bar, "7. Erreurs", bar, ...input.errors.slice(0, 30));
  return out;
}
function runExpiryDiagnostic(now = /* @__PURE__ */ new Date()) {
  const errors = [];
  const roots = process.env.PB_RACINES ? process.env.PB_RACINES.split(";") : searchRoots();
  const files = [];
  const budget = { left: 6e4 };
  for (const root of roots) walk(root, now.getTime(), files, budget);
  files.sort((a, b) => Number(Boolean(b.header)) - Number(Boolean(a.header)) || b.modified.localeCompare(a.modified));
  const computer = process.env.COMPUTERNAME ?? (0, import_node_os2.hostname)();
  const lines = renderExpiryReport({ computer, now, roots, files, install: lgpiInstallation(errors), odbc: odbcSources(), programs: runningPrograms(), journal: journalShapes(errors), errors });
  const two = (n) => String(n).padStart(2, "0");
  const file = (0, import_node_path2.join)(desktopDir(), `PharmaBoost-dates-courtes-${computer}-${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}.txt`);
  (0, import_node_fs2.writeFileSync)(file, "\uFEFF" + lines.join("\r\n") + "\r\n", "utf8");
  return { file, lines };
}
if (process.env.PB_DATES_COURTES_LANCER === "1") {
  console.log("");
  console.log("PharmaBoost \u2014 diagnostic \xAB dates courtes \xBB");
  console.log("Ce programme LIT seulement : il cherche o\xF9 LGPI garde les dates de p\xE9remption et \xE9crit un rapport sur le Bureau.");
  console.log("Il ne modifie rien, n'envoie rien sur Internet, et n'\xE9crit aucune ligne de fichier (seulement des noms de colonnes).");
  console.log("Recherche en cours (une \xE0 deux minutes)\u2026");
  try {
    const { file } = runExpiryDiagnostic();
    console.log("TERMIN\xC9. Rapport \xE9crit sur le Bureau :");
    console.log("  " + file);
    console.log("Ouvrez-le, relisez-le, puis envoyez-le \xE0 contact@pharmaboost.app.");
  } catch (error) {
    console.log("Le diagnostic a \xE9chou\xE9 : " + (error instanceof Error ? error.message : String(error)));
    console.log("Prenez cette fen\xEAtre en photo.");
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  COLUMN_VOCABULARY,
  EXPIRY_WORDS,
  databaseKinds,
  inspectFile,
  maskHeader,
  maskPath,
  renderExpiryReport,
  runExpiryDiagnostic,
  searchRoots,
  walk
});
