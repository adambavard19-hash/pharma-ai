/* ==========================================================================
 * LE KIT DU FILM « REMBOBINONS » — import { … } from "../kit" depuis un fichier de scène.
 *
 * Propre au film :   brand (A1 = acte 1, PB = PharmaBoost, polices, styles), layout (L : 1920 × 1080, L.capY = 930),
 *                    fx (LightLeak, Flash, WipeBar, Sparkle, Bokeh…), sound (cue, every, Cue, SFX_DUR),
 *                    decor (le comptoir, les personnages, les boîtes, l'ordonnance — partagés par les scènes),
 *                    screens (la bannière du comptoir, le compteur des conseils vendus, l'e-mail du bilan, l'appli…).
 * Repris du kit PharmaBoost (src/presentation/motion/kit, lire l'en-tête de chaque module) :
 *                    ease (prog, tween, keys, ressort, pulse, squash, anticip, wobble, SNAP, POP, WHIP, EXIT, IN_OUT, F),
 *                    random (hash, rnd, seedOf), camera (<Camera/>, shake), particles (Confetti, Sparks, Burst, Ring,
 *                    Dust, Converge, Coins), kinetic (<Word/>, <Enter/>, <Exit/>, <Glitch/>), grain (Grain, Vignette),
 *                    clock (MotionBlur), shards (<Shatter/>), odometer (<Odometer/>, <SlotDigits/>), glass (<Glass/>),
 *                    dotgrid (<DotGrid/>).
 * Le robot de PharmaBoost : import { Mascot, type Track } from "../../presentation/mascot" (lire son en-tête).
 * ======================================================================== */
export * from "./brand";
export * from "./layout";
export * from "./fx";
export * from "./sound";
export * from "./decor";
export * from "./screens";
export * from "../../presentation/motion/kit/ease";
export { hash, rnd, seedOf, mulberry32 } from "../../presentation/motion/kit/random";
export { pick as pickRandom } from "../../presentation/motion/kit/random";
export * from "../../presentation/motion/kit/camera";
export * from "../../presentation/motion/kit/particles";
export * from "../../presentation/motion/kit/kinetic";
export * from "../../presentation/motion/kit/grain";
export * from "../../presentation/motion/kit/shards";
export * from "../../presentation/motion/kit/odometer";
export * from "../../presentation/motion/kit/glass";
export * from "../../presentation/motion/kit/dotgrid";
export { MotionBlur } from "../../presentation/motion/kit/clock";
