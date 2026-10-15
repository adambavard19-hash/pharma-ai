import { createContext, useContext, type ReactNode } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { CameraMotionBlur } from "@remotion/motion-blur";
import { FPS } from "./ease";

/* ==========================================================================
 * L'HORLOGE DU FILM — les scènes travaillent en temps ABSOLU (secondes du film).
 *
 * L'orchestrateur pose chaque scène dans une <Sequence> qui commence au début de sa fenêtre ; l'hôte de scène
 * (SceneHost) donne à la scène son `t` absolu en prop ET pose ce contexte, pour les composants qui doivent relire
 * l'image eux-mêmes (flou de mouvement, sons posés dans la scène).
 *
 *   <FilmClock offset={f0}>          (orchestrateur) image locale + f0 = image du film
 *   useFilmTime()                    temps du film en secondes, depuis n'importe quel composant d'une scène
 *   useFilmFrame()                   image du film (peut être fractionnaire sous un flou de mouvement)
 *   <MotionBlur on={…} samples={8}>{(t) => …}</MotionBlur>
 *        FLOU de mouvement (CameraMotionBlur 180°, 8 échantillons) : la fonction enfant reçoit le t de CHAQUE
 *        échantillon. Ne l'activer que sur les plages rapides (on = t ∈ plage) : chaque échantillon re-dessine tout.
 *        Exemple : <MotionBlur on={t > a && t < a + .25}>{(tt) => <Camera t={tt} zoom={tween(tt, a, .23, 1, 7, WHIP)}>…</Camera>}</MotionBlur>
 *
 * PIÈGE : ne pas imbriquer de <Sequence> dans une scène (elle décalerait l'image locale) ; tout se calcule depuis t.
 * ======================================================================== */

const Clock = createContext({ offset: 0 });

export function FilmClock({ offset, children }: { offset: number; children: ReactNode }) {
  return <Clock.Provider value={{ offset }}>{children}</Clock.Provider>;
}

export function useClockOffset() {
  return useContext(Clock).offset;
}

export function useFilmFrame() {
  return useCurrentFrame() + useContext(Clock).offset;
}

export function useFilmTime() {
  return useFilmFrame() / FPS;
}

function Sampled({ children }: { children: (t: number) => ReactNode }) {
  const t = useFilmTime();
  return <>{children(t)}</>;
}

export function MotionBlur({ on = true, samples = 8, shutter = 180, children }: { on?: boolean; samples?: number; shutter?: number; children: (t: number) => ReactNode }) {
  if (!on) return <Sampled>{children}</Sampled>;
  return (
    <AbsoluteFill>
      <CameraMotionBlur shutterAngle={shutter} samples={samples}>
        <Sampled>{children}</Sampled>
      </CameraMotionBlur>
    </AbsoluteFill>
  );
}
