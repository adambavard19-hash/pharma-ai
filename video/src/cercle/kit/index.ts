/* ==========================================================================
 * LE KIT DU FILM « LE CERCLE » — import { … } from "../kit" depuis un fichier de scène.
 *
 * Propre au film :   brand (N = la nuit, PB = PharmaBoost, polices, styles), layout (L : 1080 × 1920, bande du texte
 *                    250 → 560, scène utile 580 → 1480), fx (LightLeak, Flash, WipeBar, Sparkle, Bokeh…),
 *                    sound (cue, every, Cue, SFX_DUR — bibliothèque partagée avec « Rembobinons »),
 *                    city (la rue isométrique de nuit, les deux pharmacies, les passants) — écrit par la phase « Kit ».
 * Repris de « Rembobinons » : src/rembobine/kit/decor.tsx (comptoir, personnages, boîtes, ordonnance) et
 *                    src/rembobine/kit/screens.tsx (bannière du comptoir, compteur, téléphone, e-mail du bilan, appli,
 *                    logo) — à importer directement : import { BannerHead, Phone, … } from "../../rembobine/kit/screens".
 * Repris du kit PharmaBoost (src/presentation/motion/kit, lire l'en-tête de chaque module) :
 *                    ease, random, camera, particles, kinetic, grain, shards, odometer, glass, dotgrid, clock (MotionBlur).
 * Le robot de PharmaBoost : import { Mascot, type Track } from "../../presentation/mascot".
 * ======================================================================== */
export * from "./brand";
export * from "./layout";
export * from "./fx";
export * from "./sound";
export * from "./city";
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
