import type { FilmSpec } from "../FilmShell";
import { Counter } from "../scenes/hook-counter";
import { Decision } from "../scenes/decision";
import { Bilan, Examples, stepCard } from "../scenes/site";
import { C } from "../theme";
import { words } from "../ui/kinetic";
import { EndCard } from "../ui/common";

/**
 * « Comment ça marche » : les trois étapes du site, annoncées une à une.
 * 01 Vous scannez l'ordonnance → 02 Les conseils apparaissent (la carte, puis
 * les exemples) → 03 Le patient repart avec son bilan. 136 BPM, 22 mesures : 39 s.
 */
function End({ intro }: { intro: number }) {
  return <EndCard intro={intro} lead={[words("Du scan au bilan,"), words("*en trois étapes.*", C.brand300)]} />;
}

const COUNTER = 108;
const DECISION = 504;

export const COMMENT: FilmSpec = {
  tag: "Comment ça marche",
  scenes: [
    { C: stepCard("01", "Vous scannez l'ordonnance"), at: 0 },
    { C: Counter, at: COUNTER },
    { C: stepCard("02", "Les conseils apparaissent"), at: 396 },
    { C: Decision, at: DECISION },
    { C: Examples, at: 864 },
    { C: stepCard("03", "Le patient repart avec son plan conseil"), at: 1044 },
    { C: Bilan, at: 1152 },
    { C: End, at: 1368 },
  ],
  end: 1584,
  overlap: 18,
  speed: 1.36,
  music: "music/comment.wav",
  duck: [COUNTER + 36, COUNTER + 72],
  cues: [
    { at: COUNTER + 36, name: "bip", volume: 0.8 },
    { at: COUNTER + 72, name: "bip", volume: 0.65 },
    { at: COUNTER + 104, name: "swish", volume: 0.5 },
    { at: COUNTER + 132, name: "pop", volume: 0.45 },
    { at: COUNTER + 142, name: "pop", volume: 0.45 },
    { at: COUNTER + 146, name: "swish", volume: 0.35 },
    { at: COUNTER + 260, name: "whoosh", volume: 0.6 },
    { at: DECISION - 18, name: "whoosh", volume: 0.55 },
    { at: DECISION + 12, name: "pop", volume: 0.6 },
    { at: DECISION + 108, name: "clic", volume: 0.9 },
    { at: DECISION + 112, name: "swish", volume: 0.45 },
    { at: DECISION + 212, name: "tic", volume: 0.35 },
    { at: DECISION + 236, name: "tic", volume: 0.35 },
    { at: DECISION + 252, name: "clic", volume: 0.95 },
    { at: DECISION + 254, name: "pop", volume: 0.5 },
  ],
};
