import { Composition } from "remotion";
import { FPS, LettreFilm, TOTAL_FRAMES } from "./Lettre";

export function LettreRoot() {
  return <Composition id="Lettre" component={LettreFilm} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />;
}
