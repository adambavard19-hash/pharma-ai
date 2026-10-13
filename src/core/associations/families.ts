import { normalizeProductText } from "@/core/catalog/product-vocabulary";

/**
 * Les familles déclencheuses : « Shampoings anti-chute », « Crèmes hydratantes visage »… Une association peut être déclenchée
 * par une famille entière plutôt que par un produit : tout produit de la famille scanné au comptoir appelle le produit conseillé.
 *
 * Un produit appartient à une famille par son LIBELLÉ — c'est ce qui fait marcher une famille dans une pharmacie neuve, quel
 * que soit son stock — et par les choix de la pharmacienne : un produit ajouté à la main en fait partie, un produit retiré n'en
 * fait plus partie, quoi que dise son libellé.
 *
 * Un terme est une suite de mots qui doivent TOUS figurer dans le libellé, chacun en début de mot (« chute » trouve
 * « ANTI-CHUTE », « shamp » trouve « SHAMPOOING ») ; « shamp/shp » accepte l'un ou l'autre. Module pur.
 */

export type FamilyDefinition = {
  id: string;
  includeTerms: readonly string[];
  excludeTerms: readonly string[];
  /** Clés « ean:<code> » ou « drug:<nom> » ajoutées (true) ou retirées (false) à la main. */
  members: ReadonlyMap<string, boolean>;
};

export type FamilyCandidate = { labels: readonly string[]; keys: readonly string[] };

export const FAMILY_NAME_MAX = 80;
export const FAMILY_TERMS_MAX = 40;
export const FAMILY_TERM_MAX = 80;

type ParsedTerm = string[][];

/** « shamp/shp anti chute » → [["shamp","shp"],["anti"],["chute"]]. Un terme vide est ignoré. */
export function parseTerm(term: string): ParsedTerm {
  return term
    .split(/\s+/)
    .map((word) =>
      word
        .split("/")
        .map((option) => normalizeProductText(option).replace(/\s+/g, ""))
        .filter(Boolean),
    )
    .filter((options) => options.length > 0);
}

export function termMatches(term: ParsedTerm, label: string): boolean {
  if (term.length === 0) return false;
  // « ANTICHUTE » collé se lit aussi « chute » : le stock écrit « ANTI-CHUTE », « ANTI CHUTE » comme « ANTICHUTE ».
  const words = normalizeProductText(label).split(" ").flatMap((word) => (word.startsWith("anti") && word.length > 6 ? [word, word.slice(4)] : [word]));
  return term.every((options) => options.some((option) => words.some((word) => word.startsWith(option))));
}

const matchesAny = (terms: readonly string[], labels: readonly string[]) => terms.some((raw) => {
  const term = parseTerm(raw);
  return labels.some((label) => termMatches(term, label));
});

/** La décision : un retrait à la main l'emporte sur tout, puis un ajout à la main, puis le libellé. */
export function belongsToFamily(family: FamilyDefinition, candidate: FamilyCandidate): boolean {
  const manual = candidate.keys.map((key) => family.members.get(key)).filter((value): value is boolean => value !== undefined);
  if (manual.includes(false)) return false;
  if (manual.includes(true)) return true;
  return matchesAny(family.includeTerms, candidate.labels) && !matchesAny(family.excludeTerms, candidate.labels);
}

export const familyKey = (familyId: string): string => `family:${familyId}`;

/** Les termes saisis dans la console : une ligne par terme, sans doublon, bornés. */
export function cleanTerms(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw) {
    const term = line.replace(/\s+/g, " ").trim().slice(0, FAMILY_TERM_MAX);
    const signature = parseTerm(term).map((options) => options.join("/")).join(" ");
    if (!signature || seen.has(signature)) continue;
    seen.add(signature);
    out.push(term);
    if (out.length >= FAMILY_TERMS_MAX) break;
  }
  return out;
}
