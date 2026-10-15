import type { VoiceInfo } from "../../reel/timeline";
import { FALLBACK_DURATIONS, SCRIPT } from "../script";
import { MIN_PAUSE, presentationTimeline, type LineTime, type PresentationTimeline } from "../timeline";

/* ==========================================================================
 * LE TEMPS DU FILM « PRÉSENTATION » (motion design) — ancrages et fenêtres des scènes, tirés de la voix MESURÉE.
 * Tout est en SECONDES du film. Rien n'est écrit en dur : si une voix change, tout se recale.
 *
 * time = makeTime(voices, voiceMarks)  (l'orchestrateur le fait ; chaque scène le reçoit en prop)
 *
 *   time.A("P6")        début de la phrase P6 (= début de son segment 0)
 *   time.A("P6", 1)     début du segment 1 (0 = premier) de P6 — segments = chunks de src/presentation/script.ts
 *   time.Z("P6")        fin de la voix de P6 ;  time.Z("P6", 1) fin du segment 1
 *   time.line("P6")     { start, end, dur, next, chunks[{ text, start, end }] }
 *   time.seg(6, 2)      notation de la direction, 1-BASÉE : seg(Pn, k) = début du segment k de Pn (= A("P6", 1))
 *   time.marks          { drop, vendu, logo, sign } (voir plus bas) ;  time.DROP = marks.drop
 *   time.beat(k)        DROP + 0,5·k (120 BPM ancrés au DROP)
 *   time.snap(x)        le temps de grille le plus proche si l'écart ≤ 0,1 s, sinon x — UNIQUEMENT pour les
 *                       apparitions secondaires APRÈS le DROP, jamais pour une frappe calée sur un mot
 *   time.win.S6         { id, start, end, dur, overlapIn, overlapOut, lines, name, file } — LA FENÊTRE de la scène
 *   time.look(x)        { grain, vignette, dots } de l'acte en cours (orchestrateur et DotGrid des scènes)
 *   time.total          durée du film (dernière voix + 2,6 s)
 *   time.tl             la timeline brute (presentationTimeline)
 *
 * MARQUES (repères exacts) : lues dans public/voix/presentation/voix.json, champ « marks » = { drop, vendu, sign }
 * en secondes DEPUIS LE DÉBUT DU FICHIER de P6 / P10 / P18 (écrit par l'endpoint with-timestamps d'ElevenLabs).
 * Absentes aujourd'hui → replis de la direction :
 *   drop  = P6.start + 0,40          (début de « Pharma » dans P6)
 *   vendu = seg(P10, 2) + 0,32       (début de « vendu »)
 *   logo  = P18.start
 *   sign  = fin de la 1re pause ≥ 0,12 s de P18, sinon P18.start + 0,95   (début de « Le bon conseil »)
 *
 * FENÊTRES (DIRECTION-PRESENTATION.json, buildNotes, « FENÊTRE ») :
 *   S1  0                 → P3.start              S7  P9.start − 0,1    → P10.start
 *   S2  P3.start − 0,05   → P4.start              S8  P10.start − 0,15  → P12.start
 *   S3  P4.start          → P5.start              S9  P12.start − 0,1   → P13.start
 *   S4  P5.start − 0,1    → DROP                  S10 P13.start − 0,05  → P18.start − 0,35
 *   S5  DROP              → P7.start              (S11 « La confiance » retirée le 15 oct. 2026)
 *   S6  P6.end + 0,05     → P9.start              S12 P18.start − 0,35  → fin du film
 * Pendant un chevauchement, LA SCÈNE QUI SORT EST DESSINÉE AU-DESSUS (sa sortie — plongée, fouet, compression — se
 * voit) ; la scène qui entre attend dessous dans son état de relais. Une scène sort de l'écran à `win.end`.
 * ======================================================================== */

export const LINE_IDS = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11", "P12", "P13", "P14", "P18", "P19"] as const;
export type LineId = (typeof LINE_IDS)[number];

export const SCENE_IDS = ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10", "S12"] as const;
export type SceneId = (typeof SCENE_IDS)[number];

/** Les repères exacts, relatifs au fichier de leur phrase (voix.json → marks). */
export type VoiceMarks = { drop?: number; vendu?: number; sign?: number };
export type Marks = { drop: number; vendu: number; logo: number; sign: number };

export type SceneWindow = {
  id: SceneId;
  /** Début de la fenêtre (la scène est montée). */
  start: number;
  /** Fin de la fenêtre (la scène est démontée). */
  end: number;
  dur: number;
  /** Durée commune avec la scène précédente (0 = coupe franche). */
  overlapIn: number;
  /** Durée commune avec la scène suivante. */
  overlapOut: number;
  lines: LineId[];
  name: string;
  file: string;
};

export type Look = { grain: number; vignette: number; dots: number };

export type Time = {
  tl: PresentationTimeline;
  total: number;
  line: (id: LineId) => LineTime;
  A: (id: LineId, k?: number) => number;
  Z: (id: LineId, k?: number) => number;
  seg: (n: number, k: number) => number;
  marks: Marks;
  DROP: number;
  beat: (k: number) => number;
  snap: (x: number) => number;
  win: Record<SceneId, SceneWindow>;
  look: (x: number) => Look;
};

const META: Record<SceneId, { name: string; file: string; lines: LineId[] }> = {
  S1: { name: "La cadence", file: "scene-01-cadence.tsx", lines: ["P1", "P2"] },
  S2: { name: "Le trou de mémoire", file: "scene-02-trou-de-memoire.tsx", lines: ["P3"] },
  S3: { name: "Ce qui se perd", file: "scene-03-ce-qui-se-perd.tsx", lines: ["P4"] },
  S4: { name: "L'éveil", file: "scene-04-eveil.tsx", lines: ["P5"] },
  S5: { name: "La révélation", file: "scene-05-revelation.tsx", lines: ["P6"] },
  S6: { name: "Une seconde", file: "scene-06-une-seconde.tsx", lines: ["P7", "P8"] },
  S7: { name: "À la loupe", file: "scene-07-a-la-loupe.tsx", lines: ["P9"] },
  S8: { name: "Vendu !", file: "scene-08-vendu.tsx", lines: ["P10", "P11"] },
  S9: { name: "La fête", file: "scene-09-la-fete.tsx", lines: ["P12"] },
  S10: { name: "L'équipe", file: "scene-10-equipe.tsx", lines: ["P13", "P14"] },
  S12: { name: "Signature", file: "scene-12-signature.tsx", lines: ["P18", "P19"] },
};

/** Acte 1 (jusqu'au DROP) : grain 5 %, vignette .30, points 4 % ; ensuite grain 3 %, vignette .18, points 8 %. */
export const ACT1_LOOK: Look = { grain: 0.05, vignette: 0.3, dots: 0.04 };
export const BRAND_LOOK: Look = { grain: 0.03, vignette: 0.18, dots: 0.08 };

export const fallbackVoices = (): VoiceInfo[] => FALLBACK_DURATIONS.map((dur) => ({ dur, pauses: [] }));

export function makeTime(voices: VoiceInfo[] | null | undefined, voiceMarks?: VoiceMarks | null): Time {
  const vs = voices ?? fallbackVoices();
  const tl = presentationTimeline(vs);
  const index = (id: LineId) => {
    const i = SCRIPT.findIndex((l) => l.id === id);
    if (i < 0) throw new Error(`time : phrase ${id} absente du script`);
    return i;
  };
  const line = (id: LineId) => tl.lines[index(id)];
  const A = (id: LineId, k = 0) => {
    const l = line(id);
    if (k < 0 || k >= l.chunks.length) throw new Error(`time.A(${id}, ${k}) : ${id} n'a que ${l.chunks.length} segments (0 à ${l.chunks.length - 1})`);
    return l.chunks[k].start;
  };
  const Z = (id: LineId, k?: number) => {
    const l = line(id);
    if (k === undefined) return l.end;
    if (k < 0 || k >= l.chunks.length) throw new Error(`time.Z(${id}, ${k}) : ${id} n'a que ${l.chunks.length} segments`);
    return l.chunks[k].end;
  };
  const seg = (n: number, k: number) => A(`P${n}` as LineId, k - 1);

  // Les repères exacts, sinon les replis de la direction.
  const p6 = line("P6");
  const p10 = line("P10");
  const p18 = line("P18");
  const v18 = vs[index("P18")];
  const firstPause = v18?.pauses.find(([a, b]) => b - a >= MIN_PAUSE);
  const valid = (x: unknown, dur: number) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= dur;
  const marks: Marks = {
    drop: valid(voiceMarks?.drop, p6.dur) ? p6.start + voiceMarks!.drop! : p6.start + 0.4,
    vendu: valid(voiceMarks?.vendu, p10.dur) ? p10.start + voiceMarks!.vendu! : seg(10, 2) + 0.32,
    logo: p18.start,
    sign: valid(voiceMarks?.sign, p18.dur) ? p18.start + voiceMarks!.sign! : firstPause ? p18.start + firstPause[1] : p18.start + 0.95,
  };
  const DROP = marks.drop;
  const beat = (k: number) => DROP + 0.5 * k;
  const snap = (x: number) => {
    const k = Math.round((x - DROP) / 0.5);
    const g = beat(k);
    return Math.abs(g - x) <= 0.1 ? g : x;
  };

  const S = (id: LineId) => line(id).start;
  const bounds: Record<SceneId, [number, number]> = {
    S1: [0, S("P3")],
    S2: [S("P3") - 0.05, S("P4")],
    S3: [S("P4"), S("P5")],
    S4: [S("P5") - 0.1, DROP],
    S5: [DROP, S("P7")],
    S6: [line("P6").end + 0.05, S("P9")],
    S7: [S("P9") - 0.1, S("P10")],
    S8: [S("P10") - 0.15, S("P12")],
    S9: [S("P12") - 0.1, S("P13")],
    // « La confiance » (S11, P15 à P17) est retirée du film (fondateur, 15 oct. 2026) : l'équipe passe directement à la signature.
    S10: [S("P13") - 0.05, S("P18") - 0.35],
    S12: [S("P18") - 0.35, tl.total],
  };
  const win = {} as Record<SceneId, SceneWindow>;
  SCENE_IDS.forEach((id, i) => {
    const [start, end] = bounds[id];
    const prev = i > 0 ? bounds[SCENE_IDS[i - 1]] : null;
    const next = i < SCENE_IDS.length - 1 ? bounds[SCENE_IDS[i + 1]] : null;
    win[id] = {
      id,
      start,
      end,
      dur: end - start,
      overlapIn: prev ? Math.max(0, prev[1] - start) : 0,
      overlapOut: next ? Math.max(0, end - next[0]) : 0,
      ...META[id],
    };
  });

  const look = (x: number): Look => (x < DROP ? ACT1_LOOK : BRAND_LOOK);

  return { tl, total: tl.total, line, A, Z, seg, marks, DROP, beat, snap, win, look };
}

/** Les images (60 i/s) d'une fenêtre : première image et nombre d'images. */
export function windowFrames(w: SceneWindow, fps = 60) {
  const from = Math.max(0, Math.floor(w.start * fps));
  const to = Math.ceil(w.end * fps);
  return { from, durationInFrames: Math.max(1, to - from) };
}
