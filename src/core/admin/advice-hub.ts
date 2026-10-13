import { parseSearchQuery, searchableText, wordsOf, type ParsedQuery, type SearchTerm } from "@/core/search/tolerant-search";

/**
 * « Conseils » — l'endroit unique de la console où la pharmacienne de PharmaBoost voit TOUT ce qui est proposé au comptoir
 * quand un médicament ou un produit est scanné : les règles (médicament ou famille → produit conseil), les conseils déclenchés
 * par un produit (anciennement « associations »), les suggestions du robot à valider. Ce module, PUR, range et cherche :
 *
 *  • des filtres en mots simples (Tous, Déclenchés par un médicament, par un produit, À relire, Proposés par le robot, Retirés) ;
 *  • une recherche par N'IMPORTE QUEL mot de n'importe quel champ, sans accents ni casse, mot par mot (chaque mot tapé doit se
 *    retrouver quelque part) — et par le NOM d'un médicament : « cétirizine » trouve les règles qui visent sa famille (R06AE),
 *    grâce aux codes de famille que le serveur a retrouvés pour ce mot (`medicineCodes`).
 */

export type HubFilter = "ALL" | "MEDICINE" | "PRODUCT" | "REVIEW" | "ROBOT" | "REMOVED" | "AVOID";

export const HUB_FILTERS: { key: HubFilter; label: string }[] = [
  { key: "ALL", label: "Tous" },
  { key: "MEDICINE", label: "Déclenchés par un médicament" },
  { key: "PRODUCT", label: "Déclenchés par un produit" },
  { key: "REVIEW", label: "À relire" },
  { key: "ROBOT", label: "Proposés par le robot" },
  { key: "REMOVED", label: "Retirés" },
  { key: "AVOID", label: "À ne pas associer" },
];

/** Les filtres dans l'adresse (`?filtre=robot`) : les anciennes adresses y mènent, et un lien se partage. */
export const FILTER_PARAMS: Record<HubFilter, string> = { ALL: "tous", MEDICINE: "medicament", PRODUCT: "produit", REVIEW: "a-relire", ROBOT: "robot", REMOVED: "retires", AVOID: "a-ne-pas-associer" };

/** `?filtre=robot` → ROBOT. Un filtre inconnu (ou absent) montre « Tous ». */
export function filterFromParam(value: string | string[] | undefined): HubFilter {
  const text = Array.isArray(value) ? value[0] : value;
  const found = (Object.entries(FILTER_PARAMS) as [HubFilter, string][]).find(([, param]) => param === text);
  return found ? found[0] : "ALL";
}

/** Ce que les filtres et la recherche savent d'un conseil, quelle que soit sa nature. */
export type HubFacets = {
  id: string;
  trigger: "MEDICINE" | "PRODUCT";
  /** En ligne mais pas encore relu (ou modifié depuis la validation), ou suggestion du robot en attente. */
  review: boolean;
  /** Proposé par le robot (en attente, ou validé puis devenu un conseil). */
  robot: boolean;
  /** Retiré : supprimé, ou suggestion refusée. */
  removed: boolean;
  /** Les familles ATC qui le déclenchent (règles, suggestions du robot). */
  atcPrefixes: string[];
  /** Tout ce qu'on peut chercher : textes, médicaments, familles, produits, étiquettes, exclusions, sources. */
  searchText: string;
};

/** Un conseil passe-t-il ce filtre ? « Tous » montre tout sauf ce qui est retiré ; « Retirés » ne montre que cela. */
export function matchesFilter(entry: HubFacets, filter: HubFilter): boolean {
  if (filter === "REMOVED") return entry.removed;
  if (entry.removed) return false;
  switch (filter) {
    case "ALL":
      return true;
    case "MEDICINE":
      return entry.trigger === "MEDICINE";
    case "PRODUCT":
      return entry.trigger === "PRODUCT";
    case "REVIEW":
      return entry.review;
    case "ROBOT":
      return entry.robot;
    default:
      return false;
  }
}

export function countByFilter(entries: HubFacets[]): Record<Exclude<HubFilter, "AVOID">, number> {
  const count = (filter: HubFilter) => entries.filter((entry) => matchesFilter(entry, filter)).length;
  return { ALL: count("ALL"), MEDICINE: count("MEDICINE"), PRODUCT: count("PRODUCT"), REVIEW: count("REVIEW"), ROBOT: count("ROBOT"), REMOVED: count("REMOVED") };
}

/** La saisie de la barre de recherche, découpée en mots (sans « de », « la », « boîte »…). */
export function parseHubQuery(raw: string): ParsedQuery {
  return parseSearchQuery(raw);
}

/** La clé d'un mot tapé, telle que le serveur l'utilise pour renvoyer les familles du médicament (`medicineCodes`). */
export const termKey = (term: SearchTerm): string => term.text;

/** Le mot tapé ressemble à un code de famille ATC (« R06AE », « N02BE01 »). */
const looksLikeAtc = (text: string): boolean => /^[A-Z]\d{2}(?:[A-Z]{1,2}(?:\d{2})?)?$/.test(text);

function numberStarts(word: string, number: string): boolean {
  return word.startsWith(number) && !/^\d/.test(word.slice(number.length));
}

/**
 * Un mot tapé se retrouve-t-il dans ces mots ? Au début d'un mot (« allerg » → « ALLERGIQUE »), au milieu à partir de quatre
 * lettres (« allergique » dans « ANTIALLERGIQUE »), à une lettre finale près à partir de six (« allergie » → « ALLERGIQUE »),
 * ou sous une abréviation connue (« comprimé » ↔ « CPR »). Un nombre ne déborde pas sur un autre (« 12 » ne trouve pas « 120 »).
 */
function termFound(term: SearchTerm, words: string[]): boolean {
  for (const word of words) {
    if (term.numeric) {
      if (numberStarts(word, term.text)) return true;
      continue;
    }
    if (word.startsWith(term.text)) return true;
    if (term.wholeWords.includes(word) || term.expansions.some((full) => word.startsWith(full))) return true;
    if (term.text.length >= 4 && word.includes(term.text)) return true;
    if (term.text.length >= 6 && word.startsWith(term.text.slice(0, -1))) return true;
  }
  return false;
}

/** Un code de famille d'un médicament tombe-t-il dans les familles qui déclenchent ce conseil ? */
export function atcMatches(prefixes: readonly string[], codes: readonly string[]): boolean {
  return codes.some((code) => prefixes.some((prefix) => prefix !== "" && code.startsWith(prefix)));
}

/**
 * Ce conseil répond-il à la recherche ? Chaque mot tapé doit se retrouver : dans son texte, ou — pour un nom de médicament —
 * par sa famille (`medicineCodes[mot]`, les codes ATC que le serveur a trouvés pour ce mot), ou parce que le mot EST un code de
 * famille couvert par le conseil. Une recherche vide laisse tout passer.
 */
export function matchesHubQuery(entry: HubFacets, query: ParsedQuery, medicineCodes: Readonly<Record<string, readonly string[]>> = {}, cache?: Map<string, string[]>): boolean {
  if (query.terms.length === 0) return true;
  let words = cache?.get(entry.id);
  if (!words) {
    words = wordsOf(searchableText(entry.searchText));
    cache?.set(entry.id, words);
  }
  return query.terms.every((term) => {
    if (termFound(term, words)) return true;
    if (looksLikeAtc(term.text) && atcMatches(entry.atcPrefixes, [term.text])) return true;
    const codes = medicineCodes[termKey(term)] ?? [];
    return codes.length > 0 && atcMatches(entry.atcPrefixes, codes);
  });
}

/** Les mots de la recherche qu'il vaut la peine de chercher comme médicaments (4 lettres au moins, pas un nombre). */
export function medicineTerms(query: ParsedQuery): string[] {
  return query.terms.filter((term) => !term.numeric && term.text.length >= 4 && !looksLikeAtc(term.text)).map(termKey);
}

/** Les codes de famille d'un code ATC, du plus large au plus précis : R06AE07 → R, R06, R06A, R06AE, R06AE07. */
export function atcLevels(code: string): string[] {
  const levels = [1, 3, 4, 5, 7].map((length) => code.slice(0, length));
  return levels.filter((level, index) => level.length > 0 && level.length <= code.length && levels.indexOf(level) === index);
}
