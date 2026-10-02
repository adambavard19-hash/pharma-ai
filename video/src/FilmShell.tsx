import type { ComponentType } from "react";
import { AbsoluteFill, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Audio } from "@remotion/media";
import { C, ClockOffset, EASE, EASE_IN_OUT, FEATURES, FONT, FPS, OUT_FPS, tw } from "./theme";
import type { SfxName } from "./ui/sfx";

/**
 * Un film = des scènes posées sur une grille en images de scène (30/s), un
 * rapport de vitesse, une musique. Chaque scène entre pendant les `overlap`
 * dernières images de la précédente ; son horloge vaut 0 sur son début.
 */
export type FilmSpec = {
  scenes: { C: ComponentType<{ intro: number }>; at: number }[];
  end: number;
  overlap: number;
  speed: number;
  music: string;
  /** Images de scène où la musique s'efface un instant (bips). */
  duck?: number[];
  /** Effets sonores du montage, en images de scène. */
  cues?: { at: number; name: SfxName; volume?: number }[];
  /** L'étiquette du thème, en haut à gauche pendant les premières secondes. */
  tag?: string;
};

export const filmRate = (spec: FilmSpec) => (spec.speed * FPS) / OUT_FPS;
export const filmDuration = (spec: FilmSpec) => Math.round(spec.end / filmRate(spec));

export function FilmShell({ spec }: { spec: FilmSpec }) {
  const rate = filmRate(spec);
  const v = (sceneFrame: number) => Math.round(sceneFrame / rate);
  return (
    <AbsoluteFill style={{ background: C.brand900, fontFamily: FONT, fontFeatureSettings: FEATURES }}>
      {spec.scenes.map(({ C: Scene, at }, i) => {
        const from = v(i === 0 ? 0 : at - spec.overlap);
        const next = spec.scenes[i + 1];
        const to = v(next ? next.at + spec.overlap : spec.end);
        return (
          <Sequence key={i} from={from} durationInFrames={to - from} name={Scene.name}>
            <ClockOffset.Provider value={{ from, bound: at, rate }}>
              <Scene intro={i === 0 ? 0 : spec.overlap} />
            </ClockOffset.Provider>
          </Sequence>
        );
      })}
      {(spec.cues ?? []).map((c, i) => (
        <Sequence key={`cue${i}`} from={v(c.at)} layout="none">
          <Audio src={staticFile(`sfx/${c.name}.wav`)} volume={c.volume ?? 1} />
        </Sequence>
      ))}
      {spec.tag && <ThemeTag text={spec.tag} />}
      <Audio
        src={staticFile(spec.music)}
        volume={(f) => 0.9 * Math.min(1, ...(spec.duck ?? []).map((b) => interpolate(f, [b - 4, b, b + 10, b + 22].map(v), [1, 0.45, 0.45, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })))}
      />
    </AbsoluteFill>
  );
}

/** « COMMENT ÇA MARCHE » : une pastille qui situe le film dans la série. */
function ThemeTag({ text }: { text: string }) {
  const f = (useCurrentFrame() / OUT_FPS) * 30; // en images de 30/s, quelle que soit la cadence
  const p = Math.min(tw(f, [6, 22], [0, 1], EASE), 1 - tw(f, [96, 110], [0, 1], EASE_IN_OUT));
  if (p <= 0) return null;
  return (
    <div style={{ position: "absolute", left: 64, top: 52, display: "flex", alignItems: "center", gap: 12, padding: "12px 22px 12px 14px", borderRadius: 999, background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.22)", backdropFilter: "blur(8px)", opacity: p, transform: `translateY(${(1 - p) * -16}px)` }}>
      <span style={{ width: 12, height: 12, borderRadius: 6, background: C.accent400 }} />
      <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: C.white }}>{text}</span>
    </div>
  );
}
