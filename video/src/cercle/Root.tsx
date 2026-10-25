import { Composition } from "remotion";
import { CercleFilm, type FilmProps } from "./Film";
import { FPS, TOTAL_FRAMES } from "./timeline";

const defaults: FilmProps = { debug: false, only: null };

export function CercleRoot() {
  // 9:16 — Reels, Stories. Rendu 4K : --scale=2 (2160 × 3840).
  return <Composition id="Cercle" component={CercleFilm} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1080} height={1920} defaultProps={defaults} />;
}
