# « LE CERCLE » — direction du Reel

C'est un Reel Instagram de PharmaBoost (25 oct. 2026), vertical 9:16. On compare **une pharmacie sans PharmaBoost** et **une pharmacie avec PharmaBoost**, dans la même rue.

**Le style est imposé par la vidéo de référence** envoyée par le fondateur (un Reel de « Loyalti » : « Même rue. Deux salons. »). Voici ce qu'on en reprend.

- **Une rue de NUIT en 3D isométrique :** blocs d'immeubles sombres, fenêtres chaudes rares, lampadaires, passages piétons, vue plongeante.
- **Deux boutiques.** La boutique « gagnante » **brille** d'une lumière chaude, avec des passants (petites silhouettes en pilules colorées) qui font la queue devant. L'autre reste **éteinte**.
- **Un GRAND TEXTE blanc en haut,** qui s'écrit mot à mot, avec des **mots surlignés dans une boîte de couleur**, et au-dessus une **barre d'onglets** (le chapitre en cours en couleur).
- **Des téléphones qui arrivent** en légère perspective, par-dessus la rue. Des notifications sur écran verrouillé.
- **Des phrases très courtes et un ton calme,** sûr de lui.
- **La chute :** « Pendant ce temps, à côté… », puis le nom, puis « Et vous, quelle … voulez-vous être ? », et un carton final sur particules dorées.

**Notre version est aux couleurs de PharmaBoost.** La nuit est en vert-encre (`N.*`). La lumière de la pharmacie PharmaBoost est chaude et citron, avec une croix verte néon. Les mots sont surlignés en citron. Le ton est premium, élégant, jamais criard.

**Le message, en une boucle :** le pharmacien conseille plus et mieux, grâce au conseil qui s'affiche au comptoir → le patient repart avec le vrai complément de son traitement, et ça fait pro → son bilan conseil arrive dans son téléphone → **bientôt**, dans l'appli, les offres de SA pharmacie sur ses gammes → il revient → nouveau passage, nouveau conseil. **C'est un cercle.** À côté, sans PharmaBoost : « Il vous fallait autre chose ? » — « Non merci. ».

## 1. Le temps — tout est en secondes du FILM

- **`src/cercle/timeline.ts` :** 60 i/s, 52,5 s.
  - `REVEAL` = 43,0 : le mot « PharmaBoost » est dit, le logo est révélé.
  - `FINAL_HIT` = 47,0 : le carton final.
- **La musique** (`public/cercle/music/musique.wav`, déjà montée) :
  - **0 → 9,5 :** mystérieuse, minimale ;
  - **≈ 9,5 :** le groove arrive ;
  - **35,3 → 41 :** la musique est assourdie, « derrière une porte » (c'est la pharmacie d'à côté) ;
  - **≈ 43,0 :** une relance chaude (la révélation) ;
  - **48 → 52 :** le dernier accord s'éteint.
- **Les mots :** leur temps est dans `src/cercle/mots.json` (`words[].at`). **Le mot dit et l'image qui le montre arrivent ensemble**, à ±2 images près.
- **Les fenêtres :** chaque scène déborde de 0,5 s sur la suivante. Pendant ce chevauchement, la scène qui sort est **au-dessus** et **fait la transition**. La scène qui entre est déjà là en dessous, **fond opaque compris, dès son début**.

| Scène | Fenêtre | Ce qui est dit (mot@temps du film) |
|---|---|---|
| C1 La rue | 0 → 11,25 | V1 : Même@0.50 rue.@0.88 Deux@1.41 pharmacies.@1.68 · V2 : Mêmes@2.75 boîtes.@3.09 Mêmes@3.79 ordonnances.@4.18 · V3 : Mais@5.35 dans@5.59 l'une,@5.80 les@6.33 patients@6.58 reviennent.@7.20 · V4 : Vous@8.19 savez@8.40 pourquoi ?@8.66 · V5 : Elle@9.29 a@9.60 un@9.72 copilote.@9.84 (fin 10,59) |
| C2 Le comptoir | 10,75 → 18,75 | V6 : Une@10.93 boîte@11.24 scannée…@11.54 et@12.20 le@12.62 bon@12.79 conseil@13.02 s'affiche@13.49 au@13.93 comptoir.@14.10 · V7 : Le@15.00 pharmacien@15.24 est@15.95 guidé.@16.10 Il@16.54 conseille@16.73 plus,@17.10 et@17.53 mieux.@17.70 (fin 18,16) |
| C3 Le patient | 18,25 → 25,45 | V8 : Le@18.50 patient@18.74 repart@19.16 avec@19.56 le@19.86 vrai@19.99 complément@20.24 de@20.72 son@20.87 traitement.@21.04 Ça@21.47 fait@21.64 pro.@21.80 · V9 : Son@22.70 bilan@22.94 conseil@23.19 l'attend@23.57 dans@23.92 son@24.07 téléphone.@24.23 (fin 24,91) |
| C4 L'appli | 24,95 → 30,9 | V10 : Et@25.20 bientôt,@25.36 dans@25.97 l'appli :@26.13 les@27.00 offres@27.29 de@27.56 sa@27.71 pharmacie,@27.86 sur@28.54 ses@28.80 gammes@28.96 préférées.@29.29 (fin 30,29) |
| C5 Le cercle | 30,4 → 35,85 | V11 : Alors@30.59 il@30.92 revient.@31.03 Nouveau@31.81 passage,@32.15 nouveau@32.64 conseil.@32.89 · V12 : C'est@33.89 un@34.27 cercle.@34.39 (fin 35,10) |
| C6 À côté | 35,35 → 41,5 | V13 : Pendant@35.60 ce@35.91 temps,@36.10 à@36.51 côté…@36.69 · D1 (la pharmacienne d'à côté) : Et@37.45 avec@37.62 ceci,@37.86 il@38.27 vous@38.41 fallait@38.54 autre@38.83 chose ?@39.15 · D2 (le patient) : Non@40.05 merci.@40.27 (fin 40,79) |
| C7 PharmaBoost | 41,0 → 47,3 | V14 : Ce@41.25 copilote@41.61 s'appelle…@42.09 PharmaBoost.@43.00 · V15 : Et@44.45 vous,@44.64 quelle@45.09 pharmacie@45.36 voulez-vous@45.83 être ?@46.25 (fin 46,68) |
| C8 Le carton final | 46,8 → 52,5 | V16 : Réservez@47.05 votre@47.57 démo@47.91 sur@48.34 pharmaboost.app@48.58 (fin 50,08) |

## 2. Le cadre

- **Format :** 9:16, 1080 × 1920. Le rendu 4K se fait à l'échelle 2 (2160 × 3840) : **tout en vectoriel** (SVG, CSS, texte), et aucune image matricielle agrandie au-delà de sa taille.
- **Le grand texte du haut et la barre d'onglets** sont posés par le FILM (`kit/captions.tsx`), dans la bande **250 → 560 px**, sur un voile sombre (0 → 720). **Les scènes ne mettent rien d'important au-dessus de y = 580.** Le décor (ciel, toits) peut y passer.
- **La scène utile** (`L.stage`) va de x 60 à 1020 et de y 580 à 1480. Instagram masque le bas (boutons, légende) : **rien d'important sous y = 1480**. Le décor peut continuer jusqu'en bas.
- **Grain et vignette :** le film les pose déjà par-dessus.

## 3. Les couleurs (kit `brand.ts`)

- **`N.*`, la nuit :**
  - bâtiments en vert-encre à trois faces (`N.top`, `N.left`, `N.right`) ;
  - sol, route et lignes ;
  - fenêtres chaudes, rares ;
  - lampadaires.
  - **La pharmacie d'à côté reste froide** (`N.cold`, `N.coldDim`) : vitrine grise, croix éteinte ou qui grésille.
- **`PB.*`, PharmaBoost :**
  - la pharmacie qui brille : vitrine `PB.glow` / `PB.citron`, croix néon `PB.cross`, halo chaud sur le trottoir ;
  - les écrans ;
  - **or `PB.gold` = challenge seulement**.
- **Polices :** Plus Jakarta Sans (`JAKARTA` 800), JetBrains Mono (`MONO`).
- **Typographie française :**
  - espace insécable ` ` avant `: ; ! ?` ;
  - guillemets « » ;
  - accents justes ;
  - « e-mail ».

## 4. La vérité — non négociable

- **En ligne aujourd'hui :** la bannière du comptoir (le bon conseil quand une boîte est bipée, avec le stock), le bilan conseil envoyé au patient, le rappel avant la fin de sa cure.
- **Construit mais PAS sorti :** l'**appli patients** et les **offres de la pharmacie dans l'appli**. Il faut une **pastille « BIENTÔT »** visible pendant toute la scène C4, et toute vue de l'appli porte cette mention.
- **Aucune marque réelle, aucun laboratoire réel :**
  - boîtes génériques : « Amoxicilline 1 g », « Probiotique » ;
  - offres génériques : « −20 % sur la nouvelle gamme solaire », « 2e produit à −50 % » ;
  - le nom de la pharmacie est inventé et neutre : « Pharmacie du Centre ».
- **Aucun chiffre présenté comme réel.** Un montant ou un compteur montré est un exemple, avec la mention « Illustration · exemples » (`<Mention/>` de `src/presentation/motion/kit/mention.tsx`, à placer **sous** la bande du texte, par exemple en bas de la scène utile, petite).
- **Le pharmacien conseille et décide.** On ne dit jamais que l'IA choisit à sa place.
- **Rien de « gratuit », aucune promesse de santé.**
- **La pharmacie d'à côté** n'est jamais ridiculisée ni nommée : elle est seulement éteinte, et la scène est triste.

## 5. Ce qu'on reprend du film « Rembobinons » (même univers)

- **`src/rembobine/kit/screens.tsx` :** bannière du comptoir (`BannerHead`, `BannerCard`, `Chip`), `Phone`, `Notification`, `MailBilan`, `CalendarCure`, `AppHome` / `AppOffer` / `SoonBadge`, `PBLogo`, `Cursor`…
- **`src/rembobine/kit/decor.tsx` :** `Pharmacienne`, `Patient`, `MedBox`, `PharmacyBag`, `Douchette`, `Bubble`…
- **Comment les utiliser :** les importer directement (`import { BannerHead, Phone } from "../../rembobine/kit/screens"`), après avoir lu leurs en-têtes. **Ne pas les modifier.** Si l'un manque ou ne convient pas (format vertical), écrire la variante dans ta scène.
- **Leurs couleurs :** ces composants sont pensés sur fond clair ou vert. Sur la nuit, ils vivent **dans des cartes et des téléphones lumineux** qui flottent au-dessus de la rue, comme dans la vidéo de référence.

## 6. Les scènes

Ce sont des pistes fortes. L'histoire, les miroirs et la vérité ne bougent pas. Le kit `kit/city.tsx` (la rue) est partagé.

### C1 — La rue (0 → 11,25)

- **0 → 0,5 :** on ouvre dans la nuit, déjà en mouvement : la caméra descend lentement sur le quartier isométrique.
- **« Même rue » :** la rue apparaît. **« Deux pharmacies » :** les deux pharmacies, **côte à côte** dans la même rue, s'allument d'un même néon. Chacune a sa croix verte, et les deux sont pour l'instant identiques et neutres.
- **« Mêmes boîtes. Mêmes ordonnances. » :** au-dessus de chaque pharmacie flotte une petite étiquette identique, comme les étiquettes « Coupe 25 € » de la référence : une boîte, puis une ordonnance.
- **« Mais dans l'une, les patients reviennent. » :** la pharmacie de gauche **s'illumine** (vitrine citron, halo chaud sur le trottoir), et des passants (pilules colorées) arrivent et font la queue devant elle. L'autre reste froide, et un seul passant passe devant sans s'arrêter.
- **« Vous savez pourquoi ? » :** la caméra se rapproche de la pharmacie illuminée.
- **« Elle a un copilote. » :** au-dessus de sa vitrine, le petit robot PharmaBoost (`Mascot` ou `logo-robot.svg`) apparaît en pop, avec un éclat citron. La barre d'onglets apparaît (le film la pose à 9,3).
- **La sortie :** la caméra plonge dans la vitrine illuminée. C'est la transition vers C2.

### C2 — Le comptoir (10,75 → 18,75), onglet LE COMPTOIR

- **La mise en scène :** au-dessus d'un fond de rue flouté et assombri, une grande carte ou un écran de comptoir en perspective, dans le style « téléphone » de la référence.
- **« Une boîte scannée… » :** la douchette bipe une boîte « Amoxicilline 1 g » (`scanner-bip`, `scan-laser`).
- **« le bon conseil s'affiche au comptoir » :** la bannière arrive : « ① pour Amoxicilline 1 g → **Probiotique** », pastille « 12 en stock ».
- **« Le pharmacien est guidé » :** la pharmacienne (buste, souriante) et les questions et le discours qui se déroulent (`BannerCard`, onglets).
- **« Il conseille plus, et mieux. » :**
  - **« plus » :** un petit compteur « conseils vendus » qui passe de +1 à +2 (exemple) ;
  - **« mieux » :** une coche verte, et l'onglet « Discours ».
- **La mention :** « Illustration · exemples » si un chiffre est visible.

### C3 — Le patient (18,25 → 25,45), onglet LE PATIENT

- **« Le patient repart avec le vrai complément de son traitement » :** retour dans la rue illuminée. Le patient (pilule colorée, ou le `Patient` du décor en petit) sort avec son sac. Une loupe ou une vue « radio » montre DEUX boîtes : l'antibiotique et le Probiotique, avec l'étiquette « le vrai complément ».
- **« Ça fait pro. » :** un tampon net « PRO » ou une pastille de qualité. Élégant, pas criard.
- **« Son bilan conseil l'attend dans son téléphone » :** un téléphone arrive en perspective par-dessus la rue (`Phone`), avec une notification puis l'e-mail « Votre bilan conseil » (`MailBilan`) : le Probiotique, pourquoi avec votre traitement.

### C4 — L'appli (24,95 → 30,9), onglet L'APPLI

- **« Et bientôt » :** la pastille « **BIENTÔT** » citron claque et reste visible.
- **« dans l'appli » :** un téléphone qui montre l'appli PharmaBoost (`AppHome`).
- **« les offres de sa pharmacie » :** l'écran « Offres de votre pharmacie » (« Pharmacie du Centre ») avec des cartes d'offres, par exemple « −20 % sur la nouvelle gamme solaire » et « 2e produit à −50 % ». Exemples, aucune marque.
- **« sur ses gammes préférées » :** un cœur ou une étoile sur une gamme.
- **L'écran verrouillé** (comme dans la référence) : « Pharmacie du Centre — Nouvelle offre sur votre gamme ».

### C5 — Le cercle (30,4 → 35,85), onglet LE CERCLE

- **« Alors il revient. » :** dans la rue, le passant revient et rentre dans la pharmacie illuminée. Un petit « +1 visite » ou une flèche de retour.
- **« Nouveau passage, nouveau conseil. » :** un nouveau bip, et une nouvelle ligne de bannière qui pope au-dessus de la pharmacie.
- **« C'est un cercle. » :** **L'IMAGE FORTE DU FILM.** Un grand anneau lumineux citron se dessine autour de la pharmacie, avec 4 étapes qui s'allument tour à tour sur l'anneau, chacune avec un petit pictogramme :
  1. Le conseil au comptoir ;
  2. Le vrai complément ;
  3. Le bilan et les offres ;
  4. Il revient.

  Une comète de lumière fait le tour, et l'anneau se ferme sur « cercle » (34,39). Les sons : `orbite`, `scintillement`.

### C6 — À côté (35,35 → 41,5)

- **« Pendant ce temps, à côté… » :** la caméra glisse vers la pharmacie d'à côté. Tout devient froid et silencieux (la musique passe derrière une porte).
- **Les répliques :** une petite bulle grise au-dessus du comptoir d'à côté, « Il vous fallait autre chose ? » (37,45), puis « Non merci. » (40,05). Un passant ressort, sac à la main, une seule boîte, et s'en va dans la nuit.
- **Ensuite :** la vitrine d'à côté grésille (`neon` grave, ou `tele-off`), et la croix s'éteint vers 40,6.

### C7 — PharmaBoost (41,0 → 47,3)

- **« Ce copilote s'appelle… » :** le noir se fait, ou la caméra s'élève au-dessus du quartier. Un moment de suspense.
- **« PharmaBoost. » (43,00) :** le logo PharmaBoost (`PBLogo`, icône + mot) claque au centre de la scène utile, avec des particules citron et dorées (comme le carton de la référence), `impact-net`, `scintillement`, une onde.
- **« Et vous, quelle pharmacie voulez-vous être ? » :** les deux pharmacies reviennent côte à côte : l'une rayonne, l'autre est éteinte. Un petit curseur ou un halo hésite entre les deux, puis se pose sur celle qui brille.

### C8 — Le carton final (46,8 → 52,5)

- **Le fond :** noir-vert, avec une pluie de particules citron et dorées qui scintillent, comme le carton « Commentez CARTE » de la référence.
- **47,0 :** « **pharmaboost.app** » en très grand (citron, lueur), « Réservez votre démo » au-dessus, et le logo.
- **Les sons :** `impact-epique` doux, `scintillement`, `etincelle-magique`.
- **La fin :** on tient l'image, puis fondu au noir de 52,0 à 52,5.

## 7. Les bruitages

```ts
export const cues: Cue[] = [cue("scanner-bip", 11.24, 0.6), …]
```

- **Les noms :** ce sont les clés de `src/rembobine/kit/sfx-durees.json`, la bibliothèque partagée. La description des sons neufs se trouve dans `src/rembobine/tools/sons.mjs` (tableau `NEW`).
- **Les niveaux :**
  - 0,25 : discret ;
  - 0,5 : présent ;
  - 0,7 à 0,9 : un impact.
- **La voix passe toujours au-dessus.** La référence est sobre : un son par geste, sans bouillie.

## 8. Les règles du code

- **Le contrat :** un fichier par scène, `src/cercle/scenes/cN-*.tsx` (le nom est dans `timeline.ts`), qui exporte `Scene({ t })` et `cues`. `t` est le temps du film.
- **Ce qui est interdit :** `<Sequence>`, `Math.random`, `Date`. Pour le hasard, utiliser `hash` / `rnd`.
- **Le kit :** `import { … } from "../kit"`. **Ne pas modifier le kit, le kit de « Rembobinons », ni les autres scènes.**
- **Les performances :** au plus environ 12 éléments flous à la fois. Pas de milliers de nœuds DOM : un quartier, c'est quelques dizaines de blocs SVG.

## 9. Vérifier — obligatoire, plusieurs fois

Depuis `video/` :

```
node src/cercle/tools/planche.mjs C3                   # 8 images de la scène (scène seule, avec le grand texte)
node src/cercle/tools/planche.mjs C3 19.9 20.0 20.1    # ces temps précis
node src/cercle/tools/planche.mjs C3 --film            # dans le film entier (transitions) — à la fin seulement
node src/cercle/tools/types.mjs C3                     # zéro erreur de type dans SON fichier
```

- **À tour de rôle :** les planches et tsc passent deux à la fois au plus, et ce verrou est **partagé** avec le film « Rembobinons », qui se fabrique en même temps. Attendre sa place est normal.
- **Le disque est presque plein :** aucun gros fichier, aucun rendu vidéo.
- **Les planches :** `out/cercle/planches/<scène>.jpg`. **On les regarde** avec Read.
- **Ce qu'on contrôle :**
  - lisibilité ;
  - rien au-dessus de y = 580 qui gêne le grand texte ;
  - rien d'important sous y = 1480 ;
  - textes exacts ;
  - harmonie et fidélité au style de la référence ;
  - le mot dit = l'image montrée ;
  - aucune image vide ;
  - la transition de sortie.

## 10. La vidéo de référence — à REGARDER avant tout

`out/cercle/reference/` contient les images suivantes, à ouvrir avec Read :
- `planche-reference.jpg` : une image par seconde de toute la vidéo ;
- `deux-images-nettes.jpg` : la rue isométrique et le téléphone, en net ;
- `ref-*.jpg` : des moments clés (secondes 1,5, 4,5, 17,5, 20,5, 25, 29,5, 32,5 et 35,5).

Le texte de la référence : « Même rue, deux salons, même coupe, même prix. Mais l'un est toujours plein. Vous savez pourquoi ? Il a un système. Un scan au comptoir et la carte arrive dans son téléphone. Rien à télécharger. Elle passe devant le salon, la carte s'affiche sur son écran verrouillé et le salon peut lui écrire comme un SMS. Pendant ce temps, à côté, les cartes en carton finissent à la poubelle. Ce système s'appelle Loyalti. Et vous, quel salon voulez-vous être ? Commentez « carte », on vous prépare la vôtre gratuitement. »
