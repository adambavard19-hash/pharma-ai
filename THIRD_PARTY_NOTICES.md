# Composants de tiers

## Coucou — moteur d'animation (code seulement)

`src/core/robot/motion.ts` adapte la logique d'animation du moteur de Coucou
(https://github.com/louis-cfm/coucou, fichiers `windows/src/mochi/engine.ts` et `windows/src/core/anim.ts`) :
interpolations, ressorts, enchaînements de gestes, particules.

Seul le **code** est repris, sous la licence MIT ci-dessous. Le nom « Coucou », le personnage « Mochi », son
apparence, ses dessins et ses sons restent la propriété de Louis Raillé (voir le fichier LICENSE-ASSETS.md de Coucou)
et ne sont **pas** utilisés : le robot de PharmaBoost a son propre dessin et ses propres sons.

L'« île » de la bannière du comptoir (`src/core/island/banner-flow.ts`, `src/components/island/*`) reprend l'idée et le
comportement de l'île de Coucou (capsule qui se transforme en ressort, activité qui se coche, pastilles de services,
message d'humeur quand on tape trop vite). Le code est écrit pour PharmaBoost ; textes, couleurs et robot sont les
nôtres (`agent/src/banner-design.ts`, `components/robot`).

```
MIT License

Copyright (c) 2026 Louis Raillé

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Microsoft Edge WebView2 SDK (1.0.2903.40)

L'île du poste de caisse Windows s'affiche avec WebView2. Les bibliothèques du kit
(`Microsoft.Web.WebView2.Core.dll`, `Microsoft.Web.WebView2.WinForms.dll`, `WebView2Loader.dll`) sont redistribuées telles
quelles dans `public/poste/webview2/1.0.2903.40/`, avec leur licence (`LICENSE.txt`, licence de type BSD de Microsoft) et
leurs mentions (`NOTICE.txt`). Copyright (C) Microsoft Corporation.

## Données publiques des médicaments

- **Base de données publique des médicaments** (ANSM, HAS, UNCAM) — https://base-donnees-publique.medicaments.gouv.fr :
  spécialités, présentations, compositions, conditions de délivrance. La mention de source et la date de mise à jour
  sont produites par `src/core/reference/attribution.ts` et affichées dans Paramètres et sur chaque fiche médicament.
- **Open Medic, base complète 2025** (Caisse nationale de l'Assurance Maladie, publiée le 7 juillet 2026) —
  https://open-data-assurance-maladie.ameli.fr/medicaments/index.php — **Licence Ouverte / Open Licence (Etalab)**.
  Le code ATC de chaque boîte remboursée, joint à la BDPM par le CIP13, donne la famille officielle des spécialités
  (`src/core/reference/atc/official-atc-data.ts`, généré par `npm run atc:officiel`) : le secours du moteur quand le
  modèle ne répond pas. Les données ne sont pas modifiées ; le choix de l'ATC d'une spécialité non remboursée (mêmes
  substances, même voie, même dosage, accord de toutes les remboursées) est le nôtre. Ni l'Assurance Maladie, ni l'ANSM,
  ni la HAS ne cautionnent PharmaBoost.
