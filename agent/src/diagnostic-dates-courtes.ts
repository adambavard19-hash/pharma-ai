/**
 * Le diagnostic « dates courtes » : où LGPI garde-t-il les dates de péremption du stock, et peut-on les lire sans saisie ?
 *
 * Le pharmacien double-clique le fichier ; en une minute, le programme regarde, en LECTURE SEULE :
 *   1. les fichiers exportés ou édités récemment (CSV, TXT, XLS(X), XML, DBF) aux endroits habituels — Bureau, Documents,
 *      Téléchargements, dossiers de LGPI et d'export — dont l'EN-TÊTE parle de péremption, de lot ou de date (DLU, DLC,
 *      expiration…). Il n'écrit que le nom du fichier, sa taille, sa date et ses noms de colonnes, masqués : jamais une ligne
 *      du fichier ;
 *   2. l'installation de LGPI : les dossiers qui portent son nom, les fichiers de réglage, et le TYPE de base de données qu'ils
 *      citent (jdbc:postgresql, oracle…) — jamais une adresse, un utilisateur ni un mot de passe ;
 *   3. les sources de données ODBC déclarées sur le poste (leur nom et leur pilote) ;
 *   4. le journal de LGPI : les formes de lignes qui parlent de péremption ou de lot, masquées ;
 *   5. les programmes en cours dont le nom évoque LGPI ou une base de données.
 * Puis il écrit le rapport sur le Bureau. Il n'écrit rien d'autre, ne modifie rien, n'envoie rien sur Internet.
 */
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { extname, join } from "node:path";
import { JOURNAL_DIRS, parseEntry } from "./journal-line";
import { desktopDir, maskMessage, maskThread, readTail, recentJournals } from "./lire-journal";

/** Ce qui dit « péremption » dans un en-tête de fichier ou une ligne de journal. */
export const EXPIRY_WORDS = /p[ée]remp|p[ée]rim|\bDLU\b|\bDLC\b|\bDDM\b|expir|date.?exp|\blots?\b|n[°o]\s*lot|num[ée]ro.?de.?lot/i;

/** Les noms de colonnes gardés en clair : le vocabulaire d'un fichier de stock, jamais une valeur. */
export const COLUMN_VOCABULARY = new Set(
  [
    "peremption", "péremption", "peremptions", "péremptions", "perime", "périmé", "perimes", "périmés", "qté", "quantites", "quantités", "date", "dates", "dlu", "dlc", "ddm", "expiration", "exp", "lot", "lots", "numero", "numéro", "num",
    "cip", "cip13", "cip7", "ean", "ean13", "gtin", "code", "libelle", "libellé", "designation", "désignation", "produit", "quantite", "quantité", "qte",
    "stock", "prix", "achat", "vente", "tva", "fournisseur", "rayon", "emplacement", "famille", "laboratoire", "marque", "pvp", "pamp", "ttc", "unite",
    "unité", "reserve", "réserve", "robot", "entree", "entrée", "sortie", "mouvement", "inventaire", "valeur", "total", "courte", "courtes",
  ].map((word) => word.toLowerCase()),
);

/** Les noms de dossiers courants gardés en clair dans un chemin ; un autre nom (celui d'une personne) est masqué. */
const PATH_VOCABULARY = new Set(
  ["users", "utilisateurs", "desktop", "bureau", "documents", "downloads", "telechargements", "téléchargements", "onedrive", "program", "files", "programdata", "lgpi", "pharmagest", "export", "exports", "import", "imports", "edition", "editions", "éditions", "stock", "stocks", "inventaire", "var", "log", "echange", "échange", "partage", "public", "csv", "txt", "xls", "xlsx", "xml", "dbf", "dat", "tsv", "exp", "data", "donnees", "données", "temp", "tmp"].map((word) => word.toLowerCase()),
);
const PATH_WORDS = new Set([...PATH_VOCABULARY, ...COLUMN_VOCABULARY]);

/** Un chemin de fichier, chaque dossier masqué sauf les noms courants : « C:\Users\Aaaaa\Desktop\peremption-9999.csv ». */
export function maskPath(path: string): string {
  return path.split(/([\\/])/).map((part) => (part === "\\" || part === "/" ? part : maskMessage(part.replace(/[_.-]/g, (c) => ` ${c} `), PATH_WORDS).replace(/ ([_.-]) /g, "$1"))).join("");
}

const FILE_TYPES = new Set([".csv", ".txt", ".xls", ".xlsx", ".xml", ".dbf", ".dat", ".exp", ".tsv"]);
const MAX_FILE_BYTES = 80 * 1024 * 1024;
const YEAR_MS = 365 * 86_400_000;

/** L'en-tête d'un fichier (sa première ligne lisible), masqué : les noms de colonnes en clair, toute valeur en a/A/9. */
export function maskHeader(header: string): string {
  return maskMessage(header.replace(/\s+/g, " ").trim(), COLUMN_VOCABULARY).slice(0, 240);
}

/** Le début d'un fichier, lu en partage. Les tableurs (XLSX, compressés) ne se lisent pas : seul leur nom est regardé. */
function readHead(path: string, bytes = 4096): string {
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const n = readSync(fd, buffer, 0, bytes, 0);
    const raw = buffer.subarray(0, n);
    // UTF-16 (exports Windows) : un octet sur deux est nul.
    if (raw.length > 2 && raw[1] === 0) return raw.toString("utf16le");
    // UTF-8 s'il se lit sans caractère cassé, sinon ANSI (latin1) comme la plupart des exports Windows.
    const utf8 = raw.toString("utf8");
    return utf8.includes("\uFFFD") ? raw.toString("latin1") : utf8;
  } finally {
    closeSync(fd);
  }
}

export type FoundFile = { path: string; sizeKb: number; modified: string; header: string; byName: boolean };

/** Un fichier candidat : son en-tête (les 3 premières lignes) ou son nom parle de péremption. */
export function inspectFile(path: string, readText: (path: string) => string = readHead): FoundFile | null {
  const stat = statSync(path);
  if (!stat.isFile() || stat.size === 0 || stat.size > MAX_FILE_BYTES) return null;
  const name = path.split(/[\\/]/).pop() ?? path;
  const byName = EXPIRY_WORDS.test(name.replace(/[_.-]/g, " "));
  let header = "";
  if (![".xlsx", ".xls"].includes(extname(path).toLowerCase())) {
    const lines = readText(path).split(/\r?\n/).slice(0, 3);
    const hit = lines.find((line) => EXPIRY_WORDS.test(line));
    if (hit) header = maskHeader(hit);
  }
  if (!byName && !header) return null;
  const d = stat.mtime;
  const two = (n: number) => String(n).padStart(2, "0");
  return { path, sizeKb: Math.max(1, Math.round(stat.size / 1024)), modified: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`, header, byName };
}

/** Les dossiers où chercher : ceux de la personne, ceux de LGPI et d'export, à la racine des disques. */
export function searchRoots(): string[] {
  const home = homedir();
  const roots = [join(home, "Desktop"), join(home, "Documents"), join(home, "Downloads"), join(home, "OneDrive")];
  for (const drive of ["C:\\", "D:\\", "E:\\"]) {
    try {
      if (!existsSync(drive)) continue;
      for (const name of readdirSync(drive)) {
        if (/lgpi|pharmagest|export|import|edition|stock|inventaire|var|echange|partage|public/i.test(name)) roots.push(join(drive, name));
      }
    } catch {
      // disque illisible
    }
  }
  for (const base of ["C:\\Program Files", "C:\\Program Files (x86)", "C:\\ProgramData"]) {
    try {
      if (existsSync(base)) for (const name of readdirSync(base)) if (/lgpi|pharmagest/i.test(name)) roots.push(join(base, name));
    } catch {
      // ignoré
    }
  }
  return [...new Set(roots)].filter((root) => existsSync(root));
}

/** Parcourt un dossier (profondeur 4, 20 000 entrées au plus) et rend les fichiers candidats modifiés depuis moins d'un an. */
export function walk(root: string, now: number, out: FoundFile[], budget = { left: 20000 }, depth = 0): void {
  if (depth > 4 || budget.left <= 0) return;
  let names: string[];
  try {
    names = readdirSync(root);
  } catch {
    return;
  }
  for (const name of names) {
    if (budget.left-- <= 0) return;
    if (/^(windows|\$recycle\.bin|node_modules|appdata|system volume information)$/i.test(name)) continue;
    const path = join(root, name);
    try {
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path, now, out, budget, depth + 1);
      else if (FILE_TYPES.has(extname(name).toLowerCase()) && now - stat.mtimeMs < YEAR_MS) {
        const found = inspectFile(path);
        if (found) out.push(found);
      }
    } catch {
      // fichier verrouillé ou illisible
    }
  }
}

/** Dans un fichier de réglage : le TYPE de base citée (jdbc:postgresql, oracle…), jamais l'adresse ni l'identifiant. */
export function databaseKinds(text: string): string[] {
  const kinds = new Set<string>();
  for (const match of text.matchAll(/jdbc:([a-z0-9]+)/gi)) kinds.add(`jdbc:${match[1]!.toLowerCase()}`);
  for (const word of ["postgres", "oracle", "sqlserver", "mysql", "firebird", "hsqldb", "derby", "sqlite", "informix", "progress", "4d"]) {
    if (new RegExp(`\\b${word}`, "i").test(text)) kinds.add(word);
  }
  return [...kinds];
}

function lgpiInstallation(errors: string[]): string[] {
  const out: string[] = [];
  const bases = ["C:\\", "D:\\", "C:\\Program Files", "C:\\Program Files (x86)", "C:\\ProgramData"];
  for (const base of bases) {
    let names: string[] = [];
    try {
      if (existsSync(base)) names = readdirSync(base).filter((name) => /lgpi|pharmagest/i.test(name));
    } catch (error) {
      errors.push(`${base} : ${error instanceof Error ? error.message : String(error)}`);
    }
    for (const name of names) {
      const dir = join(base, name);
      out.push(`Dossier : ${maskPath(dir)}`);
      const settings: string[] = [];
      const scan = (path: string, depth: number) => {
        if (depth > 2 || settings.length > 40) return;
        try {
          for (const entry of readdirSync(path)) {
            const full = join(path, entry);
            const stat = statSync(full);
            if (stat.isDirectory()) scan(full, depth + 1);
            else if (/\.(properties|ini|xml|conf|cfg|json)$/i.test(entry) && stat.size < 2 * 1024 * 1024) {
              const kinds = databaseKinds(readTail(full, 512 * 1024) ?? "");
              settings.push(`   ${maskPath(full.slice(dir.length + 1))}${kinds.length ? ` → base citée : ${kinds.join(", ")}` : ""}`);
            }
          }
        } catch {
          // dossier verrouillé
        }
      };
      scan(dir, 0);
      out.push(...settings.slice(0, 40));
    }
  }
  return out;
}

function odbcSources(): string[] {
  if (process.platform !== "win32") return [];
  const out: string[] = [];
  for (const key of ["HKLM\\SOFTWARE\\ODBC\\ODBC.INI\\ODBC Data Sources", "HKCU\\SOFTWARE\\ODBC\\ODBC.INI\\ODBC Data Sources", "HKLM\\SOFTWARE\\WOW6432Node\\ODBC\\ODBC.INI\\ODBC Data Sources"]) {
    try {
      const text = execFileSync("reg.exe", ["query", key], { encoding: "latin1", timeout: 8000 });
      for (const line of text.split(/\r?\n/)) {
        const match = /^\s+(.+?)\s+REG_SZ\s+(.+)$/.exec(line);
        if (match) out.push(`${match[1]} · pilote : ${match[2]}`);
      }
    } catch {
      // clé absente
    }
  }
  return [...new Set(out)];
}

function runningPrograms(): string[] {
  if (process.platform !== "win32") return [];
  try {
    const text = execFileSync("tasklist.exe", ["/fo", "csv", "/nh"], { encoding: "latin1", timeout: 10000 });
    const names = new Set<string>();
    for (const line of text.split(/\r?\n/)) {
      const name = /^"([^"]+)"/.exec(line)?.[1];
      if (name && /lgpi|pharmagest|java|postgres|oracle|sqlservr|mysql|firebird|rowa|odbc/i.test(name)) names.add(name);
    }
    return [...names];
  } catch {
    return [];
  }
}

function journalShapes(errors: string[]): string[] {
  const shapes = new Map<string, number>();
  for (const dir of process.env.PB_JOURNAL_DIR ? [process.env.PB_JOURNAL_DIR] : JOURNAL_DIRS) {
    try {
      if (!existsSync(dir)) continue;
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
  return [...shapes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([shape, n]) => `${n} × ${shape}`);
}

export function renderExpiryReport(input: { computer: string; now: Date; roots: string[]; files: FoundFile[]; install: string[]; odbc: string[]; programs: string[]; journal: string[]; errors: string[] }): string[] {
  const out: string[] = [];
  const bar = "=".repeat(70);
  out.push("PharmaBoost — diagnostic « dates courtes » (lecture seule)");
  out.push(`Ordinateur : ${input.computer} · ${input.now.toLocaleString("fr-FR")}`);
  out.push("Aucune ligne de fichier n'est écrite ici : seulement des noms de fichiers et de colonnes, les valeurs masquées (9, a/A).");
  out.push("", bar, "1. Fichiers récents qui parlent de péremption, de lot ou de date", bar);
  out.push(`Dossiers parcourus : ${input.roots.length ? input.roots.map(maskPath).join(" · ") : "(aucun)"}`);
  if (input.files.length === 0) out.push("(aucun fichier trouvé : LGPI n'a sans doute jamais exporté les péremptions sur ce poste)");
  for (const file of input.files.slice(0, 60)) {
    out.push(`${maskPath(file.path)} · ${file.sizeKb} Ko · modifié le ${file.modified}${file.byName ? " · (nom évocateur)" : ""}`);
    if (file.header) out.push(`   colonnes : ${file.header}`);
  }
  out.push("", bar, "2. L'installation de LGPI sur ce poste (fichiers de réglage, type de base cité)", bar);
  out.push(...(input.install.length ? input.install : ["(aucun dossier LGPI ou Pharmagest sur ce poste : LGPI tourne peut-être sur un serveur)"]));
  out.push("", bar, "3. Sources de données ODBC déclarées", bar);
  out.push(...(input.odbc.length ? input.odbc : ["(aucune)"]));
  out.push("", bar, "4. Programmes en cours (LGPI, Java, bases de données)", bar);
  out.push(...(input.programs.length ? input.programs : ["(aucun)"]));
  out.push("", bar, "5. Le journal de LGPI : lignes qui parlent de péremption ou de lot (masquées)", bar);
  out.push(...(input.journal.length ? input.journal : ["(aucune)"]));
  out.push("", bar, "6. Ce que cela suggère", bar);
  if (input.files.some((file) => file.header)) out.push(" - Un fichier porte des colonnes de péremption : s'il vient de LGPI, PharmaBoost peut le lire comme le fichier de stock.");
  else out.push(" - Aucun export de péremptions trouvé : demander à LGPI (menu Éditions / Stock) une édition « péremptions » ou « dates courtes » en CSV, puis relancer ce diagnostic.");
  if (input.install.some((line) => line.includes("base citée"))) out.push(" - LGPI cite une base de données : une lecture directe serait possible avec l'accord de Pharmagest (jamais sans).");
  if (input.errors.length) out.push("", bar, "7. Erreurs", bar, ...input.errors.slice(0, 30));
  return out;
}

export function runExpiryDiagnostic(now = new Date()): { file: string; lines: string[] } {
  const errors: string[] = [];
  const roots = process.env.PB_RACINES ? process.env.PB_RACINES.split(";") : searchRoots();
  const files: FoundFile[] = [];
  const budget = { left: 60000 };
  for (const root of roots) walk(root, now.getTime(), files, budget);
  files.sort((a, b) => Number(Boolean(b.header)) - Number(Boolean(a.header)) || b.modified.localeCompare(a.modified));
  const computer = process.env.COMPUTERNAME ?? hostname();
  const lines = renderExpiryReport({ computer, now, roots, files, install: lgpiInstallation(errors), odbc: odbcSources(), programs: runningPrograms(), journal: journalShapes(errors), errors });
  const two = (n: number) => String(n).padStart(2, "0");
  const file = join(desktopDir(), `PharmaBoost-dates-courtes-${computer}-${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}.txt`);
  writeFileSync(file, "\uFEFF" + lines.join("\r\n") + "\r\n", "utf8");
  return { file, lines };
}

if (process.env.PB_DATES_COURTES_LANCER === "1") {
  console.log("");
  console.log("PharmaBoost — diagnostic « dates courtes »");
  console.log("Ce programme LIT seulement : il cherche où LGPI garde les dates de péremption et écrit un rapport sur le Bureau.");
  console.log("Il ne modifie rien, n'envoie rien sur Internet, et n'écrit aucune ligne de fichier (seulement des noms de colonnes).");
  console.log("Recherche en cours (une à deux minutes)…");
  try {
    const { file } = runExpiryDiagnostic();
    console.log("TERMINÉ. Rapport écrit sur le Bureau :");
    console.log("  " + file);
    console.log("Ouvrez-le, relisez-le, puis envoyez-le à contact@pharmaboost.app.");
  } catch (error) {
    console.log("Le diagnostic a échoué : " + (error instanceof Error ? error.message : String(error)));
    console.log("Prenez cette fenêtre en photo.");
  }
}
