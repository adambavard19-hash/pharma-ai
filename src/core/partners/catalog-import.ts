import { isValidCip13, isValidEan13 } from "@/core/stock/cip";

/**
 * Import d'un catalogue partenaire collé depuis un tableur (CSV).
 *
 * Tant qu'un partenaire ne publie pas d'API, son catalogue est saisi ou
 * importé dans la console. Ce module est pur : il lit le texte, valide chaque
 * ligne et dit précisément ce qui ne va pas. Il ne complète rien et n'invente
 * rien — une ligne sans nom, un prix illisible ou une gamme inconnue sont
 * refusés et signalés avec leur numéro de ligne, jamais corrigés en silence.
 */

export type CatalogImportField = "name" | "range" | "ean" | "cip13" | "packaging" | "proPrice" | "publicPrice" | "externalRef" | "active";

export type CatalogImportColumn = {
  field: CatalogImportField;
  /** Nom de colonne documenté, à recopier tel quel en en-tête. */
  header: string;
  required: boolean;
  /** Autres intitulés reconnus (comparés sans accents ni casse). */
  aliases: string[];
  hint: string;
};

export const CATALOG_IMPORT_COLUMNS: CatalogImportColumn[] = [
  { field: "name", header: "nom", required: true, aliases: ["produit", "libelle", "designation", "nom_produit", "name"], hint: "Nom du produit, obligatoire." },
  { field: "range", header: "gamme", required: false, aliases: ["gamme_produit", "range"], hint: "Nom exact d'une gamme déjà créée dans la fiche marque ; vide : sans gamme." },
  { field: "ean", header: "ean", required: false, aliases: ["ean13", "code_ean", "gtin", "code_barre", "code_barres"], hint: "13 chiffres, clé de contrôle vérifiée." },
  { field: "cip13", header: "cip13", required: false, aliases: ["cip", "code_cip", "acl"], hint: "13 chiffres commençant par 34009, clé vérifiée." },
  { field: "packaging", header: "conditionnement", required: false, aliases: ["format", "contenance", "packaging"], hint: "Ex. « Tube 50 ml »." },
  { field: "proPrice", header: "prix_pro_ht", required: false, aliases: ["prix_pro", "prix_professionnel", "prix_achat_ht", "pa_ht", "prix_ht"], hint: "En euros, « 12,90 » ou « 12.90 »." },
  { field: "publicPrice", header: "prix_public_conseille", required: false, aliases: ["prix_public", "ppc", "prix_conseille", "pvc", "prix_ttc"], hint: "En euros TTC." },
  { field: "externalRef", header: "reference", required: false, aliases: ["ref", "reference_partenaire", "ref_partenaire", "code_article", "sku"], hint: "Référence du produit chez le partenaire." },
  { field: "active", header: "actif", required: false, aliases: ["active", "statut", "disponible"], hint: "oui / non ; vide : oui." },
];

/** Au-delà, on demande de découper : une erreur de collage ne doit pas créer des milliers de fiches. */
export const CATALOG_IMPORT_MAX_ROWS = 2000;

const MAX_NAME = 300;
const MAX_TEXT = 200;
/** 100 000 € : au-delà, c'est une faute de frappe (centimes saisis en euros, colonne décalée). */
const MAX_PRICE_CENTS = 10_000_000;

export type CatalogImportRange = { id: string; name: string };

export type CatalogImportRow = {
  /** Numéro de ligne dans le texte collé (1 = l'en-tête). */
  line: number;
  name: string;
  rangeId: string | null;
  ean: string | null;
  cip13: string | null;
  packaging: string | null;
  proPriceCents: number | null;
  publicPriceCents: number | null;
  externalRef: string | null;
  isActive: boolean;
};

export type CatalogImportError = {
  /** Null : erreur qui concerne tout le texte (en-tête, taille). */
  line: number | null;
  column: string | null;
  message: string;
};

export type CatalogImportResult = {
  rows: CatalogImportRow[];
  errors: CatalogImportError[];
  /** En-têtes présents mais non reconnus : ignorés, signalés. */
  ignoredColumns: string[];
  /**
   * Les colonnes présentes dans l'en-tête. Une mise à jour ne touche qu'elles :
   * un fichier sans colonne de prix ne doit pas effacer les prix existants.
   */
  columns: CatalogImportField[];
  /** Lignes de données non vides lues (valides ou non). */
  dataLines: number;
};

/** « Prix public conseillé » → « prix_public_conseille ». */
export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Le séparateur le plus présent dans l'en-tête : point-virgule (Excel français), tabulation (copier-coller) ou virgule. */
export function detectDelimiter(headerLine: string): ";" | "\t" | "," {
  const counts = { ";": 0, "\t": 0, ",": 0 } as Record<";" | "\t" | ",", number>;
  let quoted = false;
  for (const char of headerLine) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === ";" || char === "\t" || char === ",")) counts[char] += 1;
  }
  if (counts["\t"] > 0 && counts["\t"] >= counts[";"] && counts["\t"] >= counts[","]) return "\t";
  if (counts[";"] > 0 && counts[";"] >= counts[","]) return ";";
  return counts[","] > 0 ? "," : ";";
}

/**
 * Découpe un CSV en enregistrements, guillemets compris (« "Crème, 50 ml" »,
 * guillemets doublés, retour à la ligne dans un champ). Chaque enregistrement
 * garde le numéro de la ligne où il commence.
 */
export function splitCsv(text: string, delimiter: string): { line: number; cells: string[] }[] {
  const source = text.replace(/^\uFEFF/, "");
  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  const endRecord = () => {
    cells.push(cell);
    records.push({ line: recordLine, cells });
    cells = [];
    cell = "";
  };

  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index++;
        } else quoted = false;
      } else {
        if (char === "\n") line++;
        cell += char;
      }
      continue;
    }
    if (char === '"' && cell.trim() === "") {
      quoted = true;
      cell = "";
    } else if (char === delimiter) {
      cells.push(cell);
      cell = "";
    } else if (char === "\r") {
      // Fin de ligne Windows : le « \n » qui suit clôt l'enregistrement.
    } else if (char === "\n") {
      endRecord();
      line++;
      recordLine = line;
    } else cell += char;
  }
  if (cell !== "" || cells.length > 0) endRecord();
  return records;
}

/** « 12,90 € », « 1 234,50 », « 12.9 » → centimes. Vide → null sans erreur. Illisible → erreur. */
export function parseEuroCents(raw: string): { value: number | null; error: string | null } {
  const text = raw.replace(/[€\s]/g, "");
  if (text === "") return { value: null, error: null };
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text)) return { value: null, error: `Prix illisible : « ${raw.trim()} » (attendu : 12,90).` };
  const value = Math.round(Number(text.replace(",", ".")) * 100);
  if (value > MAX_PRICE_CENTS) return { value: null, error: `Prix invraisemblable : « ${raw.trim()} ».` };
  return { value, error: null };
}

const TRUE_WORDS = new Set(["oui", "o", "1", "true", "vrai", "x", "actif", "yes", "y"]);
const FALSE_WORDS = new Set(["non", "n", "0", "false", "faux", "inactif", "no"]);

export function parseActive(raw: string): { value: boolean; error: string | null } {
  const text = normalizeHeader(raw);
  if (text === "") return { value: true, error: null };
  if (TRUE_WORDS.has(text)) return { value: true, error: null };
  if (FALSE_WORDS.has(text)) return { value: false, error: null };
  return { value: true, error: `Valeur « ${raw.trim()} » non reconnue (oui / non).` };
}

/** Un code-barres : chiffres seulement, espaces tolérés. */
function digitsOf(raw: string): string {
  return raw.replace(/[\s.-]/g, "");
}

function columnFor(header: string): CatalogImportColumn | null {
  const key = normalizeHeader(header);
  if (!key) return null;
  return CATALOG_IMPORT_COLUMNS.find((column) => column.header === key || column.aliases.includes(key)) ?? null;
}

function rangeKey(name: string): string {
  return normalizeHeader(name);
}

/**
 * Lit le texte collé et valide chaque ligne. Une ligne en erreur n'est jamais
 * importée ; les autres le sont telles qu'écrites.
 */
export function parseCatalogCsv(text: string, ranges: CatalogImportRange[]): CatalogImportResult {
  const result: CatalogImportResult = { rows: [], errors: [], ignoredColumns: [], columns: [], dataLines: 0 };
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/).find((line) => line.trim() !== "") ?? "";
  if (firstLine === "") {
    result.errors.push({ line: null, column: null, message: "Rien à importer : collez l'en-tête puis les lignes du catalogue." });
    return result;
  }

  const records = splitCsv(text, detectDelimiter(firstLine)).filter((record) => record.cells.some((cell) => cell.trim() !== ""));
  const [header, ...data] = records;

  const mapping = new Map<CatalogImportField, number>();
  header.cells.forEach((cell, index) => {
    const column = columnFor(cell);
    if (!column) {
      if (cell.trim()) result.ignoredColumns.push(cell.trim());
      return;
    }
    if (mapping.has(column.field)) {
      result.errors.push({ line: header.line, column: cell.trim(), message: `Colonne « ${cell.trim()} » en double.` });
      return;
    }
    mapping.set(column.field, index);
  });

  if (!mapping.has("name")) {
    result.errors.push({ line: header.line, column: "nom", message: "Colonne « nom » absente de l'en-tête : la première ligne doit nommer les colonnes (nom;ean;prix_pro_ht…)." });
    return result;
  }
  if (result.errors.length > 0) return result;
  result.columns = CATALOG_IMPORT_COLUMNS.map((column) => column.field).filter((field) => mapping.has(field));

  result.dataLines = data.length;
  if (data.length === 0) {
    result.errors.push({ line: null, column: null, message: "L'en-tête est lu, mais aucune ligne de produit ne suit." });
    return result;
  }
  if (data.length > CATALOG_IMPORT_MAX_ROWS) {
    result.errors.push({ line: null, column: null, message: `${data.length} lignes : importez au plus ${CATALOG_IMPORT_MAX_ROWS} lignes à la fois.` });
    return result;
  }

  const rangeByKey = new Map(ranges.map((range) => [rangeKey(range.name), range.id]));
  const seen = { ean: new Map<string, number>(), cip13: new Map<string, number>(), externalRef: new Map<string, number>() };

  for (const record of data) {
    const value = (field: CatalogImportField) => {
      const index = mapping.get(field);
      return index === undefined ? "" : (record.cells[index] ?? "").trim();
    };
    const errors: CatalogImportError[] = [];
    const fail = (column: string, message: string) => errors.push({ line: record.line, column, message });

    const name = value("name");
    if (!name) fail("nom", "Nom du produit manquant.");
    else if (name.length > MAX_NAME) fail("nom", `Nom trop long (${MAX_NAME} caractères au plus).`);

    let rangeId: string | null = null;
    const rangeName = value("range");
    if (rangeName) {
      rangeId = rangeByKey.get(rangeKey(rangeName)) ?? null;
      if (!rangeId) fail("gamme", `Gamme « ${rangeName} » inconnue pour cette marque : créez-la d'abord dans la fiche marque.`);
    }

    let ean: string | null = null;
    const eanRaw = value("ean");
    if (eanRaw) {
      const digits = digitsOf(eanRaw);
      if (!isValidEan13(digits)) fail("ean", `EAN « ${eanRaw} » invalide (13 chiffres, clé de contrôle).`);
      else ean = digits;
    }

    let cip13: string | null = null;
    const cipRaw = value("cip13");
    if (cipRaw) {
      const digits = digitsOf(cipRaw);
      if (!isValidCip13(digits)) fail("cip13", `CIP13 « ${cipRaw} » invalide (13 chiffres commençant par 34009, clé de contrôle).`);
      else cip13 = digits;
    }

    const packaging = value("packaging") || null;
    if (packaging && packaging.length > MAX_TEXT) fail("conditionnement", `Conditionnement trop long (${MAX_TEXT} caractères au plus).`);
    const externalRef = value("externalRef") || null;
    if (externalRef && externalRef.length > MAX_TEXT) fail("reference", `Référence trop longue (${MAX_TEXT} caractères au plus).`);

    const pro = parseEuroCents(value("proPrice"));
    if (pro.error) fail("prix_pro_ht", pro.error);
    const pub = parseEuroCents(value("publicPrice"));
    if (pub.error) fail("prix_public_conseille", pub.error);
    const active = parseActive(value("active"));
    if (active.error) fail("actif", active.error);

    // Doublons dans le texte collé : la seconde occurrence est refusée.
    const duplicates: [keyof typeof seen, string | null, string][] = [
      ["ean", ean, "EAN déjà présent"],
      ["cip13", cip13, "CIP13 déjà présent"],
      ["externalRef", externalRef, "Référence déjà présente"],
    ];
    for (const [key, code, label] of duplicates) {
      const first = code ? seen[key].get(code) : undefined;
      if (first !== undefined) fail(key === "externalRef" ? "reference" : key, `${label} ligne ${first}.`);
    }

    if (errors.length > 0) {
      result.errors.push(...errors);
      continue;
    }
    for (const [key, code] of duplicates) if (code) seen[key].set(code, record.line);
    result.rows.push({
      line: record.line,
      name,
      rangeId,
      ean,
      cip13,
      packaging,
      proPriceCents: pro.value,
      publicPriceCents: pub.value,
      externalRef,
      isActive: active.value,
    });
  }

  return result;
}

export type ExistingCatalogProduct = { id: string; ean: string | null; cip13: string | null; externalRef: string | null };

export type CatalogImportPlan = {
  creates: CatalogImportRow[];
  updates: { id: string; row: CatalogImportRow }[];
  errors: CatalogImportError[];
};

/**
 * Rapproche les lignes valides du catalogue existant : une ligne met à jour le
 * produit qui a le même EAN, sinon le même CIP13, sinon la même référence
 * partenaire ; sans correspondance, elle crée un produit. Deux lignes qui
 * désignent le même produit existant sont refusées (la seconde).
 */
export function planCatalogImport(rows: CatalogImportRow[], existing: ExistingCatalogProduct[]): CatalogImportPlan {
  const byEan = new Map(existing.filter((product) => product.ean).map((product) => [product.ean as string, product.id]));
  const byCip = new Map(existing.filter((product) => product.cip13).map((product) => [product.cip13 as string, product.id]));
  const byRef = new Map(existing.filter((product) => product.externalRef).map((product) => [product.externalRef as string, product.id]));
  const plan: CatalogImportPlan = { creates: [], updates: [], errors: [] };
  const claimed = new Map<string, number>();

  for (const row of rows) {
    const id = (row.ean && byEan.get(row.ean)) || (row.cip13 && byCip.get(row.cip13)) || (row.externalRef && byRef.get(row.externalRef)) || null;
    if (!id) {
      plan.creates.push(row);
      continue;
    }
    const first = claimed.get(id);
    if (first !== undefined) {
      plan.errors.push({ line: row.line, column: null, message: `Désigne le même produit existant que la ligne ${first}.` });
      continue;
    }
    claimed.set(id, row.line);
    plan.updates.push({ id, row });
  }
  return plan;
}
