import type { FilmSpec } from "../FilmShell";
import { Counter, Hook } from "../scenes/hook-counter";
import { Analysis } from "../scenes/analysis";
import { Decision } from "../scenes/decision";
import { C } from "../theme";
import { words } from "../ui/kinetic";
import { EndCard } from "../ui/common";

/**
 * « Comment ça marche » : le parcours du bip à la décision, sans détour.
 * Les scènes du film de lancement, jouées ×1,36 (136 BPM) : 35 s.
 */
function End({ intro }: { intro: number }) {
  return <EndCard intro={intro} lead={[words("Un bip. Un conseil."), words("*Votre décision.*", C.brand300)]} />;
}

export const COMMENT: FilmSpec = {
  tag: "Comment ça marche",
  scenes: [
    { C: Hook, at: 0 },
    { C: Counter, at: 144 },
    { C: Analysis, at: 432 },
    { C: Decision, at: 864 },
    { C: End, at: 1224 },
  ],
  end: 1440,
  overlap: 18,
  speed: 1.36,
  music: "music/comment.wav",
  duck: [36, 180, 216],
  cues: [
    { at: 36, name: "bip", volume: 0.8 },
    { at: 36, name: "impact", volume: 0.35 },
    { at: 180, name: "bip", volume: 0.65 },
    { at: 216, name: "bip", volume: 0.65 },
    { at: 118, name: "whoosh", volume: 0.6 },
    // le panneau PharmaBoost et les deux lignes qui arrivent
    { at: 144 + 104, name: "swish", volume: 0.5 },
    { at: 144 + 132, name: "pop", volume: 0.45 },
    { at: 144 + 142, name: "pop", volume: 0.45 },
    { at: 144 + 146, name: "swish", volume: 0.35 },
    { at: 404, name: "whoosh", volume: 0.6 },
    // l'analyse : titre, quatre étapes, la phrase
    { at: 432 - 12, name: "impact", volume: 0.3 },
    ...[516, 584, 654, 724].map((at) => ({ at, name: "clic" as const, volume: 0.45 })),
    ...[516, 584, 654, 724].map((at) => ({ at: at + 6, name: "pop" as const, volume: 0.3 })),
    { at: 432 + 254, name: "tic", volume: 0.5 },
    { at: 432 + 338, name: "swish", volume: 0.4 },
    // le conseil et la décision
    { at: 846, name: "whoosh", volume: 0.55 },
    { at: 876, name: "pop", volume: 0.6 },
    { at: 972, name: "clic", volume: 0.9 },
    { at: 976, name: "swish", volume: 0.45 },
    { at: 864 + 212, name: "tic", volume: 0.35 },
    { at: 864 + 236, name: "tic", volume: 0.35 },
    { at: 1116, name: "clic", volume: 0.95 },
    { at: 1118, name: "pop", volume: 0.5 },
    { at: 1206, name: "whoosh", volume: 0.6 },
  ],
};
