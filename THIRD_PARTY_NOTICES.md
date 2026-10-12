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
