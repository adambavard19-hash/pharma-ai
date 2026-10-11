import { BANNER } from "../../../agent/src/banner-design";
import { EYE_SHAPES } from "@/core/robot/motion";

/**
 * La feuille de style du robot : UNE pour toute la page (React la remonte dans le <head> une seule fois, quel que soit
 * le nombre de robots). Le corps, la tête, les yeux, la main et les particules sont posés à chaque image par le moteur
 * (core/robot/motion.ts) ; ici restent les expressions (quels yeux, quelle bouche), la lampe, l'étoile, les points de
 * réflexion, les confettis et le flottement — et l'immobilité pour qui a demandé à réduire les animations.
 *
 * Le dessin est celui de la mascotte du poste (agent/src/banner-preview.ts, `mascotSvg`) et du logo : mêmes couleurs,
 * lues dans BANNER. Rien ne bouge pour qui a demandé à réduire les animations — l'humeur se lit alors à l'expression
 * seule (yeux, bouche, lampe).
 */
const C = BANNER.colors;

/** La lampe inquiète : l'ambre des pastilles « challenge » de la bannière, sérieux sans être rouge d'alarme. */
export const LAMP_CONCERNED = C.challengeIcon;

export function robotCss(): string {
  return `
.rbt{position:relative;display:inline-block;flex-shrink:0;line-height:0;-webkit-tap-highlight-color:transparent}
.rbt svg{display:block;width:100%;height:100%;overflow:visible}
.rbt[data-interactive]{cursor:pointer;touch-action:manipulation;user-select:none}
.rbt-float{transform-box:view-box;transform-origin:50px 80px}
.rbt-shadow{transform-box:fill-box;transform-origin:center}
.rbt-lids,.rbt-spiral,.rbt-dots circle,.rbt-z,.rbt-glow,.rbt-spark,.rbt-confetti>*,.rbt-pop,.rbt-q{transform-box:fill-box;transform-origin:center}
.rbt-hand{transform-box:fill-box;transform-origin:20% 90%;opacity:0}
.rbt-lamp,.rbt-glow{fill:var(--rbt-lamp,${C.eye});transition:fill .4s}
.rbt-particles{pointer-events:none}

/* Les yeux : une seule forme visible, celle que le moteur choisit (data-eye). */
.rbt-eye{display:none}
${EYE_SHAPES.map((eye) => `.rbt[data-eye=${eye}] .rbt-${eye === "pill" ? "eo" : eye === "happy" ? "eh" : eye === "closed" ? "ez" : eye === "spiral" ? "es" : `e-${eye}`}`).join(",")}{display:inline}

/* Les bouches : celle de l'humeur, sauf quand les yeux disent autre chose (agacé, cœurs, étoiles, bâillement). */
.rbt-brow,.rbt-m,.rbt-dots,.rbt-q,.rbt-z,.rbt-confetti,.rbt-pop{display:none}
.rbt[data-face=idle] .rbt-m-idle,.rbt[data-face=curious] .rbt-m-o,.rbt[data-face=thinking] .rbt-m-flat,
.rbt[data-face=concerned] .rbt-m-worry,.rbt[data-face=happy] .rbt-m-happy,.rbt[data-face=celebrate] .rbt-m-happy,.rbt[data-face=sleepy] .rbt-m-sleep,
.rbt[data-face=dizzy] .rbt-m-wave{display:inline}
.rbt[data-eye=line] .rbt-m,.rbt[data-eye=heart] .rbt-m,.rbt[data-eye=star] .rbt-m,.rbt[data-eye=tired] .rbt-m,.rbt[data-eye=spiral] .rbt-m{display:none}
.rbt[data-eye=line] .rbt-m-flat,.rbt[data-eye=heart] .rbt-m-happy,.rbt[data-eye=star] .rbt-m-happy,.rbt[data-eye=tired] .rbt-m-o,.rbt[data-eye=spiral] .rbt-m-wave{display:inline}
.rbt[data-face=concerned] .rbt-brow{display:inline}
.rbt[data-face=thinking] .rbt-dots,.rbt[data-face=curious] .rbt-q{display:inline}
.rbt[data-burst=party] .rbt-confetti{display:inline}
.rbt[data-burst=jump] .rbt-pop,.rbt[data-burst=giggle] .rbt-pop{display:inline}

.rbt[data-face=concerned] .rbt-lamp,.rbt[data-face=concerned] .rbt-glow{fill:${LAMP_CONCERNED}}
.rbt[data-face=thinking] .rbt-spark,.rbt[data-face=concerned] .rbt-spark,.rbt[data-face=sleepy] .rbt-spark,.rbt[data-face=dizzy] .rbt-spark{display:none}
.rbt[data-face=sleepy] .rbt-glow{opacity:.08}
.rbt[data-face=sleepy] .rbt-lamp{opacity:.45}

/* Ce qui vit tout le temps. */
@keyframes rbt-float{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-7px) rotate(3deg)}}
@keyframes rbt-shadow{0%,100%{transform:scaleX(1);opacity:.32}50%{transform:scaleX(.68);opacity:.16}}
@keyframes rbt-glow{0%,100%{opacity:.16;transform:scale(.8)}50%{opacity:.55;transform:scale(1.2)}}
@keyframes rbt-glow-think{0%,100%{opacity:.2;transform:scale(.8)}50%{opacity:.85;transform:scale(1.45)}}
@keyframes rbt-twinkle{0%,100%{transform:scale(.7) rotate(0);opacity:.55}50%{transform:scale(1.2) rotate(18deg);opacity:1}}
@keyframes rbt-dot{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-2px)}}
@keyframes rbt-z{0%{opacity:0;transform:translate(0,4px) scale(.6)}30%{opacity:.9}100%{opacity:0;transform:translate(5px,-9px) scale(1.1)}}
@keyframes rbt-spin{to{transform:rotate(360deg)}}
@keyframes rbt-confetti{0%{opacity:0;transform:translate(calc(var(--tx) * -1px),calc(var(--ty) * -1px)) scale(.3) rotate(0)}15%{opacity:1}75%{opacity:1}100%{opacity:0;transform:translate(0,4px) scale(1) rotate(160deg)}}
@keyframes rbt-pop{0%{opacity:0;transform:scale(.2)}35%{opacity:1;transform:scale(1.15)}100%{opacity:0;transform:scale(.6) rotate(40deg)}}
.rbt[data-float] .rbt-float{animation:rbt-float 3.6s ease-in-out infinite}
.rbt[data-float] .rbt-shadow{animation:rbt-shadow 3.6s ease-in-out infinite}
.rbt-glow{animation:rbt-glow 2.2s ease-in-out infinite}
.rbt[data-face=thinking] .rbt-glow{animation:rbt-glow-think .95s ease-in-out infinite}
.rbt[data-face=concerned] .rbt-glow{animation-duration:3s}
.rbt[data-face=sleepy] .rbt-glow{animation:none}
.rbt-spark{animation:rbt-twinkle 1.8s ease-in-out infinite}
.rbt[data-face=happy] .rbt-spark{animation-duration:.9s}
.rbt-dots circle{animation:rbt-dot 1.2s ease-in-out infinite}
.rbt-dots circle:nth-child(2){animation-delay:.18s}
.rbt-dots circle:nth-child(3){animation-delay:.36s}
.rbt-z{animation:rbt-z 2.6s ease-out infinite}
@keyframes rbt-q{0%,100%{transform:translateY(0) rotate(-6deg)}50%{transform:translateY(-2px) rotate(6deg)}}
.rbt-q{animation:rbt-q 1.6s ease-in-out infinite}
.rbt-spiral{animation:rbt-spin .9s linear infinite}
.rbt-confetti>*{opacity:0;animation:rbt-confetti 1.5s cubic-bezier(.2,.7,.3,1) both}
.rbt-confetti>:nth-child(2n){animation-delay:.08s}
.rbt-confetti>:nth-child(3n){animation-delay:.16s}
.rbt-pop{animation:rbt-pop .7s ease-out both}

/* La bulle d'une phrase, et le compagnon qui arrive : une entrée douce, rien de plus. */
@keyframes rbt-bubble{from{opacity:0;transform:translateY(6px) scale(.96)}to{opacity:1;transform:none}}
@keyframes rbt-arrive{from{opacity:0;transform:translateY(18px) scale(.9)}to{opacity:1;transform:none}}
.rbt-bubble{animation:rbt-bubble .32s cubic-bezier(.2,.8,.3,1) both}
.rbt-arrive{animation:rbt-arrive .45s cubic-bezier(.2,.9,.3,1.15) both}

/* Tout petit (moins de 32 px) : un dessin plus simple, qui reste net. */
.rbt[data-tiny] .rbt-glint,.rbt[data-tiny] .rbt-spark,.rbt[data-tiny] .rbt-dots,.rbt[data-tiny] .rbt-q,.rbt[data-tiny] .rbt-z,.rbt[data-tiny] .rbt-blush,.rbt[data-tiny] .rbt-confetti,.rbt[data-tiny] .rbt-pop,.rbt[data-tiny] .rbt-brow{display:none}

/* Réduire les animations : rien ne bouge, l'expression reste. Une fête se lit alors à ses étincelles, immobiles. */
.rbt[data-motion=reduce] *{animation:none!important;transition:none!important}
.rbt[data-motion=reduce][data-face=sleepy] .rbt-z{display:inline}
.rbt[data-motion=reduce][data-mood=celebrate] .rbt-confetti{display:inline}
.rbt[data-motion=reduce][data-mood=celebrate] .rbt-confetti>*{opacity:1}
@media (prefers-reduced-motion:reduce){
.rbt *,.rbt-bubble,.rbt-arrive{animation:none!important;transition:none!important}
.rbt[data-mood=celebrate] .rbt-confetti{display:inline}
.rbt[data-mood=celebrate] .rbt-confetti>*{opacity:1}
}
`;
}
