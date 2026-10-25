import { useMemo } from "react";
import { AbsoluteFill, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Audio } from "@remotion/media";
import { FPS, SCENES, TOTAL_FRAMES, VOICE_AT, type SceneId } from "./timeline";
import { SCENE_COMPONENTS } from "./scenes";
import { Cues, type Cue } from "./kit/sound";
import { TopText } from "./kit/captions";
import { JAKARTA, N } from "./kit/brand";
import { Grain, Vignette } from "../presentation/motion/kit/grain";
import { FilmClock } from "../presentation/motion/kit/clock";
import VOIX from "../../public/cercle/voix/voix.json";

/* ==========================================================================
 * « LE CERCLE » — Reel PharmaBoost : une pharmacie avec PharmaBoost, une pharmacie sans. 9:16 (1080 × 1920), 60 i/s,
 * 52,5 s ; rendu 4K à l'échelle 2.
 *
 *  - chaque scène (scenes/cN-*.tsx) dans une <Sequence> limitée à sa fenêtre (timeline.ts) ; pendant un chevauchement,
 *    la scène qui SORT est au-dessus ;
 *  - au-dessus : un voile sombre en haut (lisibilité du texte), grain, vignette, LE GRAND TEXTE et la barre d'onglets ;
 *  - le son : la voix (Yann ; deux répliques reprises de « Rembobinons »), la musique (baissée sous la voix), les
 *    bruitages de toutes les scènes.
 * ======================================================================== */

export type FilmProps = { debug?: boolean; only?: SceneId | null };

function SceneHost({ id, from }: { id: SceneId; from: number }) {
  const frame = useCurrentFrame() + from;
  const Comp = SCENE_COMPONENTS[id].Scene;
  return (
    <FilmClock offset={from}>
      <Comp t={frame / FPS} />
    </FilmClock>
  );
}

const CUTS = VOIX.cuts as Record<string, { dur: number }>;
const VOICE_SPANS = Object.entries(VOICE_AT).map(([id, at]) => [at, at + CUTS[id].dur] as const);
function duckAt(t: number) {
  let d = 0;
  for (const [a, b] of VOICE_SPANS) {
    if (t >= a - 0.2 && t <= b + 0.4) d = Math.max(d, Math.min(Math.min(1, (t - (a - 0.2)) / 0.2), Math.min(1, (b + 0.4 - t) / 0.4)));
  }
  return d;
}
/** La musique : pleine entre les phrases, baissée sous la voix (le texte est dense : elle reste discrète). */
const musicGain = (t: number) => 0.5 + (0.22 - 0.5) * duckAt(t);

/** Le voile du haut : le grand texte reste lisible sur n'importe quel décor. */
export function TopVeil() {
  return <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 720, background: `linear-gradient(180deg, ${N.sky}F2 0%, ${N.sky}B3 45%, ${N.sky}00 100%)`, pointerEvents: "none" }} />;
}

function Clock({ t }: { t: number }) {
  return <div style={{ position: "absolute", left: 18, top: 14, padding: "6px 14px", borderRadius: 10, background: "rgba(0,0,0,.65)", color: "#fff", fontFamily: JAKARTA, fontWeight: 700, fontSize: 30, zIndex: 99 }}>{t.toFixed(2)} s</div>;
}

export function CercleFilm({ debug = false, only = null }: FilmProps) {
  const t = useCurrentFrame() / FPS;
  const ids = only ? SCENES.filter((s) => s.id === only) : SCENES;
  const cues = useMemo<Cue[]>(() => SCENES.flatMap((s) => SCENE_COMPONENTS[s.id].cues), []);
  return (
    <AbsoluteFill style={{ background: N.sky }}>
      {[...ids].reverse().map((s) => {
        const from = Math.round(s.start * FPS);
        const dur = Math.min(TOTAL_FRAMES, Math.round(s.end * FPS)) - from;
        return (
          <Sequence key={s.id} from={from} durationInFrames={dur} name={`${s.id} · ${s.name}`}>
            <SceneHost id={s.id} from={from} />
          </Sequence>
        );
      })}
      <TopVeil />
      <Grain t={t} opacity={0.03} />
      <Vignette strength={0.25} />
      <TopText t={t} />
      {debug && <Clock t={t} />}
      {Object.entries(VOICE_AT).map(([id, at]) => (
        <Sequence key={`voix-${id}`} from={Math.round(at * FPS)} layout="none" name={`Voix ${id}`}>
          <Audio src={staticFile(`cercle/voix/${id}.wav`)} volume={1} />
        </Sequence>
      ))}
      <Audio src={staticFile("cercle/music/musique.wav")} volume={(f: number) => musicGain(f / FPS)} />
      <Cues cues={cues} />
    </AbsoluteFill>
  );
}
