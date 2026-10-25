import { Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { FPS } from "../timeline";
import DUREES from "../../rembobine/kit/sfx-durees.json";

/* ==========================================================================
 * LES BRUITAGES — chaque scène EXPORTE ses repères ; le film les joue tous (Film.tsx), en temps du FILM.
 *
 *   export const cues: Cue[] = [cue("scanner-bip", 26.4, 0.6), cue("whoosh-pb", 27.0, 0.5, 1.1), …];
 *   cue(name, at, gain = 0.6, rate = 1, dur?)    `dur` coupe le son après dur secondes (fondu de 0,15 s)
 *   every(name, from, to, step, gain?, rate?)     repère répété
 *   SFX_DUR[name]                                 durée du fichier (s)
 *
 * Les fichiers : public/rembobine/sfx/<nom>.wav (bibliothèque PARTAGÉE avec le film « Rembobinons », src/rembobine/tools/sons.mjs). Les coups sont à une crête de −3 dBFS, les ambiances à
 * −23 LUFS : gain 0,5 ≈ un bruitage bien présent sous la voix ; 0,25 discret ; 0,7 à 0,9 un impact.
 * La liste des noms = les clés de src/rembobine/kit/sfx-durees.json (la description des sons neufs : tableau NEW de src/rembobine/tools/sons.mjs).
 * ======================================================================== */

export const SFX_DUR = DUREES as Record<SfxName, number>;
export type SfxName = keyof typeof DUREES;

export type Cue = { name: SfxName; at: number; gain?: number; rate?: number; dur?: number };

export const cue = (name: SfxName, at: number, gain = 0.6, rate = 1, dur?: number): Cue => ({ name, at, gain, rate, dur });

export function every(name: SfxName, from: number, to: number, step: number, gain = 0.5, rate = 1): Cue[] {
  const out: Cue[] = [];
  for (let at = from; at < to - 1e-6; at += step) out.push(cue(name, at, gain, rate));
  return out;
}

/** Joue une liste de repères (à poser au niveau du film, hors de toute Sequence de scène). */
export function Cues({ cues }: { cues: Cue[] }) {
  return (
    <>
      {cues.map((c, i) => {
        const from = Math.max(0, Math.round(c.at * FPS));
        const lenF = c.dur ? Math.round(c.dur * FPS) : undefined;
        const g = c.gain ?? 0.6;
        return (
          <Sequence key={`${c.name}-${i}`} from={from} durationInFrames={lenF} layout="none" name={`♪ ${c.name}`}>
            <Audio
              src={staticFile(`rembobine/sfx/${c.name}.wav`)}
              playbackRate={c.rate ?? 1}
              volume={lenF ? (f: number) => g * Math.min(1, Math.max(0, (lenF - f) / (0.15 * FPS))) : g}
            />
          </Sequence>
        );
      })}
    </>
  );
}
