import { BANNER } from "../../../agent/src/banner-design";
import { BURST_MS, type RobotBurst } from "@/core/robot/mascot";

/**
 * La feuille de style du robot : UNE pour toute la page (React la remonte dans le <head> une seule fois, quel que soit
 * le nombre de robots). Tout ce qui bouge est ici, en CSS : le script du composant ne fait que poser des attributs
 * (humeur, geste, clignement) et déplacer le regard.
 *
 * Le dessin est celui de la mascotte du poste (agent/src/banner-preview.ts, `mascotSvg`) et du logo : mêmes couleurs,
 * lues dans BANNER. Rien ne bouge pour qui a demandé à réduire les animations — l'humeur se lit alors à l'expression
 * seule (yeux, bouche, lampe).
 */
const C = BANNER.colors;

/** La lampe inquiète : l'ambre des pastilles « challenge » de la bannière, sérieux sans être rouge d'alarme. */
export const LAMP_CONCERNED = C.challengeIcon;

/** Les gestes d'un instant. Chacun existe en deux exemplaires (-0, -1) : alterner relance l'animation à chaque fois. */
const BURSTS: Record<RobotBurst, string> = {
  jump: `0%{transform:translateY(0) scale(1,1)}18%{transform:translateY(0) scale(1.06,.92)}46%{transform:translateY(-9px) scale(.96,1.05)}72%{transform:translateY(0) scale(1.05,.95)}86%{transform:translateY(-1.5px) scale(.99,1.01)}100%{transform:translateY(0) scale(1,1)}`,
  party: `0%{transform:translateY(0) rotate(0) scale(1,1)}10%{transform:translateY(0) scale(1.08,.9)}28%{transform:translateY(-14px) rotate(-6deg) scale(.95,1.06)}44%{transform:translateY(0) rotate(0) scale(1.06,.94)}58%{transform:translateY(-10px) rotate(6deg) scale(.97,1.04)}74%{transform:translateY(0) rotate(0) scale(1.04,.96)}86%{transform:translateY(-2px)}100%{transform:translateY(0) rotate(0) scale(1,1)}`,
  wave: `0%,100%{transform:rotate(0)}18%{transform:rotate(7deg)}38%{transform:rotate(-3deg)}58%{transform:rotate(6deg)}78%{transform:rotate(-1deg)}`,
  giggle: `0%{transform:scale(1,1) rotate(0)}25%{transform:scale(1.09,.88) rotate(-2deg)}55%{transform:scale(.95,1.06) rotate(2deg)}80%{transform:scale(1.02,.98)}100%{transform:scale(1,1) rotate(0)}`,
  dizzy: `0%,100%{transform:rotate(0)}12%{transform:rotate(-8deg)}26%{transform:rotate(7deg)}40%{transform:rotate(-6deg)}54%{transform:rotate(5deg)}68%{transform:rotate(-3deg)}82%{transform:rotate(2deg)}`,
};

const HAND = `0%,100%{opacity:0;transform:rotate(0)}12%{opacity:1;transform:rotate(-18deg)}30%{transform:rotate(16deg)}48%{transform:rotate(-14deg)}66%{transform:rotate(12deg)}84%{opacity:1;transform:rotate(0)}`;

export function robotCss(): string {
  const bursts = (Object.keys(BURSTS) as RobotBurst[])
    .map((name) =>
      [0, 1]
        .map((seq) => `@keyframes rbt-${name}-${seq}{${BURSTS[name]}}\n.rbt[data-burst=${name}][data-seq="${seq}"] .rbt-burst{animation:rbt-${name}-${seq} ${BURST_MS[name]}ms cubic-bezier(.3,.7,.3,1) both}`)
        .join("\n"),
    )
    .join("\n");

  return `
.rbt{position:relative;display:inline-block;flex-shrink:0;line-height:0;-webkit-tap-highlight-color:transparent}
.rbt svg{display:block;width:100%;height:100%;overflow:visible}
.rbt[data-interactive]{cursor:pointer;touch-action:manipulation;user-select:none}
.rbt-act,.rbt-burst,.rbt-breath{transform-box:view-box;transform-origin:50px 84px}
.rbt-float{transform-box:view-box;transform-origin:50px 80px}
.rbt-shadow{transform-box:fill-box;transform-origin:center}
.rbt-gaze{transition:transform .16s cubic-bezier(.2,.8,.3,1)}
.rbt-lids,.rbt-eyescale,.rbt-spiral,.rbt-hand,.rbt-dots circle,.rbt-z,.rbt-glow,.rbt-spark,.rbt-confetti>*,.rbt-pop{transform-box:fill-box;transform-origin:center}
.rbt-hand{transform-origin:20% 90%;opacity:0}
.rbt-lids{transition:transform 70ms ease-in}
.rbt[data-blink] .rbt-lids{transform:scaleY(.08)}
.rbt-eyescale{transition:transform .3s cubic-bezier(.3,1.4,.5,1)}
.rbt-act{transition:transform .5s cubic-bezier(.3,1.25,.5,1)}
.rbt-lamp,.rbt-glow{fill:${C.eye};transition:fill .4s}

/* Les expressions : une seule paire d'yeux et une seule bouche visibles à la fois. */
.rbt-eh,.rbt-es,.rbt-ez,.rbt-brow,.rbt-m,.rbt-dots,.rbt-z,.rbt-hand,.rbt-confetti,.rbt-pop{display:none}
.rbt[data-face=idle] .rbt-m-idle,.rbt[data-face=curious] .rbt-m-o,.rbt[data-face=thinking] .rbt-m-flat,
.rbt[data-face=concerned] .rbt-m-worry,.rbt[data-face=happy] .rbt-m-happy,.rbt[data-face=sleepy] .rbt-m-sleep,
.rbt[data-face=dizzy] .rbt-m-wave{display:inline}
.rbt[data-face=happy] .rbt-eo,.rbt[data-face=sleepy] .rbt-eo,.rbt[data-face=dizzy] .rbt-eo{display:none}
.rbt[data-face=happy] .rbt-eh,.rbt[data-face=sleepy] .rbt-ez,.rbt[data-face=dizzy] .rbt-es{display:inline}
.rbt[data-face=concerned] .rbt-brow{display:inline}
.rbt[data-face=thinking] .rbt-dots,.rbt[data-face=sleepy] .rbt-z{display:inline}
.rbt[data-burst=wave] .rbt-hand{display:inline}
.rbt[data-burst=party] .rbt-confetti{display:inline}
.rbt[data-burst=jump] .rbt-pop,.rbt[data-burst=giggle] .rbt-pop{display:inline}

/* Les poses : on penche, on se tasse, on lève la tête. */
.rbt[data-face=curious] .rbt-act{transform:rotate(-7deg) translateY(-1.5px)}
.rbt[data-face=curious] .rbt-eyescale{transform:scale(1.18)}
.rbt[data-face=thinking] .rbt-act{transform:rotate(4deg)}
.rbt[data-face=concerned] .rbt-act{transform:translateY(1px)}
.rbt[data-face=concerned] .rbt-eyescale{transform:scale(1,.84)}
.rbt[data-face=sleepy] .rbt-act{transform:rotate(5deg) translateY(2px)}
.rbt[data-face=concerned] .rbt-lamp,.rbt[data-face=concerned] .rbt-glow{fill:${LAMP_CONCERNED}}
.rbt[data-face=thinking] .rbt-spark,.rbt[data-face=concerned] .rbt-spark,.rbt[data-face=sleepy] .rbt-spark,.rbt[data-face=dizzy] .rbt-spark{display:none}
.rbt[data-face=sleepy] .rbt-glow{opacity:.08}
.rbt[data-face=sleepy] .rbt-lamp{opacity:.45}

/* Ce qui vit tout le temps. */
@keyframes rbt-float{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-7px) rotate(3deg)}}
@keyframes rbt-shadow{0%,100%{transform:scaleX(1);opacity:.32}50%{transform:scaleX(.68);opacity:.16}}
@keyframes rbt-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.012,1.028)}}
@keyframes rbt-glow{0%,100%{opacity:.16;transform:scale(.8)}50%{opacity:.55;transform:scale(1.2)}}
@keyframes rbt-glow-think{0%,100%{opacity:.2;transform:scale(.8)}50%{opacity:.85;transform:scale(1.45)}}
@keyframes rbt-twinkle{0%,100%{transform:scale(.7) rotate(0);opacity:.55}50%{transform:scale(1.2) rotate(18deg);opacity:1}}
@keyframes rbt-dot{0%,60%,100%{opacity:.25;transform:translateY(0)}30%{opacity:1;transform:translateY(-2px)}}
@keyframes rbt-z{0%{opacity:0;transform:translate(0,4px) scale(.6)}30%{opacity:.9}100%{opacity:0;transform:translate(5px,-9px) scale(1.1)}}
@keyframes rbt-spin{to{transform:rotate(360deg)}}
@keyframes rbt-confetti{0%{opacity:0;transform:translate(calc(var(--tx) * -1px),calc(var(--ty) * -1px)) scale(.3) rotate(0)}15%{opacity:1}75%{opacity:1}100%{opacity:0;transform:translate(0,4px) scale(1) rotate(160deg)}}
@keyframes rbt-pop{0%{opacity:0;transform:scale(.2)}35%{opacity:1;transform:scale(1.15)}100%{opacity:0;transform:scale(.6) rotate(40deg)}}
@keyframes rbt-hand{${HAND}}
.rbt[data-float] .rbt-float{animation:rbt-float 3.6s ease-in-out infinite}
.rbt[data-float] .rbt-shadow{animation:rbt-shadow 3.6s ease-in-out infinite}
.rbt-breath{animation:rbt-breathe 3.4s ease-in-out infinite}
.rbt[data-face=concerned] .rbt-breath{animation-duration:4.4s}
.rbt[data-face=sleepy] .rbt-breath{animation-duration:5.6s}
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
.rbt-spiral{animation:rbt-spin .9s linear infinite}
.rbt-confetti>*{opacity:0;animation:rbt-confetti 1.5s cubic-bezier(.2,.7,.3,1) both}
.rbt-confetti>:nth-child(2n){animation-delay:.08s}
.rbt-confetti>:nth-child(3n){animation-delay:.16s}
.rbt-pop{animation:rbt-pop .7s ease-out both}
.rbt[data-burst=wave] .rbt-hand{animation:rbt-hand ${BURST_MS.wave}ms ease-in-out both}
${bursts}

/* La bulle d'une phrase, et le compagnon qui arrive : une entrée douce, rien de plus. */
@keyframes rbt-bubble{from{opacity:0;transform:translateY(6px) scale(.96)}to{opacity:1;transform:none}}
@keyframes rbt-arrive{from{opacity:0;transform:translateY(18px) scale(.9)}to{opacity:1;transform:none}}
.rbt-bubble{animation:rbt-bubble .32s cubic-bezier(.2,.8,.3,1) both}
.rbt-arrive{animation:rbt-arrive .45s cubic-bezier(.2,.9,.3,1.15) both}

/* Tout petit (moins de 32 px) : un dessin plus simple, qui reste net. */
.rbt[data-tiny] .rbt-glint,.rbt[data-tiny] .rbt-spark,.rbt[data-tiny] .rbt-dots,.rbt[data-tiny] .rbt-z,.rbt[data-tiny] .rbt-confetti,.rbt[data-tiny] .rbt-pop,.rbt[data-tiny] .rbt-brow{display:none}

/* Réduire les animations : rien ne bouge, l'expression reste. Une fête se lit alors à ses étincelles, immobiles. */
.rbt[data-motion=reduce] *{animation:none!important;transition:none!important}
.rbt[data-motion=reduce][data-mood=celebrate] .rbt-confetti{display:inline}
.rbt[data-motion=reduce][data-mood=celebrate] .rbt-confetti>*{opacity:1}
@media (prefers-reduced-motion:reduce){
.rbt *,.rbt-bubble,.rbt-arrive{animation:none!important;transition:none!important}
.rbt[data-mood=celebrate] .rbt-confetti{display:inline}
.rbt[data-mood=celebrate] .rbt-confetti>*{opacity:1}
}
`;
}
