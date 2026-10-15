import type { ComponentType } from "react";
import type { SceneId } from "./time";
import type { SceneCues, SceneProps } from "./types";
import { Scene01, cues as cues01 } from "./scene-01-cadence";
import { Scene02, cues as cues02 } from "./scene-02-trou-de-memoire";
import { Scene03, cues as cues03 } from "./scene-03-ce-qui-se-perd";
import { Scene04, cues as cues04 } from "./scene-04-eveil";
import { Scene05, cues as cues05 } from "./scene-05-revelation";
import { Scene06, cues as cues06 } from "./scene-06-une-seconde";
import { Scene07, cues as cues07 } from "./scene-07-a-la-loupe";
import { Scene08, cues as cues08 } from "./scene-08-vendu";
import { Scene09, cues as cues09 } from "./scene-09-la-fete";
import { Scene10, cues as cues10 } from "./scene-10-equipe";
import { Scene11, cues as cues11 } from "./scene-11-confiance";
import { Scene12, cues as cues12 } from "./scene-12-signature";

/** Les 12 scènes du film, dans l'ordre : composant et effets sonores. (Orchestrateur : src/films/presentation.tsx.) */
export const SCENES: Record<SceneId, { Component: ComponentType<SceneProps>; cues: SceneCues }> = {
  S1: { Component: Scene01, cues: cues01 },
  S2: { Component: Scene02, cues: cues02 },
  S3: { Component: Scene03, cues: cues03 },
  S4: { Component: Scene04, cues: cues04 },
  S5: { Component: Scene05, cues: cues05 },
  S6: { Component: Scene06, cues: cues06 },
  S7: { Component: Scene07, cues: cues07 },
  S8: { Component: Scene08, cues: cues08 },
  S9: { Component: Scene09, cues: cues09 },
  S10: { Component: Scene10, cues: cues10 },
  S11: { Component: Scene11, cues: cues11 },
  S12: { Component: Scene12, cues: cues12 },
};
