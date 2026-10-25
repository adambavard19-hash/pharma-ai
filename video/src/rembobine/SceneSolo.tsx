import type { ComponentType } from "react";
import { AbsoluteFill, Composition, useCurrentFrame } from "remotion";
import { FPS, TOTAL_FRAMES, sceneById, type SceneId } from "./timeline";
import { Captions } from "./kit/captions";
import { A1, JAKARTA } from "./kit/brand";
import { Grain, Vignette } from "../presentation/motion/kit/grain";
import { FilmClock } from "../presentation/motion/kit/clock";

/* ==========================================================================
 * UNE SCÈNE SEULE, en temps du film (image n = n / 60 s du film) — pour les planches (tools/planche.mjs) : le paquet ne
 * contient que CETTE scène et le kit, une scène voisine en chantier ne peut pas le casser. Hors de sa fenêtre : noir.
 * ======================================================================== */

type Mod = { Scene: ComponentType<{ t: number }> };

function Solo({ id, mod, debug }: { id: SceneId; mod: Mod; debug?: boolean }) {
  const t = useCurrentFrame() / FPS;
  const w = sceneById(id);
  const inside = t >= w.start && t < w.end;
  return (
    <AbsoluteFill style={{ background: A1.ink }}>
      {inside && (
        <FilmClock offset={0}>
          <mod.Scene t={t} />
        </FilmClock>
      )}
      <Grain t={t} opacity={0.025} />
      <Vignette strength={0.2} />
      <Captions t={t} />
      {debug !== false && (
        <div style={{ position: "absolute", left: 18, top: 14, padding: "6px 14px", borderRadius: 10, background: "rgba(0,0,0,.65)", color: "#fff", fontFamily: JAKARTA, fontWeight: 700, fontSize: 30 }}>
          {id} · {t.toFixed(2)} s
        </div>
      )}
    </AbsoluteFill>
  );
}

export function soloRoot(id: SceneId, mod: Mod) {
  const Comp = (p: { debug?: boolean }) => <Solo id={id} mod={mod} debug={p.debug} />;
  return function SoloRoot() {
    return <Composition id="Rembobine" component={Comp} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ debug: true }} />;
  };
}

/** Une planche de démonstration du kit (kit/demo-<nom>.tsx exporte `Scene({ t })`), sans fenêtre de scène. */
export function demoRoot(mod: Mod) {
  const Comp = () => {
    const t = useCurrentFrame() / FPS;
    return (
      <AbsoluteFill style={{ background: A1.ink }}>
        <FilmClock offset={0}>
          <mod.Scene t={t} />
        </FilmClock>
        <div style={{ position: "absolute", left: 18, top: 14, padding: "6px 14px", borderRadius: 10, background: "rgba(0,0,0,.65)", color: "#fff", fontFamily: JAKARTA, fontWeight: 700, fontSize: 30 }}>démo · {t.toFixed(2)} s</div>
      </AbsoluteFill>
    );
  };
  return function DemoRoot() {
    return <Composition id="Rembobine" component={Comp} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{}} />;
  };
}
