import type { ComponentType } from "react";
import type { SceneId } from "../timeline";
import type { Cue } from "../kit/sound";
import * as C1 from "./c1-la-rue";
import * as C2 from "./c2-le-comptoir";
import * as C3 from "./c3-le-patient";
import * as C4 from "./c4-l-appli";
import * as C5 from "./c5-le-cercle";
import * as C6 from "./c6-a-cote";
import * as C7 from "./c7-pharmaboost";
import * as C8 from "./c8-final";

/** Chaque fichier de scène exporte `Scene({ t })` (t = temps du FILM, en s) et `cues` (ses bruitages, en temps du film). */
export type SceneModule = { Scene: ComponentType<{ t: number }>; cues: Cue[] };

export const SCENE_COMPONENTS: Record<SceneId, SceneModule> = { C1, C2, C3, C4, C5, C6, C7, C8 };
