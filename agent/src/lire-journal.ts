/**
 * Lecture du journal de LGPI, pour savoir comment le logiciel parle au robot. LECTURE SEULE.
 *
 * Le diagnostic du 9 octobre 2026 (POSTE5) a montré que LGPI tient un journal en clair de l'échange avec l'automate :
 * `C:\var\log\lgpi\application\lgpi.AAAA-MM-JJ.log`, des lignes « Réception message en provenance de l'automate »,
 * des demandes de sortie (OutputRequest), des lignes « Code produit 9999999 ». Ce programme lit la FIN de ces journaux et
 * écrit un rapport sur le Bureau qui dit :
 *
 *   1. quelles FORMES de lignes parlent du robot, combien de fois, de quelle heure à quelle heure ;
 *   2. les dernières de ces lignes, MASQUÉES (jamais une valeur : chiffres → 9, mots → a/A) ;
 *   3. les codes produit que des motifs candidats y trouvent, avec l'heure — des codes de produit, jamais un patient.
 *
 * Avec cela, on écrit le motif exact que le poste de caisse surveillera (`--robot`), sans rien deviner.
 *
 * Ce que ce programme NE FAIT PAS : il n'écrit rien dans LGPI ni dans le robot, n'envoie rien sur Internet, n'installe rien ;
 * il ne lit que les journaux de LGPI, en partage (LGPI continue d'y écrire), et n'écrit que le rapport. Les lignes qui ne
 * commencent pas par une date (la suite d'une trace d'erreur) ne sont jamais lues : c'est là que passent les noms.
 */
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";

/** Les dossiers où LGPI tient son journal d'application. */
export const JOURNAL_DIRS = ["C:\\var\\log\\lgpi\\application", "D:\\var\\log\\lgpi\\application", "C:\\var\\log\\lgpi", "D:\\var\\log\\lgpi"];
/** Combien de journaux (les plus récents) on lit, et combien d'octets de la fin de chacun. */
export const MAX_FILES = 3;
export const TAIL_BYTES = 6 * 1024 * 1024;

/** Ce qui désigne l'échange avec le robot dans une ligne de journal. */
export const ROBOT_LINE = /automate|robot|rowa|outputrequest|inputrequest|mach4|cdapi|wwks|code produit/i;

/** Une ligne de journal commence par sa date : tout le reste est la suite d'une trace d'erreur, jamais lue. */
const ENTRY = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})[,.]\d{3}\s+(\w+)\s+\[([^\]]*)\]\s+(\S+)\s+-\s+(.*)$/;

export type Entry = { date: string; time: string; level: string; thread: string; logger: string; message: string };

export function parseEntry(line: string): Entry | null {
  const match = ENTRY.exec(line);
  return match ? { date: match[1], time: match[2], level: match[3], thread: match[4], logger: match[5], message: match[6] } : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Le masquage : on voit la FORME d'une ligne, jamais une valeur
// ---------------------------------------------------------------------------------------------------------------

/**
 * Les seuls mots gardés en clair : le vocabulaire générique d'un échange. Tout autre mot — un nom, un produit — est masqué.
 * On ne devine pas qu'un mot est « du protocole » parce qu'il revient souvent : un nom de patient revient sur chaque ligne.
 */
const VOCABULARY = new Set(
  [
    "pick", "picking", "request", "response", "reply", "answer", "article", "product", "produit", "item", "status", "state", "order", "commande",
    "stock", "input", "output", "store", "delivery", "deliver", "dispense", "dispensing", "sortie", "entree", "quantity", "qty", "quantite", "count",
    "number", "message", "send", "sent", "recv", "receive", "received", "connect", "connected", "disconnect", "disconnected", "tcp", "socket", "port",
    "host", "start", "started", "stop", "stopped", "begin", "end", "true", "false", "null", "none", "version", "type", "code", "error", "erreur", "warn",
    "warning", "info", "debug", "trace", "lgpi", "rowa", "cdapi", "wwks", "robot", "automate", "ack", "nak", "timeout", "retry", "busy", "ready", "idle",
    "done", "failed", "success", "unknown", "inconnu", "cip", "ean", "gtin", "pzn", "mach4", "keepalive", "outputrequest", "inputrequest", "articleid",
    // Le français d'un message de journal : les mots de liaison, jamais un nom propre.
    "reçu", "recu", "reception", "réception", "envoi", "envoyé", "envoye", "message", "provenance", "destination", "dans", "pour", "avec", "sans",
    "pas", "plus", "aucun", "aucune", "une", "des", "les", "aux", "sur", "par", "est", "sont", "été", "ete", "cette", "ces", "tous", "toutes", "demande",
    "réponse", "reponse", "emplacement", "casier", "disponible", "indisponible", "trouvé", "trouve", "lecture", "écriture", "ecriture", "fin", "début", "debut",
  ].map((word) => word.toLowerCase()),
);

/** Un nom de classe ou de structure (OutputRequest, ArticleLine) : jamais un nom de personne, qui n'a pas deux majuscules. */
const CLASS_NAME = /^[A-Z][a-z0-9]+(?:[A-Z][A-Za-z0-9]*)+$/;
/** Un nom de champ (articleId, quantity) : en minuscules avec des majuscules internes. */
const FIELD_NAME = /^[a-z][a-z0-9]*(?:[A-Z][a-z0-9]*)*$/;

function shapeOf(word: string): string {
  return word.replace(/[a-zà-ÿ]/g, "a").replace(/[A-ZÀ-Ý]/g, "A");
}

/**
 * Le message d'une ligne sans ses VALEURS. Sont gardés : le vocabulaire générique, les noms de classes suivis de « ( » et les
 * noms de champs suivis de « = » (ce sont des identifiants du code de LGPI : ils disent OÙ est le code produit). Tout le reste
 * est masqué (mots → a/A), et les chiffres deviennent « 9 » — on voit combien il y en a, jamais lesquels.
 */
export function maskMessage(message: string): string {
  const masked = message.replace(/[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_]{2,}/g, (word, offset: number) => {
    const next = message[offset + word.length];
    if (VOCABULARY.has(word.toLowerCase())) return word;
    if (next === "(" && CLASS_NAME.test(word)) return word;
    if (next === "=" && FIELD_NAME.test(word)) return word;
    return shapeOf(word);
  });
  return masked.replace(/\d/g, "9").slice(0, 260);
}

/** Le nom d'un fil d'exécution, sans ses valeurs : on voit sa forme (les chiffres et les mots hors vocabulaire sont masqués). */
export function maskThread(thread: string): string {
  return thread.replace(/[A-Za-zÀ-ÿ_]{3,}/g, (word) => (VOCABULARY.has(word.toLowerCase()) ? word : shapeOf(word))).replace(/\d/g, "9");
}

/** Une entrée, masquée : son heure et son niveau restent lisibles, rien d'autre ne l'est. */
export function maskEntry(entry: Entry): string {
  return `${entry.time} ${entry.level} [${maskThread(entry.thread)}] ${entry.logger} - ${maskMessage(entry.message)}`;
}

/** La forme d'une ligne, sans l'heure : deux lignes de même forme se comptent ensemble. */
export function shapeOfEntry(entry: Entry): string {
  return `${entry.level} [${maskThread(entry.thread)}] ${entry.logger} - ${maskMessage(entry.message)}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Les motifs candidats : où est le code produit ?
// ---------------------------------------------------------------------------------------------------------------

export type Candidate = { id: string; label: string; regex: RegExp };

/**
 * Des motifs à essayer sur les vraies lignes. Chacun capture un code produit (7 chiffres : CIP7 ; 13 chiffres : CIP13/EAN)
 * ancré sur un MOT du journal — jamais un simple nombre, qui pourrait être autre chose (un numéro de sécurité sociale a quinze chiffres).
 */
export const CANDIDATES: Candidate[] = [
  { id: "code-produit", label: "« Code produit 9999999 »", regex: /Code produit\s+(\d{7}|\d{13})\b/g },
  { id: "article", label: "article=… / articleId=… / articleCode=…", regex: /article(?:Id|Code)?\s*[=:]\s*"?(\d{7}|\d{13})\b/gi },
  { id: "cip-ean", label: "cip=… / ean=… / gtin=…", regex: /\b(?:cip|ean|gtin)\w*\s*[=:]\s*"?(\d{7}|\d{13})\b/gi },
];

export type CodeHit = { date: string; time: string; code: string };

export function findCodes(entry: Entry, candidate: Candidate): string[] {
  const codes: string[] = [];
  const regex = new RegExp(candidate.regex.source, candidate.regex.flags);
  for (let match = regex.exec(entry.message); match; match = regex.exec(entry.message)) {
    if (match[0] === "") regex.lastIndex += 1;
    if (match[1] && !codes.includes(match[1])) codes.push(match[1]);
  }
  return codes;
}

// ---------------------------------------------------------------------------------------------------------------
// L'analyse
// ---------------------------------------------------------------------------------------------------------------

export type Shape = { shape: string; count: number; first: string; last: string };

export type Analysis = {
  entriesRead: number;
  robotEntries: number;
  shapes: Shape[];
  lastLines: string[];
  candidates: { candidate: Candidate; total: number; distinct: number; recent: CodeHit[] }[];
  days: { date: string; robotEntries: number }[];
};

/**
 * Ce que disent les journaux, sans une valeur. Les lignes sont celles de TOUS les fichiers lus, de la plus ancienne à la plus
 * récente ; `lastLines` garde les `lastCount` dernières lignes du robot, masquées.
 */
export function analyse(texts: string[], options: { lastCount?: number; shapeCount?: number; recentCodes?: number } = {}): Analysis {
  const lastCount = options.lastCount ?? 40;
  const shapeCount = options.shapeCount ?? 30;
  const recentCodes = options.recentCodes ?? 15;
  const shapes = new Map<string, Shape>();
  const robot: Entry[] = [];
  const days = new Map<string, number>();
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
    const hits: CodeHit[] = [];
    for (const entry of robot) for (const code of findCodes(entry, candidate)) hits.push({ date: entry.date, time: entry.time, code });
    return { candidate, total: hits.length, distinct: new Set(hits.map((hit) => hit.code)).size, recent: hits.slice(-recentCodes) };
  });

  return {
    entriesRead,
    robotEntries: robot.length,
    shapes: [...shapes.values()].sort((a, b) => b.count - a.count || a.first.localeCompare(b.first)).slice(0, shapeCount),
    lastLines: robot.slice(-lastCount).map((entry) => `${entry.date} ${maskEntry(entry)}`),
    candidates,
    days: [...days.entries()].map(([date, robotEntries]) => ({ date, robotEntries })).sort((a, b) => a.date.localeCompare(b.date)),
  };
}

export type FileInfo = { name: string; sizeKb: number; modified: string };

export function renderReport(input: { computer: string; now: Date; dir: string | null; files: FileInfo[]; analysis: Analysis | null; errors: string[] }): string[] {
  const out: string[] = [];
  const two = (n: number) => String(n).padStart(2, "0");
  const stamp = `${input.now.getFullYear()}-${two(input.now.getMonth() + 1)}-${two(input.now.getDate())} ${two(input.now.getHours())}:${two(input.now.getMinutes())}`;
  out.push("PharmaBoost — lecture du journal de LGPI (lecture seule)");
  out.push(`Ordinateur : ${input.computer} · ${stamp}`);
  out.push("Aucune valeur n'est écrite ici : les chiffres sont des 9, les mots des a/A. Seuls les CODES PRODUIT trouvés par les motifs sont listés.");
  out.push("");
  out.push("=".repeat(70), "1. Les journaux lus", "=".repeat(70));
  if (!input.dir) {
    out.push("Aucun journal de LGPI trouvé aux emplacements connus :");
    for (const dir of JOURNAL_DIRS) out.push(` - ${dir}`);
  } else {
    out.push(`Dossier : ${input.dir}`);
    for (const file of input.files) out.push(` - ${file.name} · ${file.sizeKb} Ko · ${file.modified}`);
  }
  const analysis = input.analysis;
  if (analysis) {
    out.push(`Lignes lues : ${analysis.entriesRead} · lignes qui parlent du robot : ${analysis.robotEntries}`);
    for (const day of analysis.days) out.push(` - ${day.date} : ${day.robotEntries} ligne(s) du robot`);

    out.push("", "=".repeat(70), "2. Les formes de lignes du robot, les plus fréquentes (forme · nombre · première → dernière heure)", "=".repeat(70));
    if (analysis.shapes.length === 0) out.push("(aucune ligne du robot dans la fin de ces journaux)");
    for (const shape of analysis.shapes) out.push(`${shape.count} × ${shape.shape}`, `      du ${shape.first} au ${shape.last}`);

    out.push("", "=".repeat(70), "3. Les dernières lignes du robot, masquées", "=".repeat(70));
    if (analysis.lastLines.length === 0) out.push("(aucune)");
    out.push(...analysis.lastLines);

    out.push("", "=".repeat(70), "4. Les codes produit que chaque motif trouve (ce sont des produits, pas des patients)", "=".repeat(70));
    for (const result of analysis.candidates) {
      out.push(`Motif ${result.candidate.id} — ${result.candidate.label} : ${result.total} code(s) trouvé(s), ${result.distinct} différent(s).`);
      for (const hit of result.recent) out.push(`   ${hit.date} ${hit.time} → ${hit.code}`);
    }

    out.push("", "=".repeat(70), "5. Ce que cela suggère", "=".repeat(70));
    const best = analysis.candidates.filter((result) => result.total > 0).sort((a, b) => b.total - a.total)[0];
    if (analysis.robotEntries === 0) out.push(" - Aucune ligne du robot : ces journaux ne portent pas l'échange. Le rapport du diagnostic complet reste la référence.");
    else if (!best) out.push(" - Le journal parle du robot, mais aucun motif ne trouve de code produit : la forme des lignes (section 2) dit où chercher.");
    else out.push(` - Le motif « ${best.candidate.id} » trouve des codes produit (${best.total}) : comparez les derniers codes et leurs heures avec la vente de test.`);
    out.push(" - Une vente de test d'UNE boîte connue, faite juste avant cette lecture, doit apparaître en bas de la section 4, à la minute près.");
  }
  if (input.errors.length > 0) {
    out.push("", "=".repeat(70), "6. Erreurs rencontrées pendant la lecture", "=".repeat(70), ...input.errors);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Le disque : lire la fin des journaux, écrire le rapport
// ---------------------------------------------------------------------------------------------------------------

/** La fin d'un fichier, lue en partage (LGPI y écrit encore). `null` si illisible. */
export function readTail(path: string, bytes: number): string | null {
  let fd: number | null = null;
  try {
    const size = statSync(path).size;
    const length = Math.min(bytes, size);
    const buffer = Buffer.alloc(length);
    fd = openSync(path, "r");
    readSync(fd, buffer, 0, length, size - length);
    // Les journaux Windows sont souvent en ANSI : latin1 garde chaque octet (les chiffres et les lettres de base sont les mêmes).
    return buffer.toString("latin1");
  } catch {
    return null;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Les journaux d'application les plus récents d'un dossier (`lgpi.AAAA-MM-JJ.log`, `lgpi.log`…), du plus ancien au plus récent. */
export function recentJournals(dir: string, max = MAX_FILES): { path: string; info: FileInfo }[] {
  const found = readdirSync(dir)
    .filter((name) => /^lgpi.*\.log$/i.test(name))
    .map((name) => {
      const path = join(dir, name);
      const stat = statSync(path);
      return { path, info: { name, sizeKb: Math.max(1, Math.round(stat.size / 1024)), modified: formatDate(stat.mtime) }, mtime: stat.mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, max)
    .reverse();
  return found.map(({ path, info }) => ({ path, info }));
}

/** Le Bureau de la personne connectée (il peut être redirigé vers OneDrive) ; à défaut, son dossier personnel. */
export function desktopDir(): string {
  if (process.env.PB_BUREAU) return process.env.PB_BUREAU;
  if (process.platform === "win32") {
    try {
      const found = execFileSync("powershell.exe", ["-NoProfile", "-Command", "[Environment]::GetFolderPath('Desktop')"], { encoding: "utf8", timeout: 8000 }).trim();
      if (found && existsSync(found)) return found;
    } catch {
      // repli ci-dessous
    }
  }
  const classic = join(homedir(), "Desktop");
  return existsSync(classic) ? classic : homedir();
}

export function run(options: { dirs?: string[]; now?: Date } = {}): { file: string; lines: string[] } {
  const now = options.now ?? new Date();
  const errors: string[] = [];
  let dir: string | null = null;
  let journals: { path: string; info: FileInfo }[] = [];
  // PB_JOURNAL_DIR : dossier choisi par les essais automatiques, pour qu'ils ne lisent jamais un vrai journal.
  const dirs = options.dirs ?? (process.env.PB_JOURNAL_DIR ? [process.env.PB_JOURNAL_DIR] : JOURNAL_DIRS);
  for (const candidate of dirs) {
    try {
      if (!existsSync(candidate)) continue;
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
  const texts: string[] = [];
  for (const journal of journals) {
    const text = readTail(journal.path, TAIL_BYTES);
    if (text === null) errors.push(`${journal.info.name} : illisible`);
    else texts.push(text);
  }
  const analysis = dir ? analyse(texts) : null;
  const lines = renderReport({ computer: process.env.COMPUTERNAME ?? hostname(), now, dir, files: journals.map((journal) => journal.info), analysis, errors });
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const file = join(desktopDir(), `PharmaBoost-lecture-journal-${process.env.COMPUTERNAME ?? hostname()}-${stamp}.txt`);
  // La marque UTF-8 en tête : le Bloc-notes de Windows lit alors les accents.
  writeFileSync(file, "\uFEFF" + lines.join("\r\n") + "\r\n", "utf8");
  return { file, lines };
}

/**
 * Lancé par le fichier à double-cliquer, qui pose PB_LIRE_JOURNAL_LANCER. Importé par les essais, ce module ne lance rien.
 * (Dans `node -e`, `require.main` n'existe pas : on ne s'y fie pas.)
 */
if (process.env.PB_LIRE_JOURNAL_LANCER === "1") {
  console.log("");
  console.log("PharmaBoost — lecture du journal de LGPI");
  console.log("Ce programme LIT seulement : il écrit un rapport sur le Bureau, rien d'autre.");
  console.log("Il ne modifie ni votre logiciel ni le robot, n'envoie rien sur Internet, et ne montre aucune valeur");
  console.log("(aucune donnée patient) : seuls les codes de PRODUIT que le journal cite sont listés.");
  console.log("");
  try {
    const { file, lines } = run();
    console.log(lines.slice(0, 1).join(""));
    console.log("TERMINÉ. Rapport écrit sur le Bureau :");
    console.log("  " + file);
    console.log("Ouvrez-le, relisez-le, puis envoyez-le à contact@pharmaboost.app.");
  } catch (error) {
    console.log("La lecture a échoué : " + (error instanceof Error ? error.message : String(error)));
    console.log("Prenez cette fenêtre en photo.");
  }
}
