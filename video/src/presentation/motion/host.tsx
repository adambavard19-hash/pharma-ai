import { AbsoluteFill, useCurrentFrame } from "remotion";
import { FilmClock } from "./kit/clock";
import { SCENES } from "./scenes";
import type { SceneId, Time } from "./time";

/**
 * L'hôte d'une scène : posé dans une <Sequence> qui commence à l'image `offset` du film, il donne à la scène son
 * temps ABSOLU (t = (image locale + offset) / 60) et pose l'horloge du film (flou de mouvement, sons).
 */
export function SceneHost({ id, time, offset }: { id: SceneId; time: Time; offset: number }) {
  const frame = useCurrentFrame();
  const t = (frame + offset) / 60;
  const { Component } = SCENES[id];
  return (
    <FilmClock offset={offset}>
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <Component t={t} tl={time.tl} time={time} win={time.win[id]} />
      </AbsoluteFill>
    </FilmClock>
  );
}
