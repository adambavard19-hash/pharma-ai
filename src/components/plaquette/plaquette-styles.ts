/**
 * La feuille de style de la plaquette : des feuilles A4 à l'écran comme sur papier.
 *
 *  - Chaque `.plq-page` mesure exactement 210 × 297 mm et force un saut de page après elle. Les feuilles portent une page
 *    nommée (`@page plaquette`) sans marge : la règle `@page` générale de l'application (marges du plan patient) ne s'y applique
 *    pas, et le navigateur n'ajoute ni date ni adresse en tête de feuille.
 *  - À l'impression, la feuille de style générale ramène la taille de base à 10,5 pt : les espacements en `rem` des visuels du
 *    site rétréciraient. La plaquette la remet à 16 px, pour que le PDF soit identique à l'aperçu.
 *  - Les couleurs sont figées en clair (les jetons sémantiques sont redéfinis sur `.plq`) : une plaquette ne passe jamais en
 *    sombre, même dans un écran réglé en mode sombre.
 *  - À l'écran, la feuille garde sa taille réelle et se réduit d'un bloc (`zoom`) sur un écran étroit : rien ne déborde, et le
 *    PDF n'en dépend pas (le zoom est remis à 1 à l'impression).
 *  - Les paragraphes évitent le mot seul en dernière ligne (`text-wrap: pretty`, hérité).
 *  - La lueur de balayage des visuels du site est une animation : figée sur papier, elle devient une bande grise. Elle est
 *    retirée de la plaquette.
 */
export const PLAQUETTE_CSS = `
.plq{--surface-app:var(--color-ink-50);--surface-card:#fff;--surface-raised:#fff;--surface-sunken:var(--color-ink-100);--border-subtle:var(--color-ink-200);--border-default:var(--color-ink-300);--border-strong:var(--color-ink-400);--text-primary:var(--color-ink-900);--text-secondary:var(--color-ink-600);--text-tertiary:var(--color-ink-500);color-scheme:light;color:var(--text-primary);font-family:var(--font-sans);font-size:14px;line-height:1.5;text-wrap:pretty;page:plaquette;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.plq *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.plq-page{position:relative;box-sizing:border-box;width:210mm;height:297mm;overflow:hidden;background:#fff;break-after:page;page-break-after:always;break-inside:avoid}
.plq-page:last-child{break-after:auto;page-break-after:auto}
.plq .pb-scan{animation:none!important;opacity:0!important}
@page plaquette{size:A4;margin:0}
@media screen{
.plq{display:flex;flex-direction:column;align-items:center;gap:28px}
.plq-page{border-radius:6px;box-shadow:0 1px 2px rgb(23 33 38/.06),0 18px 50px -20px rgb(23 33 38/.3)}
}
@media screen and (max-width:841px){.plq-page{zoom:.87}}
@media screen and (max-width:739px){.plq-page{zoom:.74}}
@media screen and (max-width:639px){.plq{gap:16px}.plq-page{zoom:.64}}
@media screen and (max-width:539px){.plq-page{zoom:.53}}
@media screen and (max-width:459px){.plq-page{zoom:.46}}
@media screen and (max-width:399px){.plq-page{zoom:.41}}
@media screen and (max-width:359px){.plq-page{zoom:.36}}
@media print{
html{font-size:16px!important}
html,body{background:#fff!important}
.plq{display:block;margin:0!important}
.plq-page{zoom:1;margin:0;border-radius:0;box-shadow:none}
nextjs-portal{display:none!important}
}
`;
