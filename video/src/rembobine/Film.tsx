import { useMemo } from "react";
import { AbsoluteFill, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Audio } from "@remotion/media";
import { DROP, FPS, SCENES, TOTAL_FRAMES, VOICE_AT, type SceneId } from "./timeline";
import { SCENE_COMPONENTS } from "./scenes";
import { Cues, cue, type Cue } from "./kit/sound";
import { Captions } from "./kit/captions";
import { A1, JAKARTA } from "./kit/brand";
import { Grain, Vignette } from "../presentation/motion/kit/grain";
import { FilmClock } from "../presentation/motion/kit/clock";
import VOIX from "../../public/rembobine/voix/voix.json";

/* ==========================================================================
 * « REMBOBINONS » — le film de présentation PharmaBoost. 16:9 (1920 × 1080), 60 i/s, 75 s ; rendu 4K à l'échelle 2.
 *
 *  - chaque scène (scenes/sNN-*.tsx) dans une <Sequence> limitée à sa fenêtre (timeline.ts) ; pendant un chevauchement,
 *    la scène qui SORT est au-dessus ;
 *  - au-dessus : grain, vignette, sous-titres ;
 *  - le son : les 17 répliques (Yann, Clémence, Eric), la musique (baissée sous la voix), l'ambiance de la pharmacie, les
 *    bruitages de toutes les scènes.
 *
 * Props : debug (affiche le temps du film en haut à gauche, pour les planches), only (ne dessine que cette scène).
 * ======================================================================== */

export type FilmProps = { debug?: boolean; only?: SceneId | null };

/** La scène reçoit le temps ABSOLU du film. */
function SceneHost({ id, from }: { id: SceneId; from: number }) {
  const frame = useCurrentFrame() + from;
  const Comp = SCENE_COMPONENTS[id].Scene;
  return (
    <FilmClock offset={from}>
      <Comp t={frame / FPS} />
    </FilmClock>
  );
}

const CUTS = VOIX.cuts as Record<string, { dur: number; who: string }>;
const VOICE_SPANS = Object.entries(VOICE_AT).map(([id, at]) => [at, at + CUTS[id].dur, CUTS[id].who === "yann" ? 1 : 1.25] as const);

/** 0 hors de la voix, 1 sous la voix (attaque 0,2 s avant, relâche 0,45 s après) ; un peu plus bas sous les répliques. */
function duckAt(t: number) {
  let d = 0;
  for (const [a, b, depth] of VOICE_SPANS) {
    if (t >= a - 0.2 && t <= b + 0.45) {
      const up = Math.min(1, (t - (a - 0.2)) / 0.2);
      const down = Math.min(1, (b + 0.45 - t) / 0.45);
      d = Math.max(d, Math.min(up, down) * depth);
    }
  }
  return d;
}

/** Le niveau de la musique : discret pendant la scène du comptoir, plein entre les phrases, baissé sous la voix. */
function musicGain(t: number) {
  const base = t < 7.8 ? 0.22 : 0.55;
  const under = t < 7.8 ? 0.12 : 0.24;
  return Math.max(0.06, base + (under - base) * duckAt(t));
}

/** L'ambiance de la pharmacie : la vraie scène (acte 1), puis la même, rejouée, sous la musique. */
const BED: Cue[] = [cue("pharmacie-ambiance", 0, 0.55, 1, 7.6), cue("pharmacie-ambiance", DROP + 0.2, 0.25, 1, 9.5)];

function Clock({ t }: { t: number }) {
  return (
    <div style={{ position: "absolute", left: 18, top: 14, padding: "6px 14px", borderRadius: 10, background: "rgba(0,0,0,.65)", color: "#fff", fontFamily: JAKARTA, fontWeight: 700, fontSize: 30, zIndex: 99 }}>
      {t.toFixed(2)} s
    </div>
  );
}

export function RembobineFilm({ debug = false, only = null }: FilmProps) {
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const ids = only ? SCENES.filter((s) => s.id === only) : SCENES;
  const cues = useMemo(() => [...BED, ...SCENES.flatMap((s) => SCENE_COMPONENTS[s.id].cues)], []);
  return (
    <AbsoluteFill style={{ background: A1.ink }}>
      {[...ids].reverse().map((s) => {
        const from = Math.round(s.start * FPS);
        const dur = Math.min(TOTAL_FRAMES, Math.round(s.end * FPS)) - from;
        return (
          <Sequence key={s.id} from={from} durationInFrames={dur} name={`${s.id} · ${s.name}`}>
            <SceneHost id={s.id} from={from} />
          </Sequence>
        );
      })}
      <Grain t={t} opacity={0.025} />
      <Vignette strength={0.2} />
      <Captions t={t} />
      {debug && <Clock t={t} />}
      {Object.entries(VOICE_AT).map(([id, at]) => (
        <Sequence key={`voix-${id}`} from={Math.round(at * FPS)} layout="none" name={`Voix ${id}`}>
          <Audio src={staticFile(`rembobine/voix/${id}.wav`)} volume={1} />
        </Sequence>
      ))}
      <Audio src={staticFile("rembobine/music/musique.wav")} volume={(f: number) => musicGain(f / FPS)} />
      <Cues cues={cues} />
    </AbsoluteFill>
  );
}
