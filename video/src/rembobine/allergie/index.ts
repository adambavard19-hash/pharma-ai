import type { ComponentType } from "react";
import type { Cue } from "../kit/sound";
import * as S1 from "./s01-comptoir";
import * as S2 from "./s02-rien";
import * as S3 from "./s03-chaque-jour";
import * as S4 from "./s04-rembobinons";
import * as S5 from "./s05-meme-ordonnance";
import * as S6 from "./s06-le-bon-conseil";
import * as S7 from "./s07-les-mots";
import * as S8 from "./s08-je-veux-bien";

/** Les scènes de « Rembobinons » rejouées sur la routine allergie (film de la lettre, 3 nov. 2026), avec leurs fenêtres
 * en temps d'histoire (celles du film d'origine, timeline.ts). */
export type AllergieId = "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8";
export const ALLERGIE: { id: AllergieId; start: number; end: number; mod: { Scene: ComponentType<{ t: number }>; cues: Cue[] } }[] = [
  { id: "S1", start: 0, end: 6.5, mod: S1 },
  { id: "S2", start: 6.0, end: 13.1, mod: S2 },
  { id: "S3", start: 12.6, end: 17.2, mod: S3 },
  { id: "S4", start: 16.7, end: 20.5, mod: S4 },
  { id: "S5", start: 20.0, end: 26.4, mod: S5 },
  { id: "S6", start: 25.9, end: 30.5, mod: S6 },
  { id: "S7", start: 30.0, end: 35.8, mod: S7 },
  { id: "S8", start: 35.3, end: 45.3, mod: S8 },
];
