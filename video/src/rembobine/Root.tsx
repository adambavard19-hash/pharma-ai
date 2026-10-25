import { Composition } from "remotion";
import { RembobineFilm, type FilmProps } from "./Film";
import { FPS, TOTAL_FRAMES } from "./timeline";

const defaults: FilmProps = { debug: false, only: null };

export function RembobineRoot() {
  // 16:9 — le site et les démos. Rendu 4K : --scale=2 (3840 × 2160).
  return <Composition id="Rembobine" component={RembobineFilm} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={defaults} />;
}
