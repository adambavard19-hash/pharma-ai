import type { PresentationTimeline } from "../timeline";
import type { Cue } from "./kit/sfx";
import type { SceneWindow, Time } from "./time";

/* ==========================================================================
 * LE CONTRAT D'UNE SCÈNE.
 *
 *   export function Scene06({ t, tl, time, win }: SceneProps) { … }
 *     t     temps du FILM en secondes (absolu : t = time.A("P7", 0) quand « Vous scannez » commence)
 *     tl    la timeline brute (presentationTimeline) — lines[i].start/end/chunks[j].start
 *     time  les ancrages : time.A("P7", 1), time.Z("P8"), time.marks.drop, time.beat(k), time.win.S6… (motion/time.ts)
 *     win   la fenêtre de CETTE scène (= time.win.S6) : la scène n'est montée qu'entre win.start et win.end
 *
 *   export const cues: SceneCues = (time) => [cue("hud_lock", time.A("P7", 0) + .4, .5), …];
 *     les effets sonores de la scène, en secondes du film (joués par motion/sound.tsx).
 *
 * La scène dessine TOUT son cadre 1920×1080 : son fond opaque, sa <DotGrid>, son monde dans <Camera>. Le grain, la
 * vignette, les sous-titres et la mention sont posés par l'orchestrateur au-dessus.
 * ======================================================================== */

export type SceneProps = { t: number; tl: PresentationTimeline; time: Time; win: SceneWindow };
export type SceneCues = (time: Time) => Cue[];
