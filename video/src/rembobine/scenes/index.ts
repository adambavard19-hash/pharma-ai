import type { ComponentType } from "react";
import type { SceneId } from "../timeline";
import type { Cue } from "../kit/sound";
import * as S1 from "./s01-comptoir";
import * as S2 from "./s02-rien";
import * as S3 from "./s03-chaque-jour";
import * as S4 from "./s04-rembobinons";
import * as S5 from "./s05-meme-ordonnance";
import * as S6 from "./s06-le-bon-conseil";
import * as S7 from "./s07-les-mots";
import * as S8 from "./s08-je-veux-bien";
import * as S9 from "./s09-equipe";
import * as S10 from "./s10-patient";
import * as S11 from "./s11-application";
import * as S12 from "./s12-marques";
import * as S13 from "./s13-signature";

/** Chaque fichier de scène exporte `Scene({ t })` (t = temps du FILM, en s) et `cues` (ses bruitages, en temps du film). */
export type SceneModule = { Scene: ComponentType<{ t: number }>; cues: Cue[] };

export const SCENE_COMPONENTS: Record<SceneId, SceneModule> = { S1, S2, S3, S4, S5, S6, S7, S8, S9, S10, S11, S12, S13 };
