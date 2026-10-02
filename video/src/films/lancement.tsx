import type { FilmSpec } from "../FilmShell";
import { Counter, Hook } from "../scenes/hook-counter";
import { Analysis } from "../scenes/analysis";
import { Decision } from "../scenes/decision";
import { Dimensions } from "../scenes/dimensions";
import { Finale } from "../scenes/finale";

/** Le film de lancement : 50 s, 120 BPM (les scènes sont écrites à 100 BPM, jouées ×1,2). */
export const LANCEMENT: FilmSpec = {
  scenes: [
    { C: Hook, at: 0 },
    { C: Counter, at: 144 },
    { C: Analysis, at: 432 },
    { C: Decision, at: 864 },
    { C: Dimensions, at: 1224 },
    { C: Finale, at: 1512 },
  ],
  end: 1800,
  overlap: 18,
  speed: 1.2,
  music: "music/film.wav",
  duck: [36, 180, 216],
  cues: [
    { at: 36, name: "bip", volume: 0.8 },
    { at: 180, name: "bip", volume: 0.6 },
    { at: 216, name: "bip", volume: 0.6 },
    { at: 1354, name: "bip", volume: 0.25 },
    ...[118, 404, 846, 1206, 1306, 1396, 1494].map((at) => ({ at, name: "whoosh" as const, volume: 0.55 })),
    ...([[516, 0.35], [584, 0.35], [654, 0.35], [724, 0.35], [876, 0.5], [972, 0.85], [1116, 0.9], [1252, 0.4], [1276, 0.4], [1442, 0.3], [1456, 0.3], [1672, 0.45]] as const).map(([at, volume]) => ({ at, name: "clic" as const, volume })),
  ],
};
