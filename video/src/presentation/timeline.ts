import { SCRIPT, spokenChunk } from "./script";
import { chunkStarts, type VoiceInfo } from "../reel/timeline";

/**
 * LE TEMPS DU FILM « PRÉSENTATION », tiré de la voix — comme le film « Tarif » (src/tarif/timeline.ts), dont il reprend
 * le calage des sous-titres sur les pauses réelles de la voix.
 *
 * Chaque phrase dure ce que dure son fichier, mesuré au rendu ; entre deux phrases, le silence `gapAfter` du script.
 * La carte de fin entre 0,4 s avant la dernière phrase et reste 2,5 s après la voix. Tout est en secondes ici.
 */

/** Une pause de ponctuation dure au moins 120 ms ; en dessous, c'est la fermeture d'une consonne. */
export const MIN_PAUSE = 0.12;
/** L'ouverture muette : l'île au repos, le robot cligne. */
export const LEAD = 0.8;
/** La carte de fin, tenue après la dernière voix (direction du film motion design : 2,6 s). */
export const END_HOLD = 2.6;
/** La carte de fin entre ce temps avant la dernière phrase. */
export const END_INTRO = 0.4;

/**
 * Débuts de segments RELEVÉS à l'oreille et sur l'enveloppe de la voix « Yann » (15 oct. 2026), en secondes depuis le début
 * du fichier, là où le calage automatique se trompe : pauses trop courtes (P2 : 0,10 s après « Une boîte. » ; P3 : 0,09 s
 * après « conseil ? »), pause attribuée à la mauvaise virgule (P9 : la seule pause suit « prix », pas « stock »), phrases
 * sans pause (P13, P15 : fermetures de consonnes). Ne s'appliquent que si la durée du fichier est celle qui a été relevée :
 * une nouvelle voix repasse d'elle-même au calage automatique.
 */
const MEASURED_DUR: Record<string, number> = { P2: 3.1, P3: 2.06, P9: 3.16, P11: 3.16, P13: 2.73 };
const MEASURED_CHUNKS: Record<string, number[]> = {
  P2: [0, 0.84, 1.65],
  P3: [0, 1.07, 1.3],
  P9: [0, 0.54, 1.03, 1.89, 2.53],
  P11: [0, 1.48, 2.03], // pauses 1,14-1,48 s (« souhaite ? ») et 1,96-2,03 s (« bilan »), silencedetect −32 dB
  P13: [0, 1.25, 1.88],
};

export type ChunkTime = { text: string; start: number; end: number };
export type LineTime = { id: string; text: string; start: number; end: number; dur: number; next: number; chunks: ChunkTime[]; silentCaptions: boolean };
export type PresentationTimeline = { lines: LineTime[]; endStart: number; total: number };

export function presentationTimeline(voices: VoiceInfo[]): PresentationTimeline {
  let t = LEAD;
  const lines = SCRIPT.map((line, i) => {
    const voice = voices[i];
    const start = t;
    const end = start + voice.dur;
    t = end + line.gapAfter;
    const measured = MEASURED_CHUNKS[line.id];
    const starts =
      measured && measured.length === line.chunks.length && Math.abs(voice.dur - (MEASURED_DUR[line.id] ?? -1)) < 0.03
        ? measured
        : chunkStarts(line.chunks.map(spokenChunk), { dur: voice.dur, pauses: voice.pauses.filter(([from, to]) => to - from >= MIN_PAUSE) });
    const chunks = line.chunks.map((text, j) => ({ text, start: start + starts[j], end: j < starts.length - 1 ? start + starts[j + 1] : end }));
    return { id: line.id, text: line.text, start, end, dur: voice.dur, next: t, chunks, silentCaptions: line.silentCaptions === true };
  });
  const last = lines[lines.length - 1];
  return { lines, endStart: last.start - END_INTRO, total: last.end + END_HOLD };
}
