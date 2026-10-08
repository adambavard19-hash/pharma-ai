# Système de design PharmaBoost

État : **en développement seulement.** Aucune migration, aucune variable d'environnement.

Référence visuelle : le site <https://orthoptiste-niceville.fr>, ouvert et mesuré le 8 octobre 2026 (valeurs
calculées par le navigateur, pas devinées). PharmaBoost en garde l'esprit — calme, aéré, net — avec sa propre
identité (teal clinique, ambre réservé au chiffre d'affaires additionnel).

## Ce qui a été relevé sur la référence, et ce que PharmaBoost fait maintenant

| | Référence | PharmaBoost avant | PharmaBoost maintenant |
|---|---|---|---|
| Police | **Plus Jakarta Sans** 300 à 800, chargée | « Inter » **jamais chargée** : police du système | Plus Jakarta Sans, variable 200–800, auto-hébergée (`next/font`) |
| Titre de page | 36–48 px · 700 · −0,025 em | 24–32 px · 600 | 28–30 px · **700** · −0,025 em |
| Titre de section | 30/36 px · 700 | 15–24 px · 600 | 17 px · 600 · −0,02 em |
| Sous-titre / titre de carte | 16/24 px · 600 · −0,4 px | 15 px · 600 | **16/24 px · 600 · −0,4 px** |
| Texte | 16/24 px ; discret `hsl(200 10% 45%)` | 16/24 px ; secondaire presque noir | 16/24 px ; secondaire et discret plus doux (≥ 4,5:1) |
| Menu | 256 px · liens 32 px, 14 px/400, actif 500 + fond teinté · rayon 10 px | 248 px · 13,5 px/500 · rayon 14 px | **256 px · 32 px · 14 px/400 · actif 500 · rayon 10 px** |
| En-tête | 56 px · bordure basse · fond 80 % · flou 4 px | 56 px · flou 12 px | 56 px · bordure · fond 80 % · flou 4 px |
| Carte | rayon 12 · bordure 1 px · ombre teintée `0 4px 24px -4px` | rayon 18 · ombre grise fine | **rayon 12 · bordure 1 px · ombre teintée** (creusée au survol) |
| Bouton | 44 px · 14 px/500 · rayon 10 · dégradé teal→vert | 32–40 px · rayon 10 · uni | **44 px · 14 px/500 · rayon 10 · dégradé** |
| Fond de page | `#f9fbfb` (teinté vert-bleu) | gris bleuté | `#f9fbfb` ; neutres retintés vert-bleu (180–230°) |

## Les jetons (dans `src/app/globals.css`)

- **Marque** `brand-50…950` : même teinte (182°), saturation adoucie ; `brand-600` ≈ le primaire de la référence.
- **Neutres** `ink-50…950` : teintés vert-bleu. `ink-900` = texte, `ink-600` = secondaire, `ink-500` = discret.
- **Rayons** : `md` 10 px (boutons, menu, champs), `lg`/`xl` 12 px (cartes), `2xl` 16 px (grands blocs).
- **Ombres** : `shadow-card` et `shadow-card-hover` (teintées de la marque).
- **Dégradé** : `bg-brand-gradient` (fonds) et `text-brand-gradient` (grands mots mis en valeur, 24 px et plus).
- **Police** : `--font-jakarta` (next/font) branchée sur `--font-sans` ; les titres sont resserrés à −0,025 em.

## Règles qu'on garde

1. **Lisibilité d'abord** : tout texte ≥ 4,5:1 (3:1 au-delà de 24 px). Le dégradé de la référence blanc/vert ne fait
   que 3,2:1 en bout : celui de PharmaBoost est **assombri** (5,3:1 et 4,8:1). Le bouton « success » est en vert
   foncé (5,6:1).
2. Un titre de page est en **700**, un titre de carte en **600**, un libellé de menu ou de bouton en **500**.
3. On ne code pas une couleur de texte en dur : on passe par `text-text-primary/secondary/tertiary`.
4. Un bouton principal = `<Button>` (dégradé, 44 px en `lg`). Pas de `bg-brand-600 text-white` à la main pour un nouveau bouton.

## Mesure automatique

17 écrans de l'application, en thème clair : **aucun** texte sous le contraste recommandé, aucun débordement
horizontal à 1366 et 390 px, aucune police parasite ; pages publiques et connexions idem. (Script :
`scripts/audit-design.playwright.js` — contrastes, débordements, polices ; à relancer après tout changement de jetons.)

## À savoir

- **Police et fabrication** : `next/font/google` télécharge Plus Jakarta Sans pendant `next dev` / `next build`
  (il faut Internet à ce moment-là) ; les visiteurs, eux, ne contactent jamais Google.
- **Mode sombre** : il n'a **aucun interrupteur** et ne suit pas le réglage de l'ordinateur. Avant le 8 octobre,
  un ordinateur en mode sombre affichait une application *à moitié* sombre (variantes `dark:` actives, jetons clairs).
  Les variantes `dark:` suivent maintenant la classe `.dark`, comme les jetons : l'application est cohérente
  (toujours claire). Si l'on veut un vrai mode sombre : un interrupteur qui pose la classe `.dark`, puis revoir
  quelques mentions minuscules (3,6–4,2:1) et les écrans un à un.
- Les écrans non listés (admin, extranet, directeur, site public) reçoivent la police, les couleurs, les rayons et
  les titres en 700 ; leurs mises en page propres n'ont pas été refaites.
