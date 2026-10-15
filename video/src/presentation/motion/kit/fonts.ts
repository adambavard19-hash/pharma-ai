import type { CSSProperties } from "react";
import { loadFont as loadJakarta } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";

/* ==========================================================================
 * POLICES — Plus Jakarta Sans 600/700/800 et JetBrains Mono 600/700 (chargées ici, rien d'autre à faire).
 *
 *   JAKARTA, MONO                    noms de famille CSS
 *   hero(size)                       mot héros : 800, approche −0,045em, interligne .9
 *   title(size)                      titre : 800, −0,03em
 *   support(size)                    phrase d'appui : 700, −0,02em
 *   label(size)                      étiquette : 700 MAJUSCULES, +0,12em
 *   digits(size, weight = 700)       chiffres vivants : JetBrains Mono, chiffres tabulaires
 *
 * Exemple : <div style={{ ...hero(280), color: "#fff" }}>COMPTOIR</div>
 * ======================================================================== */

const jakarta = loadJakarta("normal", { weights: ["600", "700", "800"], subsets: ["latin", "latin-ext"] });
const mono = loadMono("normal", { weights: ["600", "700"], subsets: ["latin", "latin-ext"] });

export const JAKARTA = jakarta.fontFamily;
export const MONO = mono.fontFamily;

export const hero = (size: number): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: 800, fontSize: size, letterSpacing: "-0.045em", lineHeight: 0.9 });
export const title = (size: number): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: 800, fontSize: size, letterSpacing: "-0.03em", lineHeight: 1 });
export const support = (size: number): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: 700, fontSize: size, letterSpacing: "-0.02em", lineHeight: 1.1 });
export const label = (size: number): CSSProperties => ({ fontFamily: JAKARTA, fontWeight: 700, fontSize: size, letterSpacing: "0.12em", textTransform: "uppercase", lineHeight: 1 });
export const digits = (size: number, weight: 600 | 700 = 700): CSSProperties => ({ fontFamily: MONO, fontWeight: weight, fontSize: size, fontVariantNumeric: "tabular-nums", lineHeight: 1 });
