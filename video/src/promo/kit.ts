import { LINES } from "./script";
import MOTS from "./mots.json";

/** Les temps de chaque mot des voix (mots.json), communs aux quatre films de présentation (6 nov. 2026). */
export type Word = { w: string; at: number; end: number };
export type Said = { who: string; dur: number; words: Word[] };
export const M = MOTS as Record<string, Said>;
export const FPS = 60;
export const norm = (s: string) => s.toLowerCase().replace(/[.,:;?!…«»"]/g, "").replace(/’/g, "'");

/**
 * La ligne de temps d'un film : `VAT[id]` = l'instant (s) où la réplique commence. `end(id)` sa fin, `w(id, mot, n)` l'instant
 * du n-ième mot (comparé sans ponctuation ni casse). Une faute de mot lève une erreur : on la voit au premier rendu.
 */
export function timeline() {
  const VAT: Record<string, number> = {};
  const end = (id: string) => VAT[id] + M[id].words[M[id].words.length - 1].end;
  const w = (id: string, word: string, nth = 0) => {
    const hits = M[id].words.filter((x) => norm(x.w) === norm(word));
    if (!hits[nth]) throw new Error(`Mot introuvable : ${id} « ${word} »`);
    return VAT[id] + hits[nth].at;
  };
  return { VAT, end, w };
}

export const linesOf = (film: 1 | 2 | 3 | 4) => LINES.filter((l) => l.film === film);
