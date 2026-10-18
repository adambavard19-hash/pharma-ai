/**
 * Le style « Aurore » de la bannière du poste (fondateur, 15 oct. 2026 : « plus minimaliste, moderne, futuriste, aux
 * couleurs du site ») : verre vert très profond, liseré d'un pixel en dégradé teal → vert → citron (le dégradé de marque du
 * site) qui s'éclaire lentement, moins de texte, boutons fins. Le même habit partout (fondateur, 18 oct. 2026 : « remets à
 * jour toutes les anciennes bannières par la nouvelle, partout sur le site ») : poste, et visuels du site.
 * `?style=actuel` remet l'ancien (comparaison dans l'aperçu).
 */
export const AURORE_CSS = `
[data-ile-style=aurore] section{background:linear-gradient(180deg,#072A25 0%,#03171A 100%)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 14px 34px -14px rgba(0,0,0,.65)!important;isolation:isolate}
[data-ile-style=aurore] section::before{content:"";position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;z-index:2;
  background:linear-gradient(110deg,rgba(95,165,148,.55),rgba(116,214,160,.35) 35%,rgba(232,255,156,.85) 50%,rgba(116,214,160,.35) 65%,rgba(95,165,148,.55));background-size:250% 100%;
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:aur-sweep 6s linear infinite}
[data-ile-style=aurore] section[data-tone=warning]::before{background:linear-gradient(110deg,rgba(245,166,35,.55),rgba(255,214,140,.9) 50%,rgba(245,166,35,.55));background-size:250% 100%}
[data-ile-style=aurore] section[data-tone=danger]::before{background:linear-gradient(110deg,rgba(255,92,92,.6),rgba(255,180,170,.95) 50%,rgba(255,92,92,.6));background-size:250% 100%}
[data-ile-style=aurore] section[data-tone=success]::before{background:linear-gradient(110deg,rgba(116,214,160,.6),rgba(232,255,156,.95) 50%,rgba(116,214,160,.6));background-size:250% 100%}
@keyframes aur-sweep{from{background-position:100% 0}to{background-position:-150% 0}}
@keyframes aur-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}
.aur-dot{width:6px;height:6px;border-radius:999px;background:#E8FF9C;box-shadow:0 0 8px rgba(232,255,156,.9);animation:aur-pulse 2.4s ease-in-out infinite}
.aur-btn{border:1px solid rgba(159,203,187,.45);background:rgba(255,255,255,.04);color:#DDF7EA;transition:background .2s,border-color .2s,color .2s}
.aur-btn:hover{background:rgba(232,255,156,.12);border-color:rgba(232,255,156,.7);color:#F4FFD6}
@media (prefers-reduced-motion:reduce){[data-ile-style=aurore] section::before,.aur-dot{animation:none}}
`;
