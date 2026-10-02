import type { FilmSpec } from "../FilmShell";
import { Counter } from "../scenes/hook-counter";
import { Decision } from "../scenes/decision";
import { Bilan, Promesse, Security } from "../scenes/site";
import { C } from "../theme";
import { words } from "../ui/kinetic";
import { EndCard } from "../ui/common";

/**
 * La présentation du site (haut de l'accueil) : « Personne ne peut penser à
 * tout » → vous scannez → le conseil arrive, vous décidez → le patient repart
 * avec son bilan → la sécurité → « Scan. Conseil. Bilan. ». 120 BPM, 21
 * mesures : 42 s.
 */
function End({ intro }: { intro: number }) {
  return <EndCard intro={intro} lead={[words("Scan. Conseil. *Bilan.*", C.brand300)]} />;
}

const COUNTER = 216;
const DECISION = 504;

export const PRESENTATION: FilmSpec = {
  scenes: [
    { C: Promesse, at: 0 },
    { C: Counter, at: COUNTER },
    { C: Decision, at: DECISION },
    { C: Bilan, at: 864 },
    { C: Security, at: 1080 },
    { C: End, at: 1296 },
  ],
  end: 1512,
  overlap: 18,
  speed: 1.2,
  music: "music/presentation.wav",
  duck: [COUNTER + 36, COUNTER + 72],
  cues: [
    // le comptoir : deux bips, le panneau PharmaBoost et les deux lignes qui arrivent
    { at: COUNTER + 36, name: "bip", volume: 0.75 },
    { at: COUNTER + 72, name: "bip", volume: 0.65 },
    { at: COUNTER + 104, name: "swish", volume: 0.5 },
    { at: COUNTER + 132, name: "pop", volume: 0.45 },
    { at: COUNTER + 142, name: "pop", volume: 0.45 },
    { at: COUNTER + 146, name: "swish", volume: 0.35 },
    { at: COUNTER + 260, name: "whoosh", volume: 0.6 },
    // le conseil et la décision
    { at: DECISION - 18, name: "whoosh", volume: 0.55 },
    { at: DECISION + 12, name: "pop", volume: 0.6 },
    { at: DECISION + 108, name: "clic", volume: 0.9 },
    { at: DECISION + 112, name: "swish", volume: 0.45 },
    { at: DECISION + 212, name: "tic", volume: 0.35 },
    { at: DECISION + 236, name: "tic", volume: 0.35 },
    { at: DECISION + 252, name: "clic", volume: 0.95 },
    { at: DECISION + 254, name: "pop", volume: 0.5 },
    { at: DECISION + 342, name: "whoosh", volume: 0.6 },
  ],
};
