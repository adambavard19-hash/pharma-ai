import { Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { useLocalVideo } from "../theme";

export type SfxName = "bip" | "whoosh" | "clic" | "pop" | "tic" | "touche1" | "touche2" | "touche3" | "notif" | "impact" | "montee" | "swish";

/** Un effet sonore posé à une image de scène, à côté de l'animation qu'il accompagne. */
export function Sfx({ at, name, volume = 1 }: { at: number; name: SfxName; volume?: number }) {
  const toLocal = useLocalVideo();
  const from = toLocal(at);
  if (from < 0) return null;
  return (
    <Sequence from={from} layout="none">
      <Audio src={staticFile(`sfx/${name}.wav`)} volume={volume} />
    </Sequence>
  );
}

/** Une frappe au clavier : une touche par caractère, en alternant trois sons. */
export function Typing({ at, text, cps, volume = 0.5 }: { at: number; text: string; cps: number; volume?: number }) {
  const step = 30 / cps;
  return (
    <>
      {Array.from(text).map((ch, i) =>
        ch === " " && i % 3 !== 0 ? null : <Sfx key={i} at={at + i * step} name={(["touche1", "touche2", "touche3"] as const)[(i * 7) % 3]} volume={volume * (0.75 + 0.25 * ((i * 13) % 4) / 3)} />,
      )}
    </>
  );
}
