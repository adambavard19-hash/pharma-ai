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

// agent/src/diagnostic-fin-de-vente.ts
var diagnostic_fin_de_vente_exports = {};
__export(diagnostic_fin_de_vente_exports, {
  AFTER_ACTION_MS: () => AFTER_ACTION_MS,
  MAX_DURATION_MS: () => MAX_DURATION_MS,
  OBSERVER_SCRIPT: () => OBSERVER_SCRIPT,
  SALE_VOCABULARY: () => SALE_VOCABULARY,
  afterActions: () => afterActions,
  collapseScanner: () => collapseScanner,
  journalObserved: () => journalObserved,
  maskJournalMessage: () => maskJournalMessage,
  parseHookLine: () => parseHookLine,
  renderSaleReport: () => renderSaleReport
});
module.exports = __toCommonJS(diagnostic_fin_de_vente_exports);
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
  const two2 = (n) => String(n).padStart(2, "0");
  const stamp = `${input.now.getFullYear()}-${two2(input.now.getMonth() + 1)}-${two2(input.now.getDate())} ${two2(input.now.getHours())}:${two2(input.now.getMinutes())}`;
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

// agent/src/diagnostic-fin-de-vente.ts
var SALE_VOCABULARY = new Set(
  [
    "facturation",
    "facture",
    "vente",
    "ventes",
    "client",
    "clients",
    "patient",
    "patients",
    "ordonnance",
    "ordonnances",
    "valider",
    "validation",
    "validee",
    "valid\xE9e",
    "valide",
    "encaissement",
    "encaisser",
    "reglement",
    "r\xE8glement",
    "paiement",
    "payer",
    "ticket",
    "tiers",
    "payant",
    "comptoir",
    "delivrance",
    "d\xE9livrance",
    "dossier",
    "nouveau",
    "nouvelle",
    "suivant",
    "suivante",
    "termine",
    "termin\xE9",
    "terminee",
    "termin\xE9e",
    "annuler",
    "annulation",
    "annulee",
    "annul\xE9e",
    "panier",
    "caisse",
    "carte",
    "vitale",
    "conseil",
    "conseils",
    "avance",
    "impression",
    "imprimer",
    "rendu",
    "monnaie",
    "total",
    "ligne",
    "lignes",
    "produit",
    "produits",
    "fiche",
    "historique",
    "attente",
    "pause",
    "reprise",
    "mise",
    "creation",
    "cr\xE9ation",
    "sauvegarde",
    "enregistrement",
    "enregistrer",
    "fermeture",
    "ouverture",
    "ecran",
    "\xE9cran",
    "fenetre",
    "fen\xEAtre",
    "menu",
    "accueil",
    "recherche",
    "remise",
    "honoraire",
    "honoraires",
    "posologie",
    "substitution",
    "commentaires",
    "lgpi",
    "pharmagest",
    "chrome",
    "edge",
    "explorer",
    "java",
    "javaw",
    "pharmaboost",
    "notepad",
    "cmd",
    "powershell",
    "transaction",
    "commit",
    "rollback",
    "session",
    "utilisateur",
    "operateur",
    "op\xE9rateur",
    "suppression",
    "supprimer",
    "supprime",
    "supprim\xE9",
    "supprimee",
    "supprim\xE9e",
    "retrait",
    "retirer",
    "retire",
    "retir\xE9",
    "retour",
    "ajout",
    "ajouter",
    "modification",
    "modifier",
    "quantite",
    "quantit\xE9",
    "mouvement",
    "operation",
    "op\xE9ration",
    "jet",
    "envoye",
    "envoy\xE9",
    "message",
    "stock",
    "depot"
  ].map((word) => word.toLowerCase())
);
var SCENARIO = process.env.PB_DIAG_SCENARIO ?? "";
var MAX_DURATION_MS = 20 * 6e4;
var AFTER_ACTION_MS = 3e3;
var KEY_FR = { Entree: "Entr\xE9e", Echap: "\xC9chap", "Retour arriere": "Retour arri\xE8re", "Page prec.": "Page pr\xE9c.", "Page suiv.": "Page suiv.", caractere: "caract\xE8re" };
function parseHookLine(line) {
  const parts = line.split("	");
  const at = Number(parts[1]);
  if (!Number.isFinite(at)) return null;
  if (parts[0] === "KEY" && parts[2]) return { at, kind: "touche", key: KEY_FR[parts[2]] ?? parts[2].slice(0, 20) };
  if (parts[0] === "CLIC" && parts[2]) return { at, kind: "clic", button: parts[2].slice(0, 10) };
  if (parts[0] === "WIN") return { at, kind: "fenetre", process: maskMessage(parts[2] ?? "", SALE_VOCABULARY).slice(0, 40), title: maskMessage(parts[3] ?? "", SALE_VOCABULARY).slice(0, 120) };
  return null;
}
function journalObserved(line) {
  const entry = parseEntry(line);
  if (!entry) return null;
  const at = Date.parse(`${entry.date}T${entry.time}`);
  if (!Number.isFinite(at)) return null;
  return { at, kind: "journal", logger: entry.logger.slice(-60), level: entry.level, text: `[${maskThread(entry.thread)}] ${maskJournalMessage(entry.message)}` };
}
function keepsValue(value) {
  return /^\d{7}$|^\d{13}$/.test(value) || /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(value);
}
var CODE_WORD = /^(?:[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)+|[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]*)+|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)$/;
function maskJournalMessage(message) {
  const encoded = /^(.*?)((?:%7B|\{)[\s\S]*)$/i.exec(message);
  if (encoded && /%7B|%22/i.test(encoded[2])) {
    let decoded = encoded[2];
    try {
      decoded = decodeURIComponent(encoded[2].replace(/\+/g, " "));
    } catch {
    }
    const pairs = [...decoded.matchAll(/"([^"]{1,60})"\s*:\s*("([^"]*)"|-?\d+(?:[.,]\d+)?|true|false|null)/g)];
    if (pairs.length > 0) {
      const shown = pairs.map((pair) => {
        const raw = pair[3] ?? pair[2];
        const value = keepsValue(raw) ? raw : maskMessage(raw, SALE_VOCABULARY);
        return `${pair[1]}=${value}`;
      });
      return `${maskMessage(encoded[1], SALE_VOCABULARY)} {${shown.join(", ")}}`.slice(0, 600);
    }
  }
  const fields = /* @__PURE__ */ new Set();
  for (const match of message.matchAll(/([A-Za-z_][A-Za-z0-9_]{2,})\s*[=:]/g)) if (CODE_WORD.test(match[1])) fields.add(match[1].toLowerCase());
  for (const match of message.matchAll(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g)) fields.add(match[0].toLowerCase());
  return maskMessage(message, /* @__PURE__ */ new Set([...SALE_VOCABULARY, ...fields]));
}
function collapseScanner(events) {
  const out = [];
  let burst = [];
  const close = () => {
    if (burst.length >= 7) out.push({ at: burst[0].at, kind: "touche", key: "douchette" });
    else out.push(...burst);
    burst = [];
  };
  for (const event of events) {
    const isChar = event.kind === "touche" && event.key === "caract\xE8re";
    if (isChar && burst.length > 0 && event.at - burst[burst.length - 1].at <= 60) {
      burst.push(event);
      continue;
    }
    close();
    if (isChar) burst.push(event);
    else out.push(event);
  }
  close();
  return out;
}
var ACTION_KEYS = /^(Entrée|F\d{1,2}|Échap|Fin|Suppr|Ctrl\+.|Alt\+.|Pavé Entrée)$/;
function afterActions(events, windowMs = AFTER_ACTION_MS) {
  const byAction = /* @__PURE__ */ new Map();
  const journal = events.filter((event) => event.kind === "journal");
  for (const event of events) {
    const action = event.kind === "touche" && ACTION_KEYS.test(event.key) ? `touche ${event.key}` : event.kind === "clic" ? `clic ${event.button}` : null;
    if (!action) continue;
    const slot = byAction.get(action) ?? { count: 0, shapes: /* @__PURE__ */ new Map() };
    slot.count += 1;
    const from = Math.floor(event.at / 1e3) * 1e3;
    for (const line of journal) {
      if (line.at < from || line.at > event.at + windowMs) continue;
      const shape = `${line.logger} - ${line.text}`;
      slot.shapes.set(shape, (slot.shapes.get(shape) ?? 0) + 1);
    }
    byAction.set(action, slot);
  }
  return [...byAction.entries()].map(([action, slot]) => ({ action, count: slot.count, shapes: [...slot.shapes.entries()].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count).slice(0, 25) })).sort((a, b) => b.count - a.count);
}
function two(n) {
  return String(n).padStart(2, "0");
}
function clock(at) {
  const d = new Date(at);
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}
function renderSaleReport(input) {
  const events = collapseScanner([...input.events].sort((a, b) => a.at - b.at));
  const out = [];
  const stamp = (d) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
  out.push("PharmaBoost \u2014 diagnostic \xAB fin de vente \xBB (lecture seule)");
  out.push(`Ordinateur : ${input.computer} \xB7 du ${stamp(input.started)} au ${stamp(input.ended)}`);
  out.push("Aucune valeur n'est \xE9crite ici : chiffres \u2192 9, mots hors vocabulaire \u2192 a/A. Aucune lettre ni aucun chiffre tap\xE9 n'est gard\xE9.");
  out.push("");
  out.push("=".repeat(70), "1. Ce qui a \xE9t\xE9 observ\xE9", "=".repeat(70));
  out.push(`Journal de LGPI suivi : ${input.journal ?? "aucun trouv\xE9 (emplacements : " + JOURNAL_DIRS.join(", ") + ")"}`);
  out.push(`Clavier, souris et fen\xEAtres : ${input.hookOk ? "observ\xE9s" : "NON observ\xE9s (le crochet n'a pas d\xE9marr\xE9)"}`);
  const count = (kind) => events.filter((event) => event.kind === kind).length;
  out.push(`Lignes de journal : ${count("journal")} \xB7 touches : ${count("touche")} \xB7 clics : ${count("clic")} \xB7 changements de fen\xEAtre : ${count("fenetre")}`);
  out.push(`Passages de douchette reconnus : ${events.filter((event) => event.kind === "touche" && event.key === "douchette").length}`);
  out.push("", "=".repeat(70), "2. Ce que le journal \xE9crit juste apr\xE8s chaque action (3 secondes)", "=".repeat(70));
  const after = afterActions(events);
  if (after.length === 0) out.push("(aucune action : ni Entr\xE9e, ni touche F, ni clic)");
  for (const slot of after) {
    out.push(`${slot.action} \u2014 ${slot.count} fois :`);
    if (slot.shapes.length === 0) out.push("   (rien dans le journal)");
    for (const shape of slot.shapes) out.push(`   ${shape.count} \xD7 ${shape.text}`);
  }
  out.push("", "=".repeat(70), "3. Les fen\xEAtres au premier plan (programme \xB7 titre masqu\xE9)", "=".repeat(70));
  const windows = /* @__PURE__ */ new Map();
  for (const event of events) if (event.kind === "fenetre") windows.set(`${event.process} \xB7 ${event.title}`, (windows.get(`${event.process} \xB7 ${event.title}`) ?? 0) + 1);
  if (windows.size === 0) out.push("(aucune)");
  for (const [name, n] of [...windows.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) out.push(`${n} \xD7 ${name}`);
  out.push("", "=".repeat(70), "4. La chronologie compl\xE8te", "=".repeat(70));
  const shown = events.slice(-4e3);
  if (events.length > shown.length) out.push(`(les ${events.length - shown.length} premiers \xE9v\xE8nements sont omis)`);
  for (const event of shown) {
    if (event.kind === "journal") out.push(`${clock(event.at)}  JOURNAL  ${event.level} ${event.logger} - ${event.text}`);
    else if (event.kind === "touche") out.push(`${clock(event.at)}  TOUCHE   ${event.key}`);
    else if (event.kind === "clic") out.push(`${clock(event.at)}  CLIC     ${event.button}`);
    else out.push(`${clock(event.at)}  FEN\xCATRE  ${event.process} \xB7 ${event.title}`);
  }
  if (input.errors.length > 0) out.push("", "=".repeat(70), "5. Erreurs", "=".repeat(70), ...input.errors);
  return out;
}
var OBSERVER_SCRIPT = String.raw`
$code = @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
public static class PharmaBoostObserver {
  private delegate IntPtr Proc(int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] private static extern IntPtr SetWindowsHookEx(int idHook, Proc fn, IntPtr hMod, uint threadId);
  [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
  [DllImport("kernel32.dll")] private static extern IntPtr GetModuleHandle(string name);
  [DllImport("user32.dll")] private static extern short GetKeyState(int key);
  [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  private static Proc keyProc = KeyHook;
  private static Proc mouseProc = MouseHook;
  private static string lastWindow = "";
  private static long Now() { return DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(); }
  private static void Say(string line) { Console.Out.WriteLine(line); Console.Out.Flush(); }
  private static bool Down(int key) { return (GetKeyState(key) & 0x8000) != 0; }
  private static string KeyName(int vk) {
    if (vk >= 0x70 && vk <= 0x7B) return "F" + (vk - 0x6F);
    switch (vk) {
      case 0x0D: return "Entree";
      case 0x1B: return "Echap";
      case 0x23: return "Fin";
      case 0x24: return "Origine";
      case 0x2E: return "Suppr";
      case 0x2D: return "Inser";
      case 0x09: return "Tab";
      case 0x08: return "Retour arriere";
      case 0x21: return "Page prec.";
      case 0x22: return "Page suiv.";
      case 0x25: return "Gauche";
      case 0x26: return "Haut";
      case 0x27: return "Droite";
      case 0x28: return "Bas";
      case 0x10: case 0xA0: case 0xA1: case 0x11: case 0xA2: case 0xA3: case 0x12: case 0xA4: case 0xA5: return null;
    }
    bool ctrl = Down(0x11), alt = Down(0x12);
    if ((ctrl || alt) && ((vk >= 0x41 && vk <= 0x5A) || (vk >= 0x30 && vk <= 0x39))) return (ctrl ? "Ctrl+" : "Alt+") + (char)vk;
    return "caractere";
  }
  private static IntPtr KeyHook(int nCode, IntPtr wParam, IntPtr lParam) {
    if (nCode >= 0 && (wParam == (IntPtr)0x0100 || wParam == (IntPtr)0x0104)) {
      int vk = Marshal.ReadInt32(lParam);
      string name = KeyName(vk);
      if (name != null) Say("KEY\t" + Now() + "\t" + name);
    }
    return CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam);
  }
  private static IntPtr MouseHook(int nCode, IntPtr wParam, IntPtr lParam) {
    if (nCode >= 0) {
      int msg = (int)wParam;
      if (msg == 0x0201) Say("CLIC\t" + Now() + "\tgauche");
      else if (msg == 0x0204) Say("CLIC\t" + Now() + "\tdroit");
      else if (msg == 0x0207) Say("CLIC\t" + Now() + "\tmilieu");
    }
    return CallNextHookEx(IntPtr.Zero, nCode, wParam, lParam);
  }
  private static void Watch() {
    try {
      IntPtr hwnd = GetForegroundWindow();
      StringBuilder text = new StringBuilder(256);
      GetWindowText(hwnd, text, 256);
      uint pid;
      GetWindowThreadProcessId(hwnd, out pid);
      string process = "";
      try { process = Process.GetProcessById((int)pid).ProcessName; } catch (Exception) { }
      string now = process + "\t" + text.ToString().Replace("\t", " ");
      if (now != lastWindow) { lastWindow = now; Say("WIN\t" + Now() + "\t" + now); }
    } catch (Exception) { }
  }
  public static void Run() {
    IntPtr module = GetModuleHandle(null);
    SetWindowsHookEx(13, keyProc, module, 0);
    SetWindowsHookEx(14, mouseProc, module, 0);
    Timer timer = new Timer();
    timer.Interval = 250;
    timer.Tick += delegate { Watch(); };
    timer.Start();
    Say("PRET\t" + Now());
    Application.Run();
  }
}
"@
Add-Type -TypeDefinition $code -ReferencedAssemblies System.Windows.Forms
[PharmaBoostObserver]::Run()
`;
function readFrom(path, from) {
  const size = (0, import_node_fs2.statSync)(path).size;
  if (size <= from) return { text: "", size };
  const fd = (0, import_node_fs2.openSync)(path, "r");
  try {
    const buffer = Buffer.alloc(Math.min(size - from, 8 * 1024 * 1024));
    (0, import_node_fs2.readSync)(fd, buffer, 0, buffer.length, from);
    return { text: buffer.toString("latin1"), size: from + buffer.length };
  } finally {
    (0, import_node_fs2.closeSync)(fd);
  }
}
function findJournal() {
  const dirs = process.env.PB_JOURNAL_DIR ? [process.env.PB_JOURNAL_DIR] : JOURNAL_DIRS;
  for (const dir of dirs) {
    try {
      if (!(0, import_node_fs2.existsSync)(dir)) continue;
      const found = recentJournals(dir, 1);
      if (found[0]) return { dir, path: found[0].path };
    } catch {
    }
  }
  return null;
}
async function observe() {
  const started = /* @__PURE__ */ new Date();
  const events = [];
  const errors = [];
  let journal = findJournal();
  let offset = journal ? (0, import_node_fs2.statSync)(journal.path).size : 0;
  let partial = "";
  const pollJournal = () => {
    try {
      const now = findJournal();
      if (now && journal && now.path !== journal.path) {
        journal = now;
        offset = 0;
        partial = "";
      } else if (now && !journal) {
        journal = now;
        offset = (0, import_node_fs2.statSync)(now.path).size;
      }
      if (!journal) return;
      const { text, size } = readFrom(journal.path, offset);
      offset = size;
      const lines2 = (partial + text).split(/\r?\n/);
      partial = lines2.pop() ?? "";
      for (const line of lines2) {
        const event = journalObserved(line);
        if (event) events.push(event);
      }
    } catch (error) {
      if (errors.length < 20) errors.push(`journal : ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const poll = setInterval(pollJournal, 400);
  let hookOk = false;
  let child = null;
  if (process.platform === "win32") {
    const script = (0, import_node_path2.join)((0, import_node_os2.tmpdir)(), "pharmaboost-observateur.ps1");
    (0, import_node_fs2.writeFileSync)(script, OBSERVER_SCRIPT, "utf8");
    child = (0, import_node_child_process2.spawn)("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let pending = "";
    child.stdout?.on("data", (chunk) => {
      pending += chunk.toString("utf8");
      const lines2 = pending.split(/\r?\n/);
      pending = lines2.pop() ?? "";
      for (const line of lines2) {
        if (line.startsWith("PRET")) {
          hookOk = true;
          console.log("  \u2713 Clavier, souris et fen\xEAtres observ\xE9s.");
          continue;
        }
        const event = parseHookLine(line);
        if (event) events.push(event);
      }
    });
    child.stderr?.on("data", (chunk) => {
      if (errors.length < 20) errors.push(`observateur : ${chunk.toString("utf8").trim().slice(0, 300)}`);
    });
  }
  console.log(journal ? `  \u2713 Journal de LGPI suivi : ${journal.path}` : "  \u2717 Aucun journal de LGPI trouv\xE9 : seuls le clavier, la souris et les fen\xEAtres seront not\xE9s.");
  console.log("");
  if (SCENARIO === "suppression") {
    console.log("MAINTENANT, dans LGPI (une vente d'essai, sans patient) :");
    console.log("  1. Bipez une bo\xEEte de m\xE9dicament, puis un produit de parapharmacie (un produit conseil).");
    console.log("  2. Attendez 10 secondes.");
    console.log("  3. S\xE9lectionnez la ligne du produit de parapharmacie et SUPPRIMEZ-la (touche Suppr), comme d'habitude.");
    console.log("  4. Attendez 10 secondes.");
    console.log("  5. Supprimez aussi la bo\xEEte de m\xE9dicament, puis rebipez-la.");
    console.log("  6. Validez la vente (FIN Valider), ou annulez-la si c'est un essai.");
    console.log("Puis revenez ici et appuyez sur Entr\xE9e.");
  } else {
    console.log("MAINTENANT : faites 2 ou 3 ventes NORMALES dans LGPI, comme d'habitude.");
    console.log("  - au moins une valid\xE9e au CLAVIER (touche de validation de LGPI) ;");
    console.log("  - au moins une valid\xE9e \xE0 la SOURIS (bouton \xAB FIN Valider \xBB) ;");
    console.log("  - si possible, un passage au client suivant sans rien vendre.");
    console.log("Notez l'heure de chaque validation si vous le pouvez. Puis revenez ici et appuyez sur Entr\xE9e.");
  }
  console.log("(Arr\xEAt automatique au bout de 20 minutes.)");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, Number(process.env.PB_DUREE_MS) || MAX_DURATION_MS);
    process.stdin.resume();
    process.stdin.once("data", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  process.stdin.pause();
  pollJournal();
  clearInterval(poll);
  child?.kill();
  const ended = /* @__PURE__ */ new Date();
  const computer = process.env.COMPUTERNAME ?? (0, import_node_os2.hostname)();
  const lines = renderSaleReport({ computer, started, ended, journal: journal?.path ?? null, events, hookOk, errors });
  const file = (0, import_node_path2.join)(desktopDir(), `PharmaBoost-${SCENARIO === "suppression" ? "suppression" : "fin-de-vente"}-${computer}-${ended.getFullYear()}${two(ended.getMonth() + 1)}${two(ended.getDate())}-${two(ended.getHours())}${two(ended.getMinutes())}.txt`);
  (0, import_node_fs2.writeFileSync)(file, "\uFEFF" + lines.join("\r\n") + "\r\n", "utf8");
  console.log("");
  console.log("TERMIN\xC9. Rapport \xE9crit sur le Bureau :");
  console.log("  " + file);
  console.log("Ouvrez-le, relisez-le, puis envoyez-le \xE0 contact@pharmaboost.app.");
}
if (process.env.PB_FIN_VENTE_LANCER === "1") {
  console.log("");
  console.log("PharmaBoost \u2014 diagnostic \xAB fin de vente \xBB");
  console.log("Ce programme OBSERVE seulement : il \xE9crit un rapport sur le Bureau, rien d'autre.");
  console.log("Il ne modifie pas LGPI, n'envoie rien sur Internet, et ne garde ni lettre ni chiffre tap\xE9s, ni aucun nom.");
  console.log("");
  observe().catch((error) => {
    console.log("Le diagnostic a \xE9chou\xE9 : " + (error instanceof Error ? error.message : String(error)));
    console.log("Prenez cette fen\xEAtre en photo.");
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AFTER_ACTION_MS,
  MAX_DURATION_MS,
  OBSERVER_SCRIPT,
  SALE_VOCABULARY,
  afterActions,
  collapseScanner,
  journalObserved,
  maskJournalMessage,
  parseHookLine,
  renderSaleReport
});
