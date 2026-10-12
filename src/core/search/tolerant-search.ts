import { normalizeSearchText } from "@/core/reference/search";

/**
 * La recherche tolérante des écrans de l'officine : ce que le pharmacien tape, tel qu'il le tape.
 *
 * « cétirizine 10 mg boîte de 15 » doit trouver « CETIRIZINE BIOGARAN 10MG CPR B/15 » (le libellé du logiciel de gestion)
 * comme « CETIRIZINE ZENTIVA 10 mg, comprimé pelliculé sécable — … de 15 comprimé(s) » (le catalogue national). D'où :
 *
 *  • sans accents ni casse, des DEUX côtés (`normalizeSearchText`, plus les ligatures œ/æ) ;
 *  • mot par mot : chaque mot significatif doit se retrouver au DÉBUT d'un mot du libellé (« cetiri » trouve « CETIRIZINE »,
 *    « cetirizine » ne trouve pas « LEVOCETIRIZINE » : c'est une autre molécule) ; « boîte », « de », « b/ »… ne comptent pas ;
 *  • pour les PRODUITS seulement (`inside`), aussi au MILIEU d'un mot, classé après : le logiciel de gestion colle les mots
 *    (« biafine » trouve « CICABIAFINE », « voyage » « PHARMAVOYAGE », « 400 ml » « GENCIV400ML ») ; jamais pour un médicament ;
 *  • un dosage colle à son unité : « 10 mg » = « 10MG » ; un nombre ne déborde pas sur un autre (« 10 » ne trouve pas « 100 ») ;
 *  • les abréviations des libellés du comptoir (« CPR » pour comprimé, « GEL » pour gélule, « B/15 »…) valent le mot entier.
 *
 * Module PUR : il découpe, compare et classe. La base fait un premier tri grossier (`sqlTermPattern`, toujours plus large que
 * la comparaison exacte faite ici) ; rien n'est jamais trouvé « à peu près » sans que chaque mot tapé y soit.
 */

/** Les unités qui collent à un nombre : « 10 mg » se lit « 10MG ». Les plus longues d'abord (MCG avant MG). */
const UNITS = ["MCG", "MUI", "KCAL", "MG", "UG", "GR", "KG", "ML", "CL", "DL", "UI", "CM", "MM", "G", "L", "M", "H"];
const UNIT_SET = new Set(UNITS);
const UNIT_GROUP = UNITS.join("|");
/** Une unité finit là où aucune lettre ne suit — sauf un « X » de multiplication : « 200MLX2 », « 5CMX5M ». */
const UNIT_END = "(?!(?!X\\d)[A-Z])";

/** Les mots qui ne désignent rien : le conditionnement (« boîte de 15 », « B/15 »), les articles. */
const STOPWORDS = new Set(["A", "AU", "AUX", "AVEC", "B", "BOITE", "BOITES", "BT", "BTE", "BTES", "D", "DE", "DES", "DU", "EN", "ET", "L", "LA", "LE", "LES", "POUR", "PAR", "UN", "UNE", "X"]);

/**
 * Les abréviations des libellés du logiciel de gestion, mot entier : taper « comprimé » trouve « CPR », taper « cpr » trouve
 * « comprimé ». Une abréviation ne vaut que comme mot entier (« CR » pour crème ne trouve pas « CRANBERRY »).
 */
const ABBREVIATIONS: [string, string[]][] = [
  ["COMPRIME", ["CPR", "CP", "CPRS", "COMP"]],
  ["GELULE", ["GEL", "GELU", "GLLE", "GELS"]],
  ["SACHET", ["SACH", "SAC", "SACHS"]],
  ["SOLUTION", ["SOL", "SOLU"]],
  ["BUVABLE", ["BUV"]],
  ["SUSPENSION", ["SUSP"]],
  ["EFFERVESCENT", ["EFF", "EFFER", "EFFV"]],
  ["PELLICULE", ["PELL", "PEL", "PELLIC"]],
  ["SECABLE", ["SECAB"]],
  ["ORODISPERSIBLE", ["ORODISP", "ORO"]],
  ["LYOPHILISAT", ["LYOC", "LYO"]],
  ["INJECTABLE", ["INJ"]],
  ["FLACON", ["FL", "FLAC", "FLC"]],
  ["TUBE", ["T", "TB"]],
  ["CREME", ["CR", "CRE"]],
  ["POMMADE", ["POM", "PDE", "POMM"]],
  ["SIROP", ["SIR"]],
  ["SUPPOSITOIRE", ["SUPP", "SUPPO", "SUP"]],
  ["AMPOULE", ["AMP", "AMPS"]],
  ["UNIDOSE", ["UNID"]],
  ["PASTILLE", ["PAST", "PASTIL"]],
  ["SHAMPOOING", ["SH", "SHP", "SHAMP", "SHAMPOO"]],
  ["GOUTTE", ["GTT", "GTTES", "GTES"]],
  ["ENFANT", ["ENF"]],
  ["NOURRISSON", ["NOUR", "NOURR", "NRS"]],
  ["ADULTE", ["ADU", "ADT"]],
  ["COLLYRE", ["COLL", "COLLY"]],
  ["SPRAY", ["SPR", "PULV"]],
  ["CAPSULE", ["CAPS"]],
  ["GRANULE", ["GRAN", "GLES"]],
  ["POUDRE", ["PDRE", "PDR"]],
  ["TABLETTE", ["TABL", "TAB"]],
];

/**
 * Le texte tel qu'on le compare : sans accents, en majuscules, ligatures dépliées, virgule décimale en point, et chaque
 * dosage collé à son unité (« 10 mg » → « 10MG », « 0,5 mg » → « 0.5MG »).
 */
export function searchableText(value: string): string {
  return normalizeSearchText(value.replace(/[œŒ]/g, "OE").replace(/[æÆ]/g, "AE"))
    .replace(/(\d),(?=\d)/g, "$1.")
    .replace(new RegExp(`(\\d) +(${UNIT_GROUP})${UNIT_END}`, "g"), "$1$2");
}

/**
 * Les mots d'un texte déjà passé par `searchableText` : un dosage avec son unité (« 10MG »), un nombre seul (« 15 »), ou un
 * mot qui commence par une lettre (« CPR », « B6 », « SPF50 »). « 30CPR » donne « 30 » et « CPR » ; « X30 » donne « X » et « 30 » ;
 * « 200MLX2 » donne « 200ML », « X » et « 2 ».
 */
const WORD = new RegExp(`\\d+(?:\\.\\d+)?(?:${UNIT_GROUP})${UNIT_END}|\\d+(?:\\.\\d+)?|X(?=\\d)|[A-Z][A-Z0-9]*`, "g");
export function wordsOf(searchable: string): string[] {
  return searchable.match(WORD) ?? [];
}

export type SearchTerm = {
  /** Le mot tapé, ramené à sa forme de comparaison (sans « S » final pour un mot de plus de trois lettres). */
  text: string;
  /** Un nombre, avec ou sans unité : il ne déborde jamais sur un nombre plus long. */
  numeric: boolean;
  /** Un nombre sans unité (« 15 » dans « boîte de 15 ») : il peut désigner le conditionnement plutôt que le nom. */
  bareNumber: boolean;
  /** Les autres écritures acceptées, en mot entier (« CPR » pour « COMPRIME »). */
  wholeWords: string[];
  /** Un mot complet que l'abréviation tapée désigne (« COMPRIME » pour « CPR »), trouvé en début de mot. */
  expansions: string[];
};

export type ParsedQuery = {
  terms: SearchTerm[];
  /** La saisie n'est qu'un code (EAN, CIP, référence chiffrée) : ses chiffres. */
  code: string | null;
};

const singular = (word: string): string => (word.length > 3 && /[A-Z]S$/.test(word) && !word.endsWith("SS") ? word.slice(0, -1) : word);

function termOf(word: string): SearchTerm {
  const numeric = /^\d/.test(word);
  const text = numeric ? word : singular(word);
  const wholeWords = new Set<string>();
  const expansions = new Set<string>();
  if (!numeric) {
    for (const [full, abbreviations] of ABBREVIATIONS) {
      if (text === full || (text.length >= 4 && full.startsWith(text))) {
        for (const abbreviation of abbreviations) wholeWords.add(abbreviation);
      } else if (abbreviations.includes(text)) {
        expansions.add(full);
        for (const abbreviation of abbreviations) if (abbreviation !== text) wholeWords.add(abbreviation);
      }
    }
  }
  return { text, numeric, bareNumber: /^\d+(?:\.\d+)?$/.test(text), wholeWords: [...wholeWords], expansions: [...expansions] };
}

/** Ce que le pharmacien a tapé, découpé en mots significatifs (au plus 8). */
export function parseSearchQuery(raw: string): ParsedQuery {
  const searchable = searchableText(raw.slice(0, 120));
  const digits = searchable.replace(/[\s.\-]/g, "");
  const code = /^\d{7,14}$/.test(digits) ? digits : null;
  const seen = new Set<string>();
  const terms: SearchTerm[] = [];
  for (const word of wordsOf(searchable)) {
    if (STOPWORDS.has(word)) continue;
    const term = termOf(word);
    if (seen.has(term.text)) continue;
    seen.add(term.text);
    terms.push(term);
    if (terms.length === 8) break;
  }
  return { terms, code };
}

/** Le mot commence par le nombre tapé, sans le prolonger : « 10 » trouve « 10MG », pas « 100MG » ni « 10.5 ». */
function numberPrefix(word: string, number: string): boolean {
  if (!word.startsWith(number)) return false;
  const next = word.slice(number.length);
  return !/^\d/.test(next) && !/^\.\d/.test(next);
}

/**
 * Le nombre tapé AU MILIEU d'un mot : collé derrière des lettres, sans être prolongé (« 400ML » dans « GENCIV400ML », « 20 »
 * dans « EFF20 », mais « 25ML » pas dans « RECH125ML ») ; ou, à partir de cinq chiffres, un morceau d'un code (EAN, CIP).
 */
function numberInside(word: string, number: string): boolean {
  if (/^\d{5,}$/.test(number) && /^\d{7,}$/.test(word)) return word.includes(number);
  for (let index = word.indexOf(number, 1); index > 0; index = word.indexOf(number, index + 1)) {
    if (/[A-Z]/.test(word[index - 1]) && numberPrefix(word.slice(index), number)) return true;
  }
  return false;
}

export type MatchOptions = {
  /**
   * Accepter aussi le mot tapé au MILIEU d'un mot du libellé, noté 1 (après tout le reste) : pour les PRODUITS, dont le
   * logiciel de gestion colle les mots (« CICABIAFINE », « ERGYSTRESS », « PRURISPRAY »), comme le trouvait l'ancienne
   * recherche. Jamais pour un médicament : « cétirizine » ne doit pas trouver « LÉVOCÉTIRIZINE ». Au moins trois lettres
   * (« av » au milieu de « LAV » ne désigne rien).
   */
  inside?: boolean;
};

/** 3 : le mot exact ; 2 : le début d'un mot ; 1,5 : une autre écriture du même mot ; 1 : le milieu d'un mot (`inside`) ; 0 : absent. */
function termQuality(term: SearchTerm, words: string[], inside = false): number {
  let best = 0;
  for (const word of words) {
    if (word === term.text) return 3;
    if (term.numeric) {
      if (numberPrefix(word, term.text)) best = Math.max(best, 2);
      else if (inside && numberInside(word, term.text)) best = Math.max(best, 1);
      continue;
    }
    // Une lettre seule (« vitamine C ») ne vaut que comme mot entier.
    if (term.text.length > 1 && word.startsWith(term.text)) best = Math.max(best, 2);
    else if (term.wholeWords.includes(word) || term.expansions.some((full) => word.startsWith(full))) best = Math.max(best, 1.5);
    else if (inside && term.text.length >= 3 && word.includes(term.text)) best = Math.max(best, 1);
  }
  return best;
}

/**
 * Le score d'un libellé pour une recherche, ou `null` s'il manque un mot. `primary` est le nom (ce que le pharmacien lit) ;
 * `secondary`, ce qui le complète (marque, conditionnement, substances, référence) et compte moins.
 */
export function scoreMatch(query: ParsedQuery, primary: string, secondary: (string | null | undefined)[] = [], options: MatchOptions = {}): number | null {
  if (query.terms.length === 0) return 0;
  const inside = options.inside ?? false;
  const nameWords = wordsOf(searchableText(primary));
  const otherWords = wordsOf(searchableText(secondary.filter(Boolean).join(" ")));
  let score = 0;
  let allInName = true;
  for (const term of query.terms) {
    const inName = termQuality(term, nameWords, inside);
    const elsewhere = inName > 0 ? 0 : termQuality(term, otherWords, inside) * 0.6;
    if (inName === 0 && elsewhere === 0) return null;
    if (inName === 0) allInName = false;
    score += inName || elsewhere;
  }
  // Le nom qui COMMENCE par le premier mot tapé : c'est presque toujours celui qu'on cherche — sans qu'un mot plus long
  // (« CREMELINE ») passe devant le mot exact ailleurs dans le nom (« DEXERYL CREME »).
  const opening = nameWords[0] ? termQuality(query.terms[0], [nameWords[0]]) : 0;
  if (opening === 3) score += 1;
  else if (opening >= 2) score += 0.5;
  if (allInName) score += 1;
  return score;
}

/** Ce que la base reconnaît comme une lettre, accents compris (comparaison sans casse : `~*`). */
const ACCENTED: Record<string, string> = {
  A: "AÀÂÄÁÃÅàâäáãå",
  C: "CÇç",
  E: "EÉÈÊËéèêë",
  I: "IÎÏÍÌîïíì",
  N: "NÑñ",
  O: "OÔÖÓÒÕôöóòõ",
  U: "UÙÛÜÚùûüú",
  Y: "YŸÝÿý",
};

function accentPattern(text: string): string {
  let pattern = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === "O" && next === "E") { pattern += "(?:O[EÉÈÊËéèêë]|Œ|œ)"; index += 1; continue; }
    if (char === "A" && next === "E") { pattern += "(?:A[EÉÈÊËéèêë]|Æ|æ)"; index += 1; continue; }
    if (char === ".") { pattern += "[.,]"; continue; }
    pattern += ACCENTED[char] ? `[${ACCENTED[char]}]` : char;
  }
  return pattern;
}

/**
 * Le motif (expression régulière PostgreSQL, sans casse : `~*`) qui fait le PREMIER tri en base, pour un mot tapé. Il est
 * volontairement plus large que la comparaison exacte (`scoreMatch`) : sous-chaîne, accents tolérés, espace permis entre
 * un nombre et son unité. Il ne contient que des lettres, des chiffres et des classes : rien de ce que tape l'utilisateur
 * n'y passe tel quel.
 */
export function sqlTermPattern(term: SearchTerm): string {
  const alternatives = [term.text, ...term.expansions, ...term.wholeWords].map(formPattern);
  return alternatives.length === 1 ? alternatives[0] : `(?:${alternatives.join("|")})`;
}

/** Le mot tel qu'il est tapé, sans ses abréviations (« TUBE », pas « T ») : sert à ranger, en base, les noms qui le contiennent. */
export function sqlTypedPattern(term: SearchTerm): string {
  return formPattern(term.text);
}

/** Une écriture d'un mot tapé, accents tolérés ; un dosage admet un espace avant son unité. */
function formPattern(form: string): string {
  const dose = form.match(/^(\d+(?:\.\d+)?)([A-Z]+)$/);
  return dose && UNIT_SET.has(dose[2]) ? `${accentPattern(dose[1])} *${dose[2]}` : accentPattern(form);
}

/**
 * Le motif qui dit si un mot tapé est au DÉBUT d'un mot (`\m` : début de mot, `\M` : fin de mot), comme le veut `scoreMatch`
 * sans `inside` — une abréviation ou une lettre seule en mot entier, un nombre sans être prolongé. La base range ces lignes
 * avant celles qui ne l'ont qu'au milieu d'un mot : la limite de lignes lues coupe d'abord les mots collés (« air » dans
 * « PAIRES ») et les abréviations d'une lettre (« T » pour tube), pas les vraies réponses. Un ordre, jamais un filtre.
 */
export function sqlWordPattern(term: SearchTerm): string {
  const typed = term.numeric ? `${formPattern(term.text)}(?![0-9])` : term.text.length === 1 ? `${accentPattern(term.text)}\\M` : accentPattern(term.text);
  const alternatives = [typed, ...term.expansions.map(accentPattern), ...term.wholeWords.map((abbreviation) => `${accentPattern(abbreviation)}\\M`)];
  return `\\m(?:${alternatives.join("|")})`;
}

/** Le motif qui dit si un nom COMMENCE par le premier mot tapé : la base s'en sert pour garder les meilleurs en tête. */
export function sqlStartPattern(term: SearchTerm): string {
  return `^${sqlTermPattern(term)}`;
}
