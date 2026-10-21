/**
 * La bannière « mix » sur le papier ADN du site (essai « B+ · Papier ADN, carte en verre givré » de /robot-apercu/adn, choisi
 * par le fondateur le 20 oct. 2026) : le fond clair de pharmaboost.app avec l'hélice d'ADN de l'accueil (image fixe, l'hélice
 * animée serait trop lourde pour un poste), une carte en verre givré qui floute l'ADN derrière le texte, du texte vert foncé, le
 * nom souligné en vert (le citron disparaît sur le clair). Seule la bannière « mix » est concernée (`:has([data-ile-mix])`).
 */
const P = "[data-ile-style=aurore]";

export const MIX_ADN_CSS = `
${P} section:has([data-ile-repos]){background:url(/poste/adn-helice.jpg) 62% 40%/cover no-repeat,#EFF3F1!important}
${P} section:has([data-ile-repos])::before{display:none}
${P} [data-ile-repos],${P} [data-ile-repos] *{color:#0F2F2A!important;text-shadow:0 0 6px #fff,0 0 2px #fff}
${P} [data-ile-repos] .rounded-2xl{background:rgba(255,255,255,.7)!important;text-shadow:none}
${P} [data-ile-helice]{background:#EFF3F1}
${P} section:has([data-ile-helice]) [data-ile-mix-carte]{background:rgba(255,255,255,.5)!important}
${P} section:has([data-ile-mix]){background:url(/poste/adn-helice.jpg) 62% 40%/cover no-repeat,#EFF3F1!important;box-shadow:0 18px 40px -14px rgba(0,0,0,.35)!important}
${P} section:has([data-ile-mix])::before{display:none}
${P} [data-ile-mix] :not([data-ile-mix-carte]):not([data-ile-mix-carte] *):not([class*=rounded]):not([class*=rounded] *){text-shadow:0 0 6px #fff,0 0 2px #fff;font-weight:700}
${P} [data-ile-mix] [class*=rounded],${P} [data-ile-mix] [class*=rounded] *{text-shadow:none}
${P} [data-ile-mix] .aur-btn{color:#0F2F2A;border-color:rgba(15,47,42,.35);background:rgba(255,255,255,.75)}
${P} [data-ile-mix] .aur-btn:hover{background:#fff;border-color:#0F2F2A;color:#0F2F2A}
${P} [data-ile-mix-carte]{-webkit-backdrop-filter:blur(5px);backdrop-filter:blur(5px) saturate(1.1);box-shadow:0 1px 0 rgba(255,255,255,.9) inset,0 8px 24px -14px rgba(15,47,42,.35)}
`;
