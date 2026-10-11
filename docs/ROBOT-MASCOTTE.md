# Le robot vivant — la mascotte de PharmaBoost

> Nom du fichier : `docs/robot.md` existe déjà et parle du **robot de dispensation** (Rowa…). Sur un Mac, `ROBOT.md` et
> `robot.md` sont le même fichier : ce document-ci s'appelle donc `ROBOT-MASCOTTE.md`.

## Le personnage

Le petit robot du logo : coque blanche, écran bleu nuit, yeux et bouche turquoise, casque vert d'eau, badge « + » vert,
lampe sur l'antenne, étoile dorée. Mêmes couleurs que la bannière du poste (`agent/src/banner-design.ts`) — une seule
source. Il est **vivant** : il respire, cligne des yeux au hasard (parfois deux fois), jette un œil autour de lui, et
peut suivre le pointeur — ses yeux glissent dans l'écran comme sur une sphère, sans jamais en sortir.

Inspiration : l'idée d'une mascotte qui vit et qui sert (comme « Coucou »). Rien n'est repris de Mochi : ni dessin, ni
image, ni son. Le dessin est le nôtre, les sons sont synthétisés par notre code.

## Les humeurs, et quand on les voit

| Humeur | Ce qu'il fait | Quand |
|---|---|---|
| `idle` | respire, cligne, regarde autour | par défaut |
| `curious` | se penche, yeux agrandis, petite bouche « o » | un bip arrive de la douchette (vente à confirmer) |
| `thinking` | lève les yeux, la lampe pulse, trois points | l'analyse tourne |
| `concerned` | sourcils inquiets, lampe ambre, posture basse — **jamais comique** | une mise en garde non acquittée est affichée (ex. 3 g de paracétamol) |
| `happy` | petit saut + étincelles, yeux rieurs | un conseil entre dans la délivrance, vente terminée, quiz réussi |
| `celebrate` | grand saut, confettis, court | palier de challenge, badge gagné |
| `sleepy` | yeux fermés, « z », respiration lente | longue inactivité (`sleepAfterMs`, opt-in) |

Gestes d'un instant : **coucou** (petite main, à la première ouverture), **gloussement** quand on le touche, **tournis**
(yeux en spirale) après quatre touchers en moins de 1,6 s, puis il se remet (`pokeReducer`, testé).

L'ordre au comptoir : analyse → bip → mise en garde → joie. **Le robot ne sourit jamais à côté d'une alerte**
(`saleMood`).

## Où il est

**Au centre de l'expérience** depuis le 11 oct. 2026, à la demande du fondateur (« le robot n'est pas présent du tout ;
je le veux vraiment vivant, présent, animé, avec des petits sons, au centre »).

- **Site, accueil** : un grand robot (≈ 180 px sur ordinateur, ≈ 110 px sur téléphone) à côté de « Scan. Conseil.
  Bilan. » (`hero-robot.tsx`). Coucou à l'arrivée (une fois par session), yeux qui suivent la souris, gloussement et
  tournis au toucher, bulle qui change de phrase (« Bonjour ! Je suis le robot PharmaBoost. », « Au scan, je vous
  montre le bon conseil. », « Cliquez-moi ! »), haut-parleur à côté de lui. L'en-tête garde le petit robot du logo.
- **Site, compagnon** (`site-companion.tsx`, dans le layout de /decouvrir) : un robot flottant en bas à droite qui
  apparaît quand le grand robot de l'accueil sort de l'écran, et suit la lecture : bannière → curieux (« Regardez,
  c'est moi au comptoir ! »), questions → pensif, sécurité → sérieux et calme, tarif → content (« Faites le calcul ! »),
  et la fête quand on clique « Réserver une démo ». Une bulle à la fois, qu'on ferme, dite une seule fois par visite ;
  réductible (retenu pour la visite) ; haut-parleur visible. Il s'efface quand un lien ou un bouton passe sous lui, sur
  téléphone pendant une saisie et dans les pages à formulaire (démo, abonnement, partenaires, commercial).
- **Logiciel, « Nouvelle vente »** (l'accueil du logiciel : `/` y mène) : le robot en tête de page, grand (≈ 115 px),
  « Bonjour Claire ! » (ou « Bonsoir » à partir de 18 h), sa phrase utile (`mascot-tips.ts`) ou, sans fait utile, ce
  qu'il fait (« Au prochain scan, je vous montre le bon conseil. »), « Votre journée » et le haut-parleur. Coucou une
  fois par session, yeux qui suivent le pointeur.
- **Logiciel, compagnon** (`components/robot/app-companion.tsx`, dans le layout de l'application) : petit robot en bas
  à droite de chaque page, sauf « Nouvelle vente » (le grand y est déjà) et l'écran de vente. Il reprend les humeurs
  du fil (`emitRobotMood`, canaux `comptoir` et `app`), fait la fête sur la page de fin quand une vente est terminée sans
  mise en garde, et s'ouvre d'un clic sur sa phrase du moment (`/api/robot/conseil`, même portée que « Nouvelle
  vente »). Réductible (retenu dans le navigateur).
- **Écran de vente** : le robot de la barre du bas, 56 px, qui suit la vente (curieux, pensif, sérieux, content).
- **Application mobile** : la barre du haut (sur chaque onglet — c'est lui qui écoute les signaux), la connexion, et le
  bonjour de l'Accueil (96 px ; coucou à la première ouverture de la session, yeux qui suivent le doigt, bulle
  « prochaine étape », haut-parleur).

## Le code

- `src/components/robot/` — `Robot` (le composant), `robot-css.ts` (toutes les animations, une feuille par page),
  `bus.ts` (`emitRobotMood`, `useRobot`, `useRobotSignal`), `sound.ts` + `sound-toggle.tsx`.
- `src/core/robot/mascot.ts` — humeurs, gestes, `pokeReducer`, `gazeToward`, `saleMood`, `dashboardMood` (pur).
- `src/core/robot/mascot-tips.ts` — le choix de la phrase (comptoir, mobile, « Votre journée »), pur.
- `src/core/robot/sound.ts` — la partition et les règles de son, pur.
- `src/server/services/robot-tips.ts` — ce que le robot lit (lecture seule, portée de la session).
- `/robot-apercu` — banc d'essai de développement (404 en production, jamais indexé).

API : `<Robot mood size floating track interactive greet listen cheerKey sound motion label />`.
Faire réagir le robot depuis n'importe quel écran (l'Académie, par exemple) :

```ts
import { emitRobotMood } from "@/components/robot";
emitRobotMood("celebrate"); // quiz réussi, badge gagné
```

Le robot de la barre mobile écoute le canal par défaut ; celui du comptoir écoute `"comptoir"`.

## Le robot utile (phase 1)

Une phrase à la fois, écartable pour la journée (« Plus tard »), choisie par priorité :

- **Comptoir** : un challenge en cours proche d'un palier (« Plus que 3 ventes « NATURÉO » pour le palier de 40. ») →
  les lots en date courte à proposer en premier → le stock à mettre à jour (seulement pour qui peut l'envoyer ; cette
  phrase ne s'écarte pas et remplace alors le bandeau du stock, pour ne pas le dire deux fois). Sinon, rien.
- **Mobile (Accueil)** : une prime validée cette semaine → un challenge proche d'un palier → la formation commencée →
  une formation à découvrir. Sinon, rien.
- **« Votre journée »** (comptoir) : mes conseils validés / proposés aujourd'hui, ceux de l'équipe, mon rang, et le
  meilleur moment (l'heure où l'équipe a le plus validé). D'elle-même à partir de 18 h, sinon bouton « Votre journée ».
  Aucun envoi (ni notification, ni e-mail) dans cette phase.

## Les règles

1. **Présent mais jamais dans le chemin** : au centre de l'accueil, mais jamais sur un bouton d'action (le compagnon
   ne se pose pas sur l'écran de vente, s'efface sur le site quand un lien passe sous lui), gestes courts.
2. **Pas de conseil médical** : le robot rappelle un challenge, une date courte, un stock, une formation. Le conseil au
   patient reste celui du moteur, relu, sous le médicament.
3. **Aucune donnée de patient** dans ses phrases, et **aucun montant** de challenge (les paliers en unités).
4. **Honnête** : sans fait utile, il se tait. Tout vient de la base, par la portée de la session (officine active,
   personne connectée).
5. **Immobile pour qui réduit les animations** : l'humeur se lit alors à l'expression seule (yeux, bouche, lampe).
6. **Décoratif** pour les lecteurs d'écran (sauf `label`) ; ses bulles, elles, sont du vrai texte.

## Les sons

Les nôtres, **synthétisés à la volée** (Web Audio, `core/robot/sound.ts`) : aucun fichier, donc aucun téléchargement qui
puisse échouer, aucune erreur en console. Une famille douce (sinusoïdes et triangles), chacun sous 400 ms : coucou,
gloussement, tournis, blip curieux (bip reçu), bourdonnement de réflexion, « pop » de joie, étincelle de fête, note
grave et douce d'inquiétude (jamais une alarme).

| Lieu | Par défaut | Volume | Particularité |
|---|---|---|---|
| Site | allumés | 0,30 | jamais avant un geste de la personne (règle des navigateurs) |
| Mobile | allumés | 0,25 | idem |
| Comptoir (logiciel) | **allumés** depuis le 11 oct. 2026 | 0,15 | sons **amicaux seulement** : bonjour, gloussement, tournis, blip d'un bip, joie, fête — ni réflexion ni inquiétude |

**Une mise en garde ne sonne nulle part** (la note d'inquiétude n'est plus jouée ; l'humeur se lit au visage).
Pourquoi le comptoir sonne maintenant : le fondateur l'a demandé le 11 oct. 2026 (« avec des petits sons ») ; on a
gardé le volume très bas, les seuls sons amicaux et un haut-parleur visible à côté de chaque robot pour couper.

Le choix est gardé dans le navigateur, par lieu (`pharmaboost:robot-sound:site|mobile|counter`). La clé
`pharmaboost:robot-sound:tout` à `off` coupe tout, partout.

## Phase 2

- **Bannière Windows** : porter les nouvelles animations dans le dessin C# (`Mascot.Draw`, `agent/src/notice-host.ts`)
  une fois la bannière actuelle validée sur un vrai poste. Rien n'a changé côté agent dans cette phase.
- **Notifications** : poussées et écran verrouillé avec l'application native (le robot annonce une prime, un palier).
- **Boîte à questions** : le robot répond, mais **uniquement** à partir des règles validées par le pharmacien (base
  maître), avec la source citée ; jamais de réponse libre d'un modèle.
- Une préférence « sons » dans « Mon espace » (aujourd'hui : le haut-parleur de l'Accueil).
