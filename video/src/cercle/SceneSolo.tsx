import type { ComponentType } from "react";
import { AbsoluteFill, Composition, useCurrentFrame } from "remotion";
import { FPS, TOTAL_FRAMES, sceneById, type SceneId } from "./timeline";
import { TopText } from "./kit/captions";
import { JAKARTA, N } from "./kit/brand";
import { TopVeil } from "./Film";
import { Grain, Vignette } from "../presentation/motion/kit/grain";
import { FilmClock } from "../presentation/motion/kit/clock";

/* ==========================================================================
 * UNE SCÈNE SEULE, en temps du film — pour les planches (tools/planche.mjs). Hors de sa fenêtre : noir.
 * demoRoot : la démonstration d'un module du kit (kit/demo-<nom>.tsx), sans fenêtre.
 * ======================================================================== */

type Mod = { Scene: ComponentType<{ t: number }> };
const Tag = ({ text }: { text: string }) => (
  <div style={{ position: "absolute", left: 18, top: 14, padding: "6px 14px", borderRadius: 10, background: "rgba(0,0,0,.65)", color: "#fff", fontFamily: JAKARTA, fontWeight: 700, fontSize: 30, zIndex: 99 }}>{text}</div>
);

function Solo({ id, mod }: { id: SceneId; mod: Mod }) {
  const t = useCurrentFrame() / FPS;
  const w = sceneById(id);
  return (
    <AbsoluteFill style={{ background: N.sky }}>
      {t >= w.start && t < w.end && (
        <FilmClock offset={0}>
          <mod.Scene t={t} />
        </FilmClock>
      )}
      <TopVeil />
      <Grain t={t} opacity={0.03} />
      <Vignette strength={0.25} />
      <TopText t={t} />
      <Tag text={`${id} · ${t.toFixed(2)} s`} />
    </AbsoluteFill>
  );
}

export function soloRoot(id: SceneId, mod: Mod) {
  const Comp = () => <Solo id={id} mod={mod} />;
  return function SoloRoot() {
    return <Composition id="Cercle" component={Comp} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1080} height={1920} defaultProps={{}} />;
  };
}

export function demoRoot(mod: Mod) {
  const Comp = () => {
    const t = useCurrentFrame() / FPS;
    return (
      <AbsoluteFill style={{ background: N.sky }}>
        <FilmClock offset={0}>
          <mod.Scene t={t} />
        </FilmClock>
        <Tag text={`démo · ${t.toFixed(2)} s`} />
      </AbsoluteFill>
    );
  };
  return function DemoRoot() {
    return <Composition id="Cercle" component={Comp} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1080} height={1920} defaultProps={{}} />;
  };
}
