import { SCRIPT } from "./script";

/**
 * LE TEMPS DU REEL, tiré de la voix.
 *
 * Chaque phrase dure ce que dure son fichier, mesuré au rendu (calculateMetadata, src/films/reel.tsx) ; entre deux
 * phrases, le silence `gapAfter` du script. Les sous-titres suivent la voix : la mesure relève aussi les pauses à
 * l'intérieur de chaque phrase, et chaque sous-titre qui suit une ponctuation (« Au comptoir, | chaque ordonnance »)
 * démarre à la fin de la pause la plus proche. Entre deux pauses, les sous-titres se partagent le temps au prorata
 * des syllabes. Une voix humaine qui respire aux virgules se recale donc d'elle-même.
 *
 * Tout est en secondes ici ; les scènes reçoivent des « images de scène » (30 par seconde, comme les autres films).
 */

/** Avant la première phrase : le temps que l'accroche frappe à l'écran. */
export const LEAD = 0.3;
/** Une scène entre un peu avant sa phrase : l'image change, puis la voix parle. */
export const PRE = 0.14;
/** La durée du passage d'une scène à l'autre. */
export const CUT = 0.2;
export const VIDEO_FPS = 60;
export const SCENE_FPS = 30;

/** Ce que la mesure dit d'un fichier de voix : sa durée et ses pauses intérieures [début, fin], en secondes. */
export type VoiceInfo = { dur: number; pauses: [number, number][] };
export type ChunkTime = { text: string; start: number; end: number };
export type LineTime = { id: string; text: string; start: number; end: number; dur: number; next: number; chunks: ChunkTime[] };
export type ReelTimeline = { lines: LineTime[]; total: number };

const VOWELS = /[aeiouyàâäéèêëîïôöùûüœæ]+/gi;

/** Les syllabes prononcées d'un mot français, à peu près : groupes de voyelles, « e » muet final et « qu/gu » retirés. */
function syllables(word: string) {
  let w = word.toLowerCase().replace(/[^a-zàâäéèêëîïôöùûüœæç'’]/g, "");
  w = w.replace(/([qg])u(?=[aeioy])/g, "$1");
  const groups = (x: string) => (x.match(VOWELS) ?? []).length;
  let n = 0;
  for (const p of w.split(/['’]/).filter(Boolean)) {
    const q = groups(p) > 1 ? p.replace(/(e|es|ent)$/, "") : p;
    n += Math.max(groups(q), /[a-zç]/.test(q) ? 1 : 0);
  }
  return n;
}

const plain = (chunk: string) => chunk.replace(/\*/g, "").trim();
/** Le sous-titre se termine sur une ponctuation : la voix y marque une pause. */
const endsWithPause = (chunk: string) => /(…|[,;:.?!])$/.test(plain(chunk));

/** Le poids d'un sous-titre : ses syllabes, plus la pause des ponctuations intérieures (sa dernière ponctuation, non). */
export function chunkWeight(chunk: string) {
  const text = plain(chunk);
  let w = text.split(/\s+/).reduce((s, word) => s + syllables(word), 0);
  const marks = [...text.matchAll(/(…|[,;:.?!])(?=\s)/g)].map((m) => m[1]);
  for (const m of marks) w += m === "," ? 1.4 : 2;
  return Math.max(1, w);
}

/** Le temps d'une pause de ponctuation en fin de sous-titre, en syllabes, quand la voix n'a pas été mesurée. */
const pauseWeight = (chunk: string) => {
  const t = plain(chunk);
  return !endsWithPause(chunk) ? 0 : t.endsWith(",") ? 1.4 : t.endsWith("…") ? 2.6 : 2;
};

/** Les débuts des sous-titres d'une phrase, en secondes depuis son début. */
function chunkStarts(chunks: string[], voice: VoiceInfo): number[] {
  const n = chunks.length;
  const weights = chunks.map(chunkWeight);
  // 1. Une estimation à la syllabe, pauses de ponctuation comprises.
  const total = weights.reduce((s, w, j) => s + w + (j < n - 1 ? pauseWeight(chunks[j]) : 0), 0);
  const guess: number[] = [];
  let acc = 0;
  for (let j = 0; j < n; j++) {
    guess.push((acc / total) * voice.dur);
    acc += weights[j] + pauseWeight(chunks[j]);
  }
  // 2. Les ancres : après une ponctuation, la fin de la vraie pause la plus proche de l'estimation.
  type Anchor = { j: number; t: number; pauseStart: number };
  const anchors: Anchor[] = [{ j: 0, t: 0, pauseStart: 0 }];
  const used = new Set<number>();
  for (let j = 1; j < n; j++) {
    if (!endsWithPause(chunks[j - 1])) continue;
    const last = anchors[anchors.length - 1].t;
    let best = -1;
    voice.pauses.forEach(([, end], k) => {
      if (used.has(k) || end <= last + 0.12 || Math.abs(end - guess[j]) > 0.9) return;
      if (best < 0 || Math.abs(end - guess[j]) < Math.abs(voice.pauses[best][1] - guess[j])) best = k;
    });
    if (best >= 0) {
      used.add(best);
      anchors.push({ j, t: voice.pauses[best][1], pauseStart: voice.pauses[best][0] });
    }
  }
  // 3. Entre deux ancres, les sous-titres se partagent la parole au prorata de leurs syllabes.
  const starts = new Array<number>(n).fill(0);
  anchors.forEach((a, i) => {
    const next = anchors[i + 1];
    const to = next ? next.j : n;
    const until = next ? next.pauseStart : voice.dur;
    const span = weights.slice(a.j, to);
    const sum = span.reduce((s, w) => s + w, 0);
    let x = 0;
    for (let j = a.j; j < to; j++) {
      starts[j] = a.t + (x / sum) * (until - a.t);
      x += weights[j];
    }
  });
  return starts;
}

/** Le montage complet pour les voix mesurées (une par phrase du script). */
export function reelTimeline(voices: VoiceInfo[]): ReelTimeline {
  let t = LEAD;
  const lines = SCRIPT.map((line, i) => {
    const voice = voices[i];
    const start = t;
    const end = start + voice.dur;
    t = end + line.gapAfter;
    const starts = chunkStarts(line.chunks, voice);
    const chunks = line.chunks.map((text, j) => ({ text, start: start + starts[j], end: j < starts.length - 1 ? start + starts[j + 1] : end }));
    return { id: line.id, text: line.text, start, end, dur: voice.dur, next: t, chunks };
  });
  return { lines, total: t };
}

/**
 * Les pauses intérieures d'une voix : l'énergie par tranches de 10 ms, sous 32 dB de moins que la tranche la plus
 * forte pendant au moins 60 ms. Le silence du début et de la fin n'est pas une pause.
 */
export function detectPauses(samples: Float32Array, sampleRate: number): [number, number][] {
  const win = Math.max(1, Math.round(sampleRate * 0.01));
  const levels: number[] = [];
  for (let i = 0; i + win <= samples.length; i += win) {
    let s = 0;
    for (let k = i; k < i + win; k++) s += samples[k] * samples[k];
    levels.push(Math.sqrt(s / win));
  }
  const peak = Math.max(1e-9, ...levels);
  const floor = peak * 10 ** (-32 / 20);
  const pauses: [number, number][] = [];
  let from = -1;
  const first = levels.findIndex((l) => l > floor);
  let last = levels.length - 1;
  while (last > 0 && levels[last] <= floor) last--;
  for (let i = first; i <= last; i++) {
    const quiet = levels[i] <= floor;
    if (quiet && from < 0) from = i;
    if (!quiet && from >= 0) {
      if (i - from >= 6) pauses.push([(from * win) / sampleRate, (i * win) / sampleRate]);
      from = -1;
    }
  }
  return pauses;
}
