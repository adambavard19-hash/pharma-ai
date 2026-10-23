/**
 * La bannière sur l'ADN, en NOIR VIVANT (fondateur, 21 oct. 2026 : essai « 1 · Noir » de /robot-apercu/adn-fonce, « mais
 * vivant ») : sur l'écran blanc du logiciel de gestion, la bannière claire se perdait (vidéo de Donna). Le fond est noir et
 * l'hélice d'ADN y brille en vert :
 *  - la bannière des conseils (« mix ») : l'hélice vivante du site (WebGL, `data-ile-helice`), dont l'encre sur papier clair
 *    est retournée en lumière sur fond noir (inversion des couleurs + rotation de teinte : le vert reste vert) ;
 *  - la capsule au repos (« En attente de scan… », `data-ile-repos`) : l'image de l'hélice, retournée de la même façon, qui
 *    glisse lentement (une capsule de 40 px n'a pas besoin d'une scène 3D).
 * La carte du conseil reste blanche, pour se lire d'un coup d'œil ; le texte autour passe en blanc.
 */
const P = "[data-ile-style=aurore]";
/** Le haut de la bannière des conseils (robot, nom, « N conseils ») et la ligne « À proposer en premier ». */
const HEAD = `${P} [data-ile-mix] > div:first-child, ${P} [data-ile-mix] > div:nth-child(2) > div:first-child`;
const ON_HEAD = (sel: string) => HEAD.split(", ").map((h) => `${h} ${sel}`).join(", ");
const INK = "#07090A";
const GLOW = "invert(1) hue-rotate(180deg) brightness(1.15) contrast(1.25) saturate(1.3)";

export const MIX_ADN_CSS = `
${P} section:has([data-ile-repos]){background:${INK}!important;isolation:isolate;box-shadow:0 18px 40px -14px rgba(0,0,0,.55),0 0 0 1px rgba(232,255,156,.18)!important}
${P} section:has([data-ile-repos])::before{display:none}
${P} section:has([data-ile-repos])::after{content:"";position:absolute;inset:-20%;z-index:-1;pointer-events:none;background:url(/poste/adn-helice.jpg) 62% 40%/cover no-repeat;filter:${GLOW};mix-blend-mode:screen;opacity:.85;animation:adn-vit 14s ease-in-out infinite alternate}
@keyframes adn-vit{from{transform:translate3d(-6%,-3%,0) scale(1.05) rotate(-2deg)}to{transform:translate3d(6%,3%,0) scale(1.15) rotate(2deg)}}
${P} [data-ile-repos],${P} [data-ile-repos] *{color:#F2FFF9!important;text-shadow:0 1px 6px rgba(0,0,0,.7)}
${P} [data-ile-repos] .rounded-2xl{background:rgba(255,255,255,.1)!important}
${P} [data-ile-helice]{background:#EFF3F1;filter:${GLOW};opacity:.5}
/* L'ADN atténué derrière le haut de la bannière : il gênait la lecture du titre du conseil (fondateur, 22 oct. 2026). */
${P} section:has([data-ile-mix]){background:${INK}!important;box-shadow:0 18px 40px -14px rgba(0,0,0,.55),0 0 0 1px rgba(232,255,156,.18)!important}
${P} section:has([data-ile-mix])::before{display:none}
${P} [data-ile-mix] :not([data-ile-mix-carte]):not([data-ile-mix-carte] *):not([class*=rounded]):not([class*=rounded] *){text-shadow:0 1px 6px rgba(0,0,0,.75);font-weight:700}
${P} [data-ile-mix] [class*=rounded],${P} [data-ile-mix] [class*=rounded] *{text-shadow:none}
${HEAD}{color:#F2FFF9}
${ON_HEAD('[class*="text-[#"]')}{color:#F2FFF9}
${ON_HEAD("button.rounded-full:not(.aur-btn):not([style*=background])")}{background:rgba(255,255,255,.14);color:#F2FFF9}
${P} [data-ile-mix] .aur-btn{color:#F2FFF9;border-color:rgba(242,255,249,.45);background:rgba(255,255,255,.08)}
${P} [data-ile-mix] .aur-btn:hover{background:rgba(255,255,255,.18);border-color:#F2FFF9;color:#fff}
${P} [data-ile-mix-carte]{background:rgba(255,255,255,.94)!important;box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 8px 24px -14px rgba(0,0,0,.6)}
${P} [data-ile-mix-l] [data-ile-mix-carte]{background:#FFFFFF!important}
@media (prefers-reduced-motion: reduce){${P} section:has([data-ile-repos])::after{animation:none}}
`;
