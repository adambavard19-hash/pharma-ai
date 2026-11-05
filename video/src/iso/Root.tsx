import { Composition } from "remotion";
import { FPS, LETTRE, PRESENTATION } from "./Film";

export function IsoRoot() {
  return (
    <>
      <Composition id="Presentation" component={PRESENTATION.Film} durationInFrames={PRESENTATION.TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="Lettre" component={LETTRE.Film} durationInFrames={LETTRE.TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
    </>
  );
}
