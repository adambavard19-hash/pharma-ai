import { Composition } from "remotion";
import { FPS } from "./kit";
import { FILM as F1 } from "./film1/Film";
import { FILM as F2 } from "./film2/Film";
import { FILM as F3 } from "./film3/Film";
import { FILM as F4 } from "./film4/Film";

export function PromoRoot() {
  return (
    <>
      <Composition id="Presentation1" component={F1.Film} durationInFrames={F1.TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="Presentation2" component={F2.Film} durationInFrames={F2.TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="Presentation3" component={F3.Film} durationInFrames={F3.TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
      <Composition id="Presentation4" component={F4.Film} durationInFrames={F4.TOTAL_FRAMES} fps={FPS} width={1920} height={1080} />
    </>
  );
}
