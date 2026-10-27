import { normalizeSearchText } from "../search";

/**
 * La famille officielle d'un médicament connu par son seul NOM (fondateur, 27 oct. 2026 : « désogestrel, oméprazole, Gaviscon,
 * tadalafil… tu sais forcément les classer » — 294 médicaments attendaient Donna dans « Produits à connaître »).
 *
 * Un nom lu au comptoir ou dans un stock (« DESOGESTREL BIOG 75µG CPR ») n'a pas toujours de code CIS. On cherche alors les
 * spécialités du catalogue national (BDPM) qui portent le même premier mot, ou dont la substance commence par lui, et l'on prend
 * leur famille officielle (Open Medic) :
 *   • les spécialités qui reprennent le plus de mots du nom l'emportent (« LEVONORGESTREL/ETHINYLESTRADIOL » ≠ « LEVONORGESTREL » seul) ;
 *   • un seul code ATC parmi elles : c'est lui ;
 *   • plusieurs : leur début commun, s'il dit au moins la famille (niveau 3, « G03A » = contraceptifs hormonaux) ;
 *   • sinon rien : un désaccord ne se devine pas, la pharmacienne tranchera.
 *
 * Module PUR : la recherche en base est faite par l'appelant.
 */

/** Le niveau 3 de l'ATC (« A02B », « G03A ») : en dessous, la famille ne dit rien d'utile aux règles. */
export const MIN_FAMILY_LENGTH = 4;

const NOISE = new Set(["MG", "MCG", "UG", "ML", "CPR", "COMP", "COMPRIME", "COMPRIMES", "GELULE", "GELULES", "GEL", "SACHET", "SACHETS", "BTE", "BOITE", "FL", "FLACON", "PELLICULE", "SECABLE", "LP", "GE", "GENERIQUE", "LABORATOIRES", "LAB"]);

/** Les mots qui comptent dans un nom : lettres, trois au moins, sans dosage ni forme abrégée. */
export function nameWords(name: string): string[] {
  return normalizeSearchText(name)
    .replace(/[^A-Z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length >= 3 && /^[A-Z]+$/.test(word) && !NOISE.has(word));
}

export type FamilyCandidate = { searchName: string; substances: string[]; atcCode: string };

function commonPrefix(codes: string[]): string {
  let prefix = codes[0] ?? "";
  for (const code of codes) while (!code.startsWith(prefix)) prefix = prefix.slice(0, -1);
  return prefix;
}

/** Choisit la famille parmi les spécialités trouvées pour un nom ; `null` si elles ne s'accordent pas. */
export function pickFamilyByName(name: string, candidates: FamilyCandidate[]): string | null {
  const words = nameWords(name);
  if (words.length === 0 || candidates.length === 0) return null;
  // Un mot compte s'il est l'un des mots de la spécialité, ou s'il le prolonge (« GAVISCONPRO » ↔ « GAVISCON », six lettres au moins).
  const matches = (word: string, token: string) => word === token || (token.length >= 6 && (word.startsWith(token) || token.startsWith(word)));
  const score = (candidate: FamilyCandidate) => {
    const tokens = nameWords(`${candidate.searchName} ${candidate.substances.join(" ")}`);
    return words.filter((word) => tokens.some((token) => matches(word, token))).length;
  };
  const best = Math.max(...candidates.map(score));
  if (best === 0) return null;
  const codes = [...new Set(candidates.filter((candidate) => score(candidate) === best).map((candidate) => candidate.atcCode))];
  const family = commonPrefix(codes);
  return family.length >= MIN_FAMILY_LENGTH ? family : null;
}
